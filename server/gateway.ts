// Portal side of the Nerix SIP gateway contract (billing protocol 4).
// The Oracle gateway (gateway/*.js) sends signed events here. Money uses the existing
// Nerix prepaid wallet: credit is reserved when a call is admitted and settled when it ends.
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import type { DB, Query, Row } from './db.ts';
import { AppError, audit, id, rateFor } from './core.ts';
import { lockWallet, consume } from './wallet.ts';
import { verifyGatewayRequest } from '../shared/gateway-signature.js';
import { transferIntake, STAFF_ROLES, callbackPolicy, receptionFallback, staffRole } from '../shared/reception-rules.js';
import { callbackNumber } from '../shared/callback-number.js';
import { normalizeRealtimeUsage } from '../shared/usage-normalize.js';
import { isAfterHours } from '../shared/operating-hours.js';
import { buildReceptionInstructions, defaultGreeting, defaultSettings, VOICE_NAMES, type ReceptionSettings } from './reception.ts';
import { admissionBudget, renewBudget, settleBudget } from './voice-math.ts';
import { queueEmail, callbackEmail } from './email.ts';

export interface GatewayConfig { enabled: boolean; secret: string; maxTransfers: number; appOrigin?: string }
export class GatewayError extends Error { constructor(public status: number, public reason: string) { super(reason); } }
const bad = (status: number, reason: string) => new GatewayError(status, reason);
const E164 = /^\+[1-9]\d{6,14}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidOf = (v: unknown) => { if (typeof v !== 'string' || !UUID.test(v)) throw bad(400, 'invalid_identifier'); return v.toLowerCase(); };
const text = (v: unknown, max: number, required = false) => { const t = typeof v === 'string' ? v.trim() : ''; if (required && !t) throw bad(400, 'invalid_field'); if (t.length > max) throw bad(400, 'invalid_field'); return t; };
const phone = (v: unknown, required = false) => { const p = typeof v === 'string' ? v.trim() : ''; if (!p) { if (required) throw bad(400, 'invalid_phone'); return null; } if (p.length > 20 || !E164.test(p)) throw bad(400, 'invalid_phone'); return p; };
const EVENT_TYPES = ['authorize', 'usage', 'connected', 'heartbeat', 'save_callback', 'transfer_request', 'transfer_answered', 'transfer_accepted', 'transfer_connected', 'transfer_failed', 'ended'];

// ---------- settings ----------
export function mapSettings(r: Row | undefined, fallbackName: string): ReceptionSettings {
  const d = defaultSettings(fallbackName);
  if (!r) return d;
  const business = r.business_name || fallbackName, assistant = r.assistant_name || d.assistantName;
  return { assistantName: assistant, businessName: business, businessType: r.business_type || '', greeting: r.greeting || defaultGreeting(business, assistant),
    voice: (VOICE_NAMES as readonly string[]).includes(r.voice) ? r.voice : 'marin', language: r.language || 'en-GB', about: r.about || '', knowledge: r.knowledge || '', policies: r.policies || '',
    emergency: r.emergency || '', afterHoursNote: r.after_hours_note || '', weeklyHours: r.weekly_hours ?? null, fallbackPhone: r.fallback_phone ?? null, publicNumbers: r.public_numbers || [],
    transferTargets: r.transfer_targets || [], transfersEnabled: r.transfers_enabled !== false, callbacksEnabled: r.callbacks_enabled !== false, notifyEmails: r.notify_emails || [],
    service: r.service === 'advanced' ? 'advanced' : 'basic', configurationVersion: Number(r.configuration_version) || 0 };
}
export async function loadSettings(q: Query, org: string, location: string, fallbackName: string) {
  return mapSettings((await q.query('SELECT * FROM reception_settings WHERE org_id=$1 AND location_id=$2', [org, location])).rows[0], fallbackName);
}
export const targetsFor = (s: ReceptionSettings) => [
  ...(s.fallbackPhone ? [{ id: 'reception', name: 'Reception team', phone: s.fallbackPhone as string | null, role: 'receptionist', defaultForRole: false }] : []),
  ...s.transferTargets.map(t => ({ id: t.id, name: t.name, phone: (t.phone ?? null) as string | null, role: staffRole(t), defaultForRole: t.defaultForRole === true }))
];
function countryFor(timezone: string, language: string): string | null {
  if (timezone === 'Asia/Karachi') return 'PK'; if (timezone === 'Europe/London') return 'GB';
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)$/.test(timezone)) return 'US';
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)$/.test(timezone)) return 'CA';
  return ({ 'en-GB': 'GB', 'en-US': 'US', 'en-CA': 'CA' } as Record<string, string>)[language] || null;
}
function hoursState(s: ReceptionSettings, timezone: string): boolean | null { try { return isAfterHours(s.weeklyHours, timezone); } catch { return null; } }

