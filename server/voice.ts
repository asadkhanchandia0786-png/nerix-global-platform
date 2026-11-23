// Dashboard API for the inbound AI receptionist: numbers, per-location settings, call log, callbacks.
// Also hosts the password-reset routes that use Resend.
import type { Express, Request } from 'express';
import { z } from 'zod';
import type { DB } from './db.ts';
import { Auth, scopeSQL, checkScope, hash, randomToken, hashPassword } from './auth.ts';
import { audit, id, need, text, email, uuid } from './core.ts';
import { loadSettings, targetsFor, type GatewayConfig } from './gateway.ts';
import { buildReceptionInstructions, LANGUAGES, VOICE_NAMES } from './reception.ts';
import { validateHours, isAfterHours } from '../shared/operating-hours.js';
import { STAFF_ROLES } from '../shared/reception-rules.js';
import { queueEmail, resetEmail, emailEnabled } from './email.ts';

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'Use international format, for example +442079460100.');
const optionalE164 = z.union([e164, z.literal(''), z.null()]).optional().transform(v => v || null);
const target = z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/, 'Staff IDs use lowercase letters, numbers, - or _.'), name: text(100), phone: optionalE164,
  role: z.enum(STAFF_ROLES as [string, ...string[]]).default('staff'), defaultForRole: z.boolean().default(false) });
const settingsBody = z.object({
  assistantName: text(60), businessName: text(120), businessType: z.string().trim().max(120).default(''), greeting: z.string().trim().max(400).default(''),
  voice: z.enum(VOICE_NAMES), language: z.enum(LANGUAGES as [string, ...string[]]),
  about: z.string().trim().max(3000).default(''), knowledge: z.string().trim().max(12000).default(''), policies: z.string().trim().max(6000).default(''),
  emergency: z.string().trim().max(1500).default(''), afterHoursNote: z.string().trim().max(1500).default(''),
  weeklyHours: z.any().default(null), fallbackPhone: optionalE164, publicNumbers: z.array(e164).max(10).default([]),
  transferTargets: z.array(target).max(20).default([]), transfersEnabled: z.boolean().default(true), callbacksEnabled: z.boolean().default(true),
  notifyEmails: z.array(email).max(5).default([]), service: z.enum(['basic', 'advanced']).default('basic')
});