// ---------- prepaid ----------
async function monthlySpend(c: Query, org: string, col: 'company_id' | 'location_id', value: string) {
  const r = (await c.query(`SELECT COALESCE((SELECT sum(charge+reserved) FROM inbound_calls WHERE org_id=$1 AND ${col}=$2 AND created_at>=date_trunc('month',now())),0)
    + COALESCE((SELECT sum(c.charge+c.reserved) FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1 AND l.${col}=$2 AND c.created_at>=date_trunc('month',now())),0) AS used`, [org, value])).rows[0];
  return Number(r.used);
}
/** Frees credit held by calls that were admitted but never connected. Caller must hold the wallet lock. */
async function releaseStale(c: Query, org: string) {
  const r = (await c.query(`WITH s AS (SELECT id,reserved FROM inbound_calls WHERE org_id=$1 AND ended_at IS NULL AND status='initiated' AND connected_at IS NULL AND started_at<now()-interval '2 minutes' FOR UPDATE),
    u AS (UPDATE inbound_calls i SET status='failed',outcome='failed',ended_reason='gateway_never_connected',ended_at=now(),last_activity_at=now(),reserved=0,funded_seconds=0 FROM s WHERE i.id=s.id RETURNING s.reserved AS old)
    SELECT COALESCE(sum(old),0) AS total FROM u`, [org])).rows[0];
  if (Number(r.total) > 0) await c.query('UPDATE wallets SET reserved=GREATEST(0,reserved-$1) WHERE org_id=$2', [Number(r.total), org]);
}
export async function sweepInbound(db: DB) {
  const orgs = (await db.query("SELECT DISTINCT org_id FROM inbound_calls WHERE ended_at IS NULL AND status='initiated' AND connected_at IS NULL AND started_at<now()-interval '2 minutes'")).rows;
  for (const o of orgs) await db.transaction(async c => { await lockWallet(c, o.org_id); await releaseStale(c, o.org_id); });
  await db.query("DELETE FROM gateway_events WHERE created_at<now()-interval '30 days'");
}
async function renew(c: Query, call: Row) {
  if (!call.billing_enabled) return { enabled: false, seconds: 3500, stop: false, detached: !!call.sarah_left_at };
  const w = await lockWallet(c, call.org_id);
  const end = call.sarah_left_at ? new Date(call.sarah_left_at).getTime() : Date.now();
  const elapsed = Math.max(0, Math.ceil((end - new Date(call.connected_at || call.started_at).getTime()) / 1000));
  const r = renewBudget({ rate: Number(call.rate), fundedSeconds: Number(call.funded_seconds), elapsedSeconds: elapsed, detached: !!call.sarah_left_at,
    availableExcludingThisCall: w.paid + w.bonus - (w.reserved - Number(call.reserved)) });
  await c.query('UPDATE wallets SET reserved=reserved-$1+$2 WHERE org_id=$3', [Number(call.reserved), r.reserve, call.org_id]);
  await c.query('UPDATE inbound_calls SET reserved=$1,funded_seconds=$2 WHERE id=$3', [r.reserve, r.seconds, call.id]);
  return { enabled: true, seconds: r.seconds, stop: r.stop, detached: r.detached };
}
async function settle(c: Query, call: Row, actualSeconds: number, failed: boolean) {
  if (!call.billing_enabled) {
    await c.query('UPDATE inbound_calls SET reserved=0,billable_seconds=$2,charge=0,unfunded_seconds=0 WHERE id=$1', [call.id, failed ? 0 : actualSeconds]);
    return { billableSeconds: failed ? 0 : actualSeconds, charge: 0, unfundedSeconds: 0 };
  }
  await lockWallet(c, call.org_id);
  const s = settleBudget({ rate: Number(call.rate), fundedSeconds: Number(call.funded_seconds), actualSeconds, failed });
  if (s.charge > 0) await consume(c, call.org_id, s.charge, Number(call.reserved), `inbound:${call.id}`, { callId: call.id, seconds: s.billable, rate: Number(call.rate), inbound: true });
  else if (Number(call.reserved) > 0) await c.query('UPDATE wallets SET reserved=GREATEST(0,reserved-$1) WHERE org_id=$2', [Number(call.reserved), call.org_id]);
  await c.query('UPDATE inbound_calls SET reserved=0,billable_seconds=$2,charge=$3,unfunded_seconds=$4 WHERE id=$1', [call.id, s.billable, s.charge, s.unfunded]);
  return { billableSeconds: s.billable, charge: s.charge, unfundedSeconds: s.unfunded };
}

// ---------- authorize ----------
async function authorize(c: Query, b: Row, cfg: GatewayConfig) {
  const providerCallId = text(b.providerCallId, 160, true), did = phone(b.calledNumber, true)!;
  let caller: string | null = null; try { caller = phone(b.callerPhone); } catch { caller = null; }   // a malformed caller ID must not reject the call
  const n0 = (await c.query("SELECT org_id FROM phone_numbers WHERE e164=$1 AND status<>'released'", [did])).rows[0];
  if (!n0) throw bad(404, 'inbound_route_unavailable');
  await lockWallet(c, n0.org_id);                 // same lock order as funding and settlement
  await releaseStale(c, n0.org_id);
  const wallet = await lockWallet(c, n0.org_id);
  const row = (await c.query(`SELECT n.id AS number_id,n.org_id,n.company_id,n.location_id,n.status AS number_status,n.included_channels,n.extra_channels,
      o.name AS org_name,o.paused,o.is_demo,o.billing_mode,co.name AS company_name,co.monthly_cap AS company_cap,l.name AS location_name,l.timezone,l.monthly_cap AS location_cap
    FROM phone_numbers n JOIN organizations o ON o.id=n.org_id JOIN companies co ON co.id=n.company_id AND co.org_id=n.org_id JOIN locations l ON l.id=n.location_id AND l.org_id=n.org_id
    WHERE n.id=(SELECT id FROM phone_numbers WHERE e164=$1 AND status<>'released') FOR UPDATE OF n`, [did])).rows[0];
  if (!row) throw bad(404, 'inbound_route_unavailable');
  if ((await c.query('SELECT 1 FROM inbound_calls WHERE provider_call_id=$1', [providerCallId])).rows.length) throw bad(409, 'provider_call_already_exists');
  const deny = (reason: string) => ({ ok: true, allowed: false, reason });
  const internal = row.billing_mode === 'internal';
  if (row.paused || row.number_status !== 'active') return deny('service_unavailable');
  if (row.is_demo && !internal) return deny('demo_workspace');
  const settings = await loadSettings(c, row.org_id, row.location_id, row.company_name);
  const open = Number((await c.query('SELECT COUNT(*) AS n FROM inbound_calls WHERE phone_number_id=$1 AND ended_at IS NULL', [row.number_id])).rows[0].n);
  if (open >= Number(row.included_channels) + Number(row.extra_channels)) return deny('channels_busy');
  let rate = 0, rateSource = '', seconds = 3500, reserve = 0;
  if (!internal) {
    if (Number(b.billingProtocol) !== 4) return deny('gateway_update_required');
    const price = await rateFor(c, row.org_id, settings.service);
    if (!(price.rate > 0)) return deny('commercial_rate_not_configured');
    rate = price.rate; rateSource = price.source;
    const budget = admissionBudget(wallet.paid + wallet.bonus - wallet.reserved, rate);
    if (!budget.allowed) return deny('wallet_funding_required');
    seconds = budget.seconds; reserve = budget.reserve;
    if (row.company_cap !== null && await monthlySpend(c, row.org_id, 'company_id', row.company_id) + reserve > Number(row.company_cap)) return deny('spending_cap_reached');
    if (row.location_cap !== null && await monthlySpend(c, row.org_id, 'location_id', row.location_id) + reserve > Number(row.location_cap)) return deny('spending_cap_reached');
    await c.query('UPDATE wallets SET reserved=reserved+$1 WHERE org_id=$2', [reserve, row.org_id]);
  }
  const afterHours = hoursState(settings, row.timezone), callId = id();
  await c.query(`INSERT INTO inbound_calls(id,org_id,company_id,location_id,phone_number_id,provider_call_id,caller_phone,called_phone,caller_id_source,after_hours,service,rate,rate_source,billing_enabled,reserved,funded_seconds,configuration_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [callId, row.org_id, row.company_id, row.location_id, row.number_id, providerCallId, caller, did, caller ? 'caller_id' : 'withheld', afterHours, settings.service, rate, rateSource, !internal, reserve, internal ? 0 : seconds, settings.configurationVersion]);
  await audit(c, null, row.org_id, 'gateway.authorize', { callId, location: row.location_id });
  const targets = settings.transfersEnabled ? targetsFor(settings) : [];
  return { ok: true, allowed: true, protocolVersion: 4, callId, workspaceKey: row.org_id, locationKey: row.location_id, locationName: row.location_name, calledNumber: did,
    assistantName: settings.assistantName, greeting: settings.greeting, voice: settings.voice, afterHours, configurationVersion: settings.configurationVersion,
    callbackContext: { defaultCountry: countryFor(row.timezone, settings.language) },
    transferTargets: targets.map(t => ({ id: t.id, name: t.name, role: t.role, hasPhone: !!t.phone, defaultForRole: t.defaultForRole })),
    instructions: buildReceptionInstructions(settings, { locationName: row.location_name, timezone: row.timezone, afterHours }),
    patientFeatures: { enabled: false, capabilities: [], services: [], approvedAnswers: [], paymentLinks: false },
    prepaid: { enabled: !internal, seconds, stop: false, detached: false }, fallback: { type: 'reject' } };
}

// ---------- callbacks ----------
async function saveCallback(c: Query, call: Row, b: Row, cfg: GatewayConfig) {
  const settings = (await c.query('SELECT callbacks_enabled,notify_emails FROM reception_settings WHERE org_id=$1 AND location_id=$2', [call.org_id, call.location_id])).rows[0];
  if (settings && settings.callbacks_enabled === false) throw bad(403, 'callbacks_not_enabled');
  const intake = transferIntake({ ...b, callerDetailsConfirmed: b.callbackDetailsConfirmed }, { maxReason: 1200 });
  if (!intake.ok) throw bad(400, intake.reason);
  const loc = (await c.query('SELECT l.name AS location,l.timezone,c.name AS company FROM locations l JOIN companies c ON c.id=l.company_id WHERE l.id=$1 AND l.org_id=$2', [call.location_id, call.org_id])).rows[0];
  const lang = (await c.query('SELECT language FROM reception_settings WHERE org_id=$1 AND location_id=$2', [call.org_id, call.location_id])).rows[0]?.language || 'en-GB';
  const prepared = callbackNumber(b, { callerPhone: call.caller_phone, defaultCountry: countryFor(loc?.timezone || '', lang) });
  if (!prepared.ok) throw bad(400, prepared.reason);
  const prior = (await c.query('SELECT COALESCE(requested_target_name,target_name) AS target_name,COALESCE(requested_target_role,target_role) AS target_role,caller_type,caller_company_name FROM inbound_transfers WHERE call_id=$1 ORDER BY requested_at DESC,id DESC LIMIT 1', [call.id])).rows[0];
  const recipient = prior?.target_name || text(b.requestedRecipient || '', 100), role = prior?.target_role || b.requestedRole || null;
  if (role && !STAFF_ROLES.includes(role)) throw bad(400, 'invalid_staff_role');
  const kind = prior?.caller_type === 'sales' ? 'sales' : intake.callerType, company = (b.companyName === undefined ? prior?.caller_company_name : intake.companyName) || null;
  const existing = (await c.query('SELECT id,task_id FROM callback_requests WHERE call_id=$1', [call.id])).rows[0];
  let callbackId = existing?.id as string | undefined;
  if (existing) {
    await c.query('UPDATE callback_requests SET caller_name=$2,caller_phone=$3,reason=$4,caller_type=$5,caller_company_name=$6,requested_recipient=$7,requested_role=$8,updated_at=now() WHERE id=$1',
      [existing.id, intake.callerName, prepared.callbackPhone, intake.reason, kind, company, recipient || null, role]);
  } else {
    callbackId = id(); const taskId = id();
    await c.query(`INSERT INTO tasks(id,org_id,company_id,location_id,kind,title,notes) VALUES($1,$2,$3,$4,'callback',$5,$6)`,
      [taskId, call.org_id, call.company_id, call.location_id, `Call back ${intake.callerName}`.slice(0, 200), `${prepared.callbackPhone} · ${intake.reason}`.slice(0, 1500)]);
    await c.query(`INSERT INTO callback_requests(id,org_id,company_id,location_id,call_id,task_id,caller_name,caller_phone,reason,caller_type,caller_company_name,requested_recipient,requested_role)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [callbackId, call.org_id, call.company_id, call.location_id, call.id, taskId, intake.callerName, prepared.callbackPhone, intake.reason, kind, company, recipient || null, role]);
    const emails: string[] = settings?.notify_emails || [];
    for (const to of emails.slice(0, 5)) await queueEmail(c, { orgId: call.org_id, kind: 'callback', to, ...callbackEmail({ business: loc?.company || '', location: loc?.location || '', callerName: intake.callerName, phone: prepared.callbackPhone,
      reason: intake.reason, callerType: kind, company, recipient: recipient || null, link: cfg.appOrigin || '' }) });
  }
  await c.query("UPDATE inbound_calls SET outcome='callback_required',last_activity_at=now() WHERE id=$1", [call.id]);
  return { ok: true, callbackId };
}