export function registerVoice(app: Express, db: DB, auth: Auth, cfg: GatewayConfig) {
  const orgId = (req: Request) => uuid.parse(req.params.org);
  const platformOwner = (a: { internal: boolean; role: string }) => need(a.internal && a.role === 'owner', 403, 'Numbers are assigned by the Nerix administrator.');

  app.get('/api/org/:org/voice/numbers', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'calls'), p: any[] = [org];
    const numbers = (await db.query(`SELECT n.*,l.name AS location_name,l.timezone,c.name AS company_name FROM phone_numbers n JOIN locations l ON l.id=n.location_id AND l.org_id=n.org_id
      JOIN companies c ON c.id=n.company_id AND c.org_id=n.org_id WHERE n.org_id=$1 AND n.status<>'released'${scopeSQL(a, p, 'n.')} ORDER BY c.name,l.name`, p)).rows;
    let routes: Record<string, any> = {};
    if (a.internal && a.role === 'owner') {
      const s = (await db.query('SELECT location_id,public_numbers,fallback_phone,transfer_targets FROM reception_settings WHERE org_id=$1', [org])).rows;
      routes = Object.fromEntries(numbers.map(n => { const r = s.find(x => x.location_id === n.location_id);
        const staff = [...(r?.fallback_phone ? [r.fallback_phone] : []), ...((r?.transfer_targets || []).map((t: any) => t.phone).filter(Boolean))];
        return [n.id, { did: n.e164, trunk: 'vs-forward', outboundTrunk: 'vs-payg', workspaceKey: n.org_id, locationKey: n.location_id, publicNumbers: r?.public_numbers || [], inboundAliases: [], transferNumbers: [...new Set(staff)], callerIdVerified: false }]; }));
    }
    res.json({ numbers: numbers.map(n => ({ ...n, route: routes[n.id] || null })), gatewayEnabled: cfg.enabled, emailEnabled: emailEnabled() });
  });
  app.post('/api/org/:org/voice/numbers', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'settings', true); platformOwner(a);
    const b = z.object({ locationId: uuid, e164, label: z.string().trim().max(80).default(''), includedChannels: z.number().int().min(1).max(20).default(2), extraChannels: z.number().int().min(0).max(20).default(0) }).parse(req.body);
    const loc = (await db.query('SELECT id,company_id FROM locations WHERE id=$1 AND org_id=$2', [b.locationId, org])).rows[0]; need(loc, 400, 'Choose a location in this workspace.');
    const nid = id();
    await db.query('INSERT INTO phone_numbers(id,org_id,company_id,location_id,e164,label,included_channels,extra_channels) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [nid, org, loc.company_id, loc.id, b.e164, b.label, b.includedChannels, b.extraChannels]);
    await audit(db, a.user.id, org, 'voice.number_assigned', { location: loc.id, number: b.e164 }); res.json({ id: nid });
  });
  app.patch('/api/org/:org/voice/numbers/:number', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'settings', true); platformOwner(a);
    const b = z.object({ status: z.enum(['active', 'paused', 'released']).optional(), label: z.string().trim().max(80).optional(), includedChannels: z.number().int().min(1).max(20).optional(), extraChannels: z.number().int().min(0).max(20).optional() }).parse(req.body);
    const nid = uuid.parse(req.params.number);
    if (b.status === 'released') need(!(await db.query('SELECT 1 FROM inbound_calls WHERE phone_number_id=$1 AND ended_at IS NULL', [nid])).rows.length, 409, 'Wait for active calls to finish before releasing this number.');
    const r = await db.query('UPDATE phone_numbers SET status=COALESCE($3,status),label=COALESCE($4,label),included_channels=COALESCE($5,included_channels),extra_channels=COALESCE($6,extra_channels) WHERE id=$1 AND org_id=$2 RETURNING id',
      [nid, org, b.status ?? null, b.label ?? null, b.includedChannels ?? null, b.extraChannels ?? null]);
    need(r.rows.length, 404, 'Number not found.'); await audit(db, a.user.id, org, 'voice.number_updated', { number: nid, ...b }); res.json({ ok: true });
  });

  app.get('/api/org/:org/voice/settings', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'agents'), p: any[] = [org];
    const locations = (await db.query(`SELECT l.id,l.name,l.timezone,l.company_id,c.name AS company_name,n.e164,n.status AS number_status FROM locations l JOIN companies c ON c.id=l.company_id AND c.org_id=l.org_id
      LEFT JOIN phone_numbers n ON n.location_id=l.id AND n.status<>'released' WHERE l.org_id=$1${scopeSQL(a, p, 'l.')} ORDER BY c.name,l.name`, p)).rows;
    const saved = (await db.query('SELECT location_id FROM reception_settings WHERE org_id=$1', [org])).rows.map(r => r.location_id);
    const out = [];
    for (const l of locations) out.push({ location: l, configured: saved.includes(l.id), settings: await loadSettings(db, org, l.id, l.company_name) });
    res.json(out);
  });
  app.put('/api/org/:org/voice/settings/:location', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'agents', true), locationId = uuid.parse(req.params.location);
    const loc = (await db.query('SELECT id,company_id FROM locations WHERE id=$1 AND org_id=$2', [locationId, org])).rows[0]; need(loc, 404, 'Location not found.'); checkScope(a, loc.company_id, loc.id);
    const b = settingsBody.parse(req.body);
    let hours; try { hours = validateHours(b.weeklyHours); } catch { need(false, 400, 'Opening hours must list seven days (Sunday first) with valid, non-overlapping HH:MM times.'); }
    const ids = new Set<string>(), defaults = new Set<string>();
    for (const t of b.transferTargets) {
      need(t.id !== 'reception' && !ids.has(t.id), 400, `Staff ID "${t.id}" is reserved or duplicated.`); ids.add(t.id);
      if (t.defaultForRole) { need(!defaults.has(t.role), 400, `Only one default contact is allowed for the ${t.role} role.`); defaults.add(t.role); }
    }
    const phones = [b.fallbackPhone, ...b.transferTargets.map(t => t.phone)].filter(Boolean) as string[];
    for (const ph of phones) {
      need(!b.publicNumbers.includes(ph), 400, 'A staff number cannot also be one of your public business numbers; calls would loop back to the assistant.');
      need(!(await db.query('SELECT 1 FROM phone_numbers WHERE e164=$1', [ph])).rows.length, 400, 'A staff number cannot be one of your Nerix numbers.');
    }
    const current = (await db.query('SELECT service FROM reception_settings WHERE org_id=$1 AND location_id=$2', [org, locationId])).rows[0];
    if (b.service !== (current?.service || 'basic')) need(a.internal && a.role === 'owner', 403, 'Only the Nerix administrator can change the service tier.');
    await db.query(`INSERT INTO reception_settings(org_id,location_id,assistant_name,business_name,business_type,greeting,voice,language,about,knowledge,policies,emergency,after_hours_note,weekly_hours,fallback_phone,public_numbers,transfer_targets,transfers_enabled,callbacks_enabled,notify_emails,service,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18,$19,$20::jsonb,$21,$22)
      ON CONFLICT(org_id,location_id) DO UPDATE SET assistant_name=EXCLUDED.assistant_name,business_name=EXCLUDED.business_name,business_type=EXCLUDED.business_type,greeting=EXCLUDED.greeting,voice=EXCLUDED.voice,language=EXCLUDED.language,
      about=EXCLUDED.about,knowledge=EXCLUDED.knowledge,policies=EXCLUDED.policies,emergency=EXCLUDED.emergency,after_hours_note=EXCLUDED.after_hours_note,weekly_hours=EXCLUDED.weekly_hours,fallback_phone=EXCLUDED.fallback_phone,
      public_numbers=EXCLUDED.public_numbers,transfer_targets=EXCLUDED.transfer_targets,transfers_enabled=EXCLUDED.transfers_enabled,callbacks_enabled=EXCLUDED.callbacks_enabled,notify_emails=EXCLUDED.notify_emails,service=EXCLUDED.service,
      configuration_version=reception_settings.configuration_version+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [org, locationId, b.assistantName, b.businessName, b.businessType, b.greeting, b.voice, b.language, b.about, b.knowledge, b.policies, b.emergency, b.afterHoursNote, JSON.stringify(hours), b.fallbackPhone, JSON.stringify(b.publicNumbers),
        JSON.stringify(b.transferTargets), b.transfersEnabled, b.callbacksEnabled, JSON.stringify(b.notifyEmails), b.service, a.user.id]);
    await audit(db, a.user.id, org, 'voice.settings_saved', { location: locationId }); res.json({ ok: true });
  });
  app.get('/api/org/:org/voice/preview/:location', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'agents'), locationId = uuid.parse(req.params.location);
    const loc = (await db.query('SELECT l.id,l.name,l.timezone,l.company_id,c.name AS company_name FROM locations l JOIN companies c ON c.id=l.company_id AND c.org_id=l.org_id WHERE l.id=$1 AND l.org_id=$2', [locationId, org])).rows[0];
    need(loc, 404, 'Location not found.'); checkScope(a, loc.company_id, loc.id);
    const s = await loadSettings(db, org, locationId, loc.company_name); let after: boolean | null = null; try { after = isAfterHours(s.weeklyHours, loc.timezone); } catch { after = null; }
    res.json({ instructions: buildReceptionInstructions(s, { locationName: loc.name, timezone: loc.timezone, afterHours: after }), staffRoles: targetsFor(s).map(t => ({ name: t.name, role: t.role, hasPhone: !!t.phone })) });
  });

  app.get('/api/org/:org/voice/calls', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'calls'), p: any[] = [org], scope = scopeSQL(a, p, 'i.');
    const calls = (await db.query(`SELECT i.id,i.status,i.outcome,i.ended_reason,i.caller_phone,i.called_phone,i.after_hours,i.rate,i.billable_seconds,i.unfunded_seconds,i.charge,i.reserved,i.started_at,i.connected_at,i.ended_at,i.total_duration_ms,
      i.billing_enabled,i.last_activity_at,l.name AS location_name,c.name AS company_name FROM inbound_calls i JOIN locations l ON l.id=i.location_id AND l.org_id=i.org_id JOIN companies c ON c.id=i.company_id AND c.org_id=i.org_id
      WHERE i.org_id=$1${scope} ORDER BY i.created_at DESC LIMIT 200`, p)).rows;
    const q: any[] = [org], scope2 = scopeSQL(a, q, 'i.');
    const transfers = (await db.query(`SELECT t.call_id,t.target_role,t.status,t.caller_type,t.requested_at,t.caller_staff_duration_ms FROM inbound_transfers t WHERE t.call_id IN (SELECT i.id FROM inbound_calls i WHERE i.org_id=$1${scope2} ORDER BY i.created_at DESC LIMIT 200) ORDER BY t.requested_at`, q)).rows;
    const callbacks = (await db.query(`SELECT cb.call_id,cb.id,cb.status FROM callback_requests cb WHERE cb.call_id IN (SELECT i.id FROM inbound_calls i WHERE i.org_id=$1${scope2} ORDER BY i.created_at DESC LIMIT 200)`, q)).rows;
    res.json(calls.map(c => ({ ...c, transfers: transfers.filter(t => t.call_id === c.id), callback: callbacks.find(x => x.call_id === c.id) || null })));
  });

  app.get('/api/org/:org/voice/callbacks', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'tasks'), p: any[] = [org];
    res.json((await db.query(`SELECT cb.*,l.name AS location_name FROM callback_requests cb JOIN locations l ON l.id=cb.location_id AND l.org_id=cb.org_id WHERE cb.org_id=$1${scopeSQL(a, p, 'cb.')}
      ORDER BY (cb.status IN ('pending','in_progress')) DESC,cb.created_at DESC LIMIT 300`, p)).rows);
  });
  app.patch('/api/org/:org/voice/callbacks/:callback', async (req, res) => {
    const org = orgId(req), a = await auth.access(req, org, 'tasks', true), b = z.object({ status: z.enum(['pending', 'in_progress', 'done', 'cancelled']), notes: z.string().trim().max(2000).optional() }).parse(req.body), p: any[] = [org, uuid.parse(req.params.callback), b.status, b.notes ?? null];
    const r = (await db.query(`UPDATE callback_requests SET status=$3,notes=COALESCE($4,notes),updated_at=now(),completed_at=CASE WHEN $3 IN ('done','cancelled') THEN now() ELSE NULL END WHERE org_id=$1 AND id=$2${scopeSQL(a, p)} RETURNING task_id`, p)).rows[0];
    need(r, 404, 'Callback not found.');
    if (r.task_id) await db.query("UPDATE tasks SET status=CASE WHEN $2 IN ('done','cancelled') THEN 'done' ELSE 'open' END WHERE id=$1", [r.task_id, b.status]);
    await audit(db, a.user.id, org, 'voice.callback_updated', { callback: req.params.callback, status: b.status }); res.json({ ok: true });
  });
}

export function registerPasswordReset(app: Express, db: DB, auth: Auth, origin?: string) {
  const base = (req: Request) => origin || `${req.protocol}://${req.get('host')}`;
  app.post('/api/auth/forgot', async (req, res) => {
    await auth.limit(`forgot-ip:${req.ip}`);
    const b = z.object({ email }).parse(req.body); await auth.limit(`forgot:${b.email}`);
    const u = (await db.query('SELECT id FROM users WHERE email=$1 AND active=true', [b.email])).rows[0];
    if (u && emailEnabled()) {
      const token = randomToken();
      await db.transaction(async q => {
        await q.query('DELETE FROM password_resets WHERE user_id=$1 OR expires_at<now()', [u.id]);
        await q.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [hash(token), u.id]);
        await queueEmail(q, { kind: 'password_reset', to: b.email, ...resetEmail(`${base(req)}/#reset?token=${token}`) });
      });
    }
    res.json({ ok: true });   // identical answer whether or not the address exists
  });
  app.post('/api/auth/reset', async (req, res) => {
    await auth.limit(`reset:${req.ip}`);
    const b = z.object({ token: text(200), password: z.string().min(12).max(128) }).parse(req.body), newHash = await hashPassword(b.password);
    await db.transaction(async q => {
      const r = (await q.query('SELECT * FROM password_resets WHERE token_hash=$1 FOR UPDATE', [hash(b.token)])).rows[0];
      need(r && !r.used_at && new Date(r.expires_at) > new Date(), 400, 'This reset link is invalid or has expired. Request a new one.');
      await q.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, r.user_id]);
      await q.query('DELETE FROM sessions WHERE user_id=$1', [r.user_id]);
      await q.query('UPDATE password_resets SET used_at=now() WHERE token_hash=$1', [r.token_hash]);
      await audit(q, r.user_id, null, 'auth.password_reset');
    });
    res.json({ ok: true });
  });
}