// ---------- transfers ----------
function trustedEventTime(call: Row, b: Row) {
  if (!b.occurredAt) return new Date();
  const t = new Date(b.occurredAt), start = new Date(call.connected_at || call.started_at);
  if (!Number.isFinite(+t) || +t < +start - 2000 || +t > Date.now() + 5000 || +t > +new Date(call.started_at) + 4 * 3600000) throw bad(400, 'invalid_gateway_event_time');
  return new Date(Math.max(+t, +start));
}
async function transferEvent(c: Query, call: Row, b: Row, cfg: GatewayConfig) {
  if (!call.connected_at || call.sarah_left_at) throw bad(409, 'transfer_not_available');
  const settings = await loadSettings(c, call.org_id, call.location_id, '');
  if (b.type === 'transfer_request') {
    if (!settings.transfersEnabled) throw bad(403, 'transfers_not_enabled');
    const directory = targetsFor(settings), target = directory.find(t => t.id === b.targetId);
    if (!target || !target.phone || target.phone === call.called_phone) throw bad(403, 'transfer_target_not_configured');
    if (settings.publicNumbers.includes(target.phone) || (await c.query('SELECT 1 FROM phone_numbers WHERE e164=$1', [target.phone])).rows.length) throw bad(403, 'transfer_loop_blocked');
    const withFlag = directory.map(t => ({ ...t, hasPhone: !!t.phone }));
    let requested: (typeof directory)[number] | undefined;
    if (b.requestedTargetId) {
      requested = directory.find(t => t.id === b.requestedTargetId);
      const fb = receptionFallback(withFlag);
      if (!requested || requested.phone || requested.name !== b.requestedTargetName || fb?.id !== target.id || b.fallbackConfirmed !== true) return { ok: true, available: false, reason: 'staff_directory_changed' };
    }
    let unresolvedName: string | null = null, unresolvedRole: string | null = null;
    if (b.frontDeskFallback === true && !requested) {
      const fb = receptionFallback(withFlag);
      if (fb?.id !== target.id || b.fallbackConfirmed !== true) return { ok: true, available: false, reason: 'front_desk_confirmation_required' };
      unresolvedName = text(b.requestedRecipient || b.requestedRole || '', 100) || null; unresolvedRole = b.requestedRole || 'other';
      if (!STAFF_ROLES.includes(unresolvedRole!)) throw bad(400, 'invalid_staff_role');
    }
    const policy = callbackPolicy((await c.query('SELECT status,caller_type FROM inbound_transfers WHERE call_id=$1', [call.id])).rows as any);
    if (policy.callbackOnly || policy.afterFailure && (target.role !== 'receptionist' || b.alternativeRequested !== true)) return { ok: true, available: false, reason: 'callback_required_after_transfer', callbackOnly: policy.callbackOnly };
    const intake = transferIntake(b); if (!intake.ok) throw bad(400, intake.reason);
    if (b.targetName !== target.name) return { ok: true, available: false, reason: 'staff_directory_changed' };   // a live-call directory edit must not redirect the caller
    if ((await c.query("SELECT 1 FROM inbound_transfers WHERE call_id=$1 AND status IN ('requested','consulting','accepted','connected')", [call.id])).rows.length) throw bad(409, 'transfer_already_in_progress');
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('nerix:transfer-capacity',0))");
    const active = Number((await c.query("SELECT COUNT(*) AS n FROM inbound_transfers t JOIN inbound_calls a ON a.id=t.call_id WHERE a.ended_at IS NULL AND t.status IN ('requested','consulting','accepted','connected')")).rows[0].n);
    if (active >= cfg.maxTransfers) return { ok: true, available: false, reason: 'transfer_capacity_unavailable' };
    const transferId = id();
    await c.query(`INSERT INTO inbound_transfers(id,org_id,call_id,target_key,target_name,target_role,target_phone,caller_name,reason,caller_type,caller_company_name,requested_target_key,requested_target_name,requested_target_role,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'requested')`,
      [transferId, call.org_id, call.id, target.id, target.name, target.role, target.phone, intake.callerName, intake.reason, intake.callerType, intake.companyName || null, requested?.id || null, requested?.name || unresolvedName, requested ? staffRole(requested) : unresolvedRole]);
    return { ok: true, available: true, transferId, targetPhone: target.phone, targetName: target.name, targetRole: target.role, requestedTargetName: requested?.name || null };
  }
  const transfer = (await c.query('SELECT * FROM inbound_transfers WHERE id=$1 AND call_id=$2 FOR UPDATE', [uuidOf(b.transferId), call.id])).rows[0];
  if (!transfer) throw bad(404, 'transfer_not_found');
  if (b.type === 'transfer_failed') {
    if (!['requested', 'consulting', 'accepted'].includes(transfer.status)) throw bad(409, 'transfer_not_pending');
    if (!['failed', 'declined', 'no_answer'].includes(b.status)) throw bad(400, 'invalid_transfer_outcome');
    await c.query('UPDATE inbound_transfers SET status=$2,ended_at=now(),updated_at=now() WHERE id=$1', [transfer.id, b.status]);
  } else if (b.type === 'transfer_answered') {
    if (transfer.status !== 'requested') throw bad(409, 'transfer_not_requested');
    await c.query("UPDATE inbound_transfers SET status='consulting',staff_answered_at=now(),updated_at=now() WHERE id=$1", [transfer.id]);
  } else if (b.type === 'transfer_accepted') {
    if (transfer.status !== 'consulting') throw bad(409, 'transfer_not_consulting');
    await c.query("UPDATE inbound_transfers SET status='accepted',accepted_at=now(),updated_at=now() WHERE id=$1", [transfer.id]);
  } else {
    if (transfer.status !== 'accepted') throw bad(409, 'staff_acceptance_required');
    const at = trustedEventTime(call, b).toISOString();
    await c.query("UPDATE inbound_transfers SET status='connected',sarah_left_at=$2::timestamptz,updated_at=now() WHERE id=$1", [transfer.id, at]);
    await c.query("UPDATE inbound_calls SET status='transferred',outcome='transferred',sarah_left_at=$2::timestamptz,last_activity_at=now() WHERE id=$1", [call.id, at]);
  }
  return { ok: true, callId: call.id, transferId: transfer.id };
}

// ---------- usage + end ----------
async function recordUsage(c: Query, call: Row, b: Row) {
  const responseId = text(b.responseId, 160, true), model = text(b.model, 80, true), leg = b.leg === 'staff' ? 'staff' : 'caller';
  let usage; try { usage = normalizeRealtimeUsage(b.usage); } catch { throw bad(400, 'invalid_voice_usage'); }
  const ins = await c.query('INSERT INTO inbound_usage_events(id,org_id,call_id,provider_event_id,model,usage_data) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(call_id,provider_event_id) DO NOTHING RETURNING id', [id(), call.org_id, call.id, `${leg}:${responseId}`, model, JSON.stringify(usage)]);
  if (ins.rows.length) {
    const totals = (await c.query('SELECT token_totals FROM inbound_calls WHERE id=$1', [call.id])).rows[0].token_totals || {};
    const t = totals[leg] || { input: 0, output: 0, audioIn: 0, audioOut: 0, cached: 0, responses: 0 };
    t.input += usage.input_tokens; t.output += usage.output_tokens; t.audioIn += usage.input_token_details.audio_tokens; t.audioOut += usage.output_token_details.audio_tokens; t.cached += usage.input_token_details.cached_tokens; t.responses += 1;
    totals[leg] = t;
    await c.query('UPDATE inbound_calls SET token_totals=$2::jsonb,realtime_model=$3 WHERE id=$1', [call.id, JSON.stringify(totals), model]);
  }
  return { ok: true, callId: call.id };
}
const OUTCOMES = ['unknown', 'information_only', 'callback_required', 'emergency_escalation', 'failed', 'disconnected', 'transferred'];
async function finalize(c: Query, call: Row, b: Row) {
  const endedAt = trustedEventTime(call, b).toISOString();
  const outcome = OUTCOMES.includes(b.outcome || 'unknown') ? (b.outcome || 'unknown') : (() => { throw bad(400, 'invalid_outcome'); })();
  if (outcome === 'transferred' && !call.sarah_left_at) throw bad(409, 'transfer_not_confirmed');
  if (outcome === 'callback_required' && call.outcome !== 'callback_required') throw bad(409, 'callback_not_saved');
  const r = (await c.query(`UPDATE inbound_calls SET ended_at=$4::timestamptz,
      status=CASE WHEN connected_at IS NULL THEN 'missed' WHEN $2='failed' THEN 'failed' ELSE 'completed' END,
      outcome=CASE WHEN connected_at IS NULL THEN 'missed' WHEN outcome='callback_required' THEN outcome ELSE $2 END,
      total_duration_ms=GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($4::timestamptz-started_at))*1000)),
      ai_connected_ms=CASE WHEN connected_at IS NULL THEN 0 ELSE GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (COALESCE(sarah_left_at,$4::timestamptz)-connected_at))*1000)) END,
      ended_reason=$3,last_activity_at=now() WHERE id=$1 RETURNING *`, [call.id, outcome, text(b.reason || 'gateway_ended', 100), endedAt])).rows[0];
  if (call.sarah_left_at) await c.query(`UPDATE inbound_transfers SET status='completed',ended_at=$2::timestamptz,caller_staff_duration_ms=GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($2::timestamptz-sarah_left_at))*1000)),updated_at=now() WHERE call_id=$1 AND status='connected'`, [call.id, endedAt]);
  await c.query("UPDATE inbound_transfers SET status='failed',ended_at=$2::timestamptz,updated_at=now() WHERE call_id=$1 AND status IN ('requested','consulting','accepted')", [call.id, endedAt]);
  const actual = r.status !== 'failed' ? Math.ceil(Number(r.ai_connected_ms) / 1000) : 0;
  const s = await settle(c, r, actual, r.status === 'failed');
  return { ok: true, callId: call.id, ...s };
}

// ---------- dispatcher ----------
export async function processGatewayEvent(db: DB, body: Row, requestHash: string, cfg: GatewayConfig) {
  const eventId = text(body.eventId, 160, true), type = body.type;
  if (!EVENT_TYPES.includes(type)) throw bad(400, 'invalid_event_type');
  return db.transaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [eventId]);
    const prior = (await c.query('SELECT request_hash,result FROM gateway_events WHERE event_id=$1', [eventId])).rows[0];
    if (prior) { if (prior.request_hash !== requestHash) throw bad(409, 'idempotency_conflict'); return prior.result; }
    let result: Row, callId: string | null = null;
    if (type === 'authorize') { result = await authorize(c, body, cfg); callId = result.callId ?? null; }
    else {
      callId = uuidOf(body.callId);
      const identity = (await c.query('SELECT org_id,provider_call_id FROM inbound_calls WHERE id=$1', [callId])).rows[0];
      if (!identity || identity.provider_call_id !== body.providerCallId) throw bad(404, 'gateway_call_not_found');
      await lockWallet(c, identity.org_id);       // match admission and funding lock order
      const call = (await c.query('SELECT * FROM inbound_calls WHERE id=$1 FOR UPDATE', [callId])).rows[0];
      if (!call || call.provider_call_id !== body.providerCallId) throw bad(404, 'gateway_call_not_found');
      if (call.ended_at && type !== 'usage') throw bad(409, 'call_already_ended');
      if (type === 'usage') result = await recordUsage(c, call, body);
      else if (type === 'connected') {
        if (call.status !== 'initiated' || Date.now() - new Date(call.started_at).getTime() > 120000) throw bad(409, 'call_not_connectable');
        await c.query("UPDATE inbound_calls SET status='connected',connected_at=now(),last_activity_at=now() WHERE id=$1", [callId]); result = { ok: true, callId };
      } else if (type === 'save_callback') {
        if (!call.connected_at) throw bad(409, 'call_not_connected');
        result = await saveCallback(c, call, body, cfg);
      } else if (type === 'heartbeat') {
        await c.query('UPDATE inbound_calls SET last_activity_at=now() WHERE id=$1', [callId]); result = { ok: true, callId, prepaid: await renew(c, call) };
      } else if (type.startsWith('transfer_')) {
        result = await transferEvent(c, call, body, cfg);
        if (type === 'transfer_connected') await renew(c, (await c.query('SELECT * FROM inbound_calls WHERE id=$1', [callId])).rows[0]);
      } else result = await finalize(c, call, body);
      await audit(c, null, call.org_id, 'gateway.' + type, { callId });
    }
    await c.query('INSERT INTO gateway_events(event_id,request_hash,call_id,result) VALUES($1,$2,$3,$4::jsonb)', [eventId, requestHash, callId, JSON.stringify(result)]);
    return result;
  });
}

export function registerGateway(app: Express, db: DB, cfg: GatewayConfig) {
  app.post('/api/gateway/events', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!cfg.enabled) return void res.status(503).json({ ok: false, reason: 'gateway_not_enabled' });
      const raw: Buffer = (req as any).rawBody || Buffer.alloc(0);
      const v = verifyGatewayRequest({ secret: cfg.secret, timestamp: req.get('X-Nerix-Timestamp') || '', signature: req.get('X-Nerix-Signature') || '', raw });
      if (!v.ok) return void res.status(v.status).json({ ok: false, reason: v.reason });
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return void res.status(400).json({ ok: false, reason: 'invalid_body' });
      res.json(await processGatewayEvent(db, req.body, createHash('sha256').update(raw).digest('hex'), cfg));
    } catch (e: any) {
      if (e instanceof GatewayError) return void res.status(e.status).json({ ok: false, reason: e.reason });
      if (e instanceof AppError) return void res.status(e.status).json({ ok: false, reason: e.message });
      console.error('Gateway event failed:', e?.code || e?.name || 'error');
      res.status(500).json({ ok: false, reason: 'gateway_internal_error' });
    }
  });
}
