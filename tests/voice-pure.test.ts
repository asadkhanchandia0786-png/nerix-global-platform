import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeMicros, secondsFor, admissionBudget, renewBudget, settleBudget, MIN_START_SECONDS } from '../server/voice-math.ts';
import { buildReceptionInstructions, defaultSettings } from '../server/reception.ts';
import { findTransferTarget, transferIntake, callbackPolicy, staffRole, requestedStaffRole, receptionFallback } from '../shared/reception-rules.js';
import { callbackNumber, inboundCallerNumber } from '../shared/callback-number.js';
import { isAfterHours, validateHours } from '../shared/operating-hours.js';
import { signGatewayBody, verifyGatewayRequest } from '../shared/gateway-signature.js';
import { normalizeRealtimeUsage } from '../shared/usage-normalize.js';

test('charge rounds up to the next micro-dollar and matches the published $0.50/minute rate', () => {
  assert.equal(chargeMicros(500000, 60), 500000);
  assert.equal(chargeMicros(500000, 1), 8334);      // ceil(500000/60)
  assert.equal(chargeMicros(0, 100), 0);
});
test('admission reserves up to 60s and requires at least 15 funded seconds', () => {
  const rich = admissionBudget(10_000_000, 500000); assert.equal(rich.seconds, 60); assert.equal(rich.reserve, 500000); assert.equal(rich.allowed, true);
  const tiny = admissionBudget(100000, 500000); assert.equal(tiny.seconds, 12); assert.equal(tiny.allowed, false);
  assert.ok(MIN_START_SECONDS === 15);
  const edge = admissionBudget(125000, 500000); assert.equal(edge.seconds, 15); assert.equal(edge.allowed, true);
});
test('funded seconds never cost more than the available credit', () => {
  for (const available of [1, 999, 125000, 777777, 5_000_000, 123_456_789]) for (const rate of [300000, 500000, 750000]) {
    const s = secondsFor(available, rate); assert.ok(chargeMicros(rate, s) <= available || s === 3500 && chargeMicros(rate, s) <= available + 1, `${available}/${rate}`);
  }
});
test('heartbeat extends funding only from unreserved credit and stops at the funded deadline', () => {
  const grow = renewBudget({ rate: 500000, fundedSeconds: 60, elapsedSeconds: 50, detached: false, availableExcludingThisCall: 10_000_000 });
  assert.equal(grow.seconds, 110); assert.equal(grow.stop, false);
  const capped = renewBudget({ rate: 500000, fundedSeconds: 60, elapsedSeconds: 50, detached: false, availableExcludingThisCall: 250000 });
  assert.equal(capped.seconds, 30); assert.equal(capped.stop, true);   // only 30s of unreserved credit remain
  const out = renewBudget({ rate: 500000, fundedSeconds: 60, elapsedSeconds: 61, detached: false, availableExcludingThisCall: 0 });
  assert.equal(out.seconds, 0); assert.equal(out.stop, true);
  const detached = renewBudget({ rate: 500000, fundedSeconds: 120, elapsedSeconds: 45, detached: true, availableExcludingThisCall: 10_000_000 });
  assert.equal(detached.seconds, 45); assert.equal(detached.stop, false);
});
test('settlement bills only funded connected seconds and records any overrun', () => {
  assert.deepEqual(settleBudget({ rate: 500000, fundedSeconds: 60, actualSeconds: 40, failed: false }), { billable: 40, charge: chargeMicros(500000, 40), unfunded: 0 });
  const over = settleBudget({ rate: 500000, fundedSeconds: 60, actualSeconds: 75, failed: false }); assert.equal(over.billable, 60); assert.equal(over.unfunded, 15);
  assert.deepEqual(settleBudget({ rate: 500000, fundedSeconds: 60, actualSeconds: 75, failed: true }), { billable: 0, charge: 0, unfunded: 0 });
});

test('gateway signature: sign/verify round trip, tamper and replay-window rejection', () => {
  const secret = 'x'.repeat(40), raw = Buffer.from(JSON.stringify({ eventId: 'e1', type: 'authorize', calledNumber: '+15550100' }));
  const ts = String(Math.floor(Date.now() / 1000)), sig = signGatewayBody(secret, ts, raw);
  assert.deepEqual(verifyGatewayRequest({ secret, timestamp: ts, signature: sig, raw }), { ok: true });
  assert.equal((verifyGatewayRequest({ secret, timestamp: ts, signature: sig, raw: Buffer.from(raw.toString() + ' ') }) as any).reason, 'gateway_signature_invalid');
  assert.equal((verifyGatewayRequest({ secret, timestamp: String(Number(ts) - 400), signature: signGatewayBody(secret, String(Number(ts) - 400), raw), raw }) as any).reason, 'gateway_timestamp_invalid');
  assert.equal((verifyGatewayRequest({ secret: 'short', timestamp: ts, signature: sig, raw }) as any).reason, 'gateway_not_configured');
});

test('staff lookup resolves roles and names generically, and routes unknown requests only to the unique front desk', () => {
  const targets = [
    { id: 'reception', name: 'Reception team', role: 'receptionist', hasPhone: true },
    { id: 'm1', name: 'Priya Shah', role: 'manager', hasPhone: true },
    { id: 's1', name: 'Dr Omar Khan', role: 'specialist', hasPhone: true },
    { id: 'b1', name: 'Accounts team', role: 'billing', hasPhone: true }
  ];
  assert.equal(findTransferTarget(targets, '', 'manager').target.id, 'm1');
  assert.equal(findTransferTarget(targets, 'the office manager').target.id, 'm1');
  assert.equal(findTransferTarget(targets, 'Omar').target.id, 's1');
  assert.equal(findTransferTarget(targets, 'the lawyer').target.id, 's1');   // role words work for any profession
  assert.equal(findTransferTarget(targets, 'accounts department').target.id, 'b1');
  const unknown = findTransferTarget(targets, 'Zed Nobody'); assert.equal(unknown.found, true); assert.equal(unknown.fallback, true); assert.equal(unknown.target.id, 'reception');
  assert.equal(requestedStaffRole('customer service'), 'support');
  assert.equal(staffRole({ name: 'Front Desk' }), 'receptionist');
  assert.equal(receptionFallback([{ id: 'a', name: 'Front desk A', role: 'receptionist' }, { id: 'b', name: 'Front desk B', role: 'receptionist' }]), null);
});
test('intake: placeholders and unconfirmed details are rejected; legacy "patient" maps to customer', () => {
  assert.equal(transferIntake({ callerName: 'Caller', reason: 'billing', callerDetailsConfirmed: true }).ok, false);
  assert.equal(transferIntake({ callerName: 'Alex', reason: 'invoice', callerDetailsConfirmed: false }).ok, false);
  const ok: any = transferIntake({ callerName: 'Alex', reason: 'invoice', callerDetailsConfirmed: true, callerType: 'patient' });
  assert.equal(ok.ok, true); assert.equal(ok.callerType, 'customer');
  assert.equal((transferIntake({ callerName: 'Alex', reason: 'x', callerDetailsConfirmed: true, callerType: 'alien' }) as any).ok, false);
});
test('policy: a decline or failed sales call blocks further transfers', () => {
  assert.deepEqual(callbackPolicy([{ status: 'declined' }]), { afterFailure: true, callbackOnly: true });
  assert.deepEqual(callbackPolicy([{ status: 'no_answer', caller_type: 'sales' }]), { afterFailure: true, callbackOnly: true });
  assert.deepEqual(callbackPolicy([{ status: 'no_answer', caller_type: 'customer' }]), { afterFailure: true, callbackOnly: false });
  assert.deepEqual(callbackPolicy([]), { afterFailure: false, callbackOnly: false });
});
test('callback numbers: caller ID, local numbers and invalid input', () => {
  assert.equal(inboundCallerNumber('+442079460123'), '+442079460123');
  assert.equal(inboundCallerNumber('garbage'), null);
  const fromId: any = callbackNumber({}, { callerPhone: '+14155550123' }); assert.equal(fromId.ok, true); assert.equal(fromId.callbackPhone, '+14155550123');
  const local: any = callbackNumber({ callbackPhone: '0207 946 0123' }, { callerPhone: '+442079460999', defaultCountry: 'GB' }); assert.equal(local.callbackPhone, '+442079460123');
  assert.equal((callbackNumber({ callbackPhone: '12' }, { defaultCountry: 'GB' }) as any).ok, false);
});
test('opening hours: weekday window, closed days and timezone handling', () => {
  const day = [{ open: '09:00', close: '17:00' }], hours = [[], day, day, day, day, day, []];            // Sun..Sat
  const mondayNoonUTC = new Date('2026-11-02T12:00:00Z');                                                  // a Monday
  assert.equal(isAfterHours(hours, 'UTC', mondayNoonUTC), false);
  assert.equal(isAfterHours(hours, 'UTC', new Date('2026-11-02T20:00:00Z')), true);
  assert.equal(isAfterHours(hours, 'UTC', new Date('2026-11-01T12:00:00Z')), true);                       // Sunday
  assert.equal(isAfterHours(hours, 'Asia/Karachi', new Date('2026-11-02T08:00:00Z')), false);              // 13:00 PKT: open
  assert.equal(isAfterHours(hours, 'Asia/Karachi', new Date('2026-11-02T12:00:00Z')), true);               // 17:00 PKT is the closing minute: closed
  assert.equal(isAfterHours(null, 'UTC'), null);
  assert.throws(() => validateHours([[{ open: '10:00', close: '09:00' }], [], [], [], [], [], []]));
});
test('usage counters are validated', () => {
  assert.equal(normalizeRealtimeUsage({ total_tokens: 3, input_tokens: 1, output_tokens: 2 }).total_tokens, 3);
  assert.throws(() => normalizeRealtimeUsage({ total_tokens: -1 }), /invalid_voice_usage/);
  assert.throws(() => normalizeRealtimeUsage(null), /invalid_voice_usage/);
});
test('generated instructions are industry-neutral, disclose AI honestly and carry the configured facts', () => {
  const s = { ...defaultSettings('Acme Plumbing'), businessType: 'plumbing company', knowledge: 'We cover Karachi. Callout fee is PKR 3,000.', policies: 'Take the address for every leak.', emergency: 'For gas smell tell the caller to leave the building.' };
  const text = buildReceptionInstructions(s, { locationName: 'Main office', timezone: 'Asia/Karachi', afterHours: true });
  assert.match(text, /You are Sarah, the virtual receptionist for Acme Plumbing/);
  assert.match(text, /Never claim to be human/);
  assert.match(text, /Callout fee is PKR 3,000/);
  assert.match(text, /currently closed/);
  assert.match(text, /find_transfer_target/);
  assert.doesNotMatch(text, /dental|dentist|patient|practice|Dentive/i);
  const noTransfers = buildReceptionInstructions({ ...s, transfersEnabled: false }, { locationName: 'Main office', timezone: 'UTC', afterHours: false });
  assert.doesNotMatch(noTransfers, /request_warm_transfer checks/);
  assert.match(noTransfers, /Live transfers are not enabled/);
});

test('the real gateway client signs requests exactly as the portal verifies them', async () => {
  const { GatewayClient } = await import('../gateway/client.js');
  const secret = 'k'.repeat(40);
  let seen: any;
  const fetchImpl = async (url: string, init: any) => { seen = { url, init }; return { ok: true, json: async () => ({ ok: true }) }; };
  const client = new GatewayClient({ secret, appUrl: 'http://127.0.0.1:3000', spool: '/tmp/nerix-spool-test' }, { fetchImpl });
  await client.event({ type: 'authorize', providerCallId: 'p1', calledNumber: '+442079460100', billingProtocol: 4 });
  assert.equal(seen.url, 'http://127.0.0.1:3000/api/gateway/events');
  const h = seen.init.headers;
  assert.deepEqual(Object.keys(h).sort(), ['Content-Type', 'X-Nerix-Signature', 'X-Nerix-Timestamp']);
  assert.deepEqual(verifyGatewayRequest({ secret, timestamp: h['X-Nerix-Timestamp'], signature: h['X-Nerix-Signature'], raw: Buffer.from(seen.init.body) }), { ok: true });
  assert.equal(JSON.parse(seen.init.body).type, 'authorize');
});
test('a dashboard-generated route is accepted by the gateway routing validator and enforces transfer gates', async () => {
  const { validateRouting, inboundRoute, dialDestination } = await import('../gateway/routing.js');
  Object.assign(process.env, { VS_FORWARDING_IPS: '203.0.113.10', VS_SERVER: 'sip.example.test', VS_USERNAME: 'u', VS_PASSWORD: 'p', VS_TRUSTED_IPS: '203.0.113.20' });
  const { readFileSync } = await import('node:fs');
  const base = JSON.parse(readFileSync(new URL('../deploy/voipstudio-forwarding.example.json', import.meta.url), 'utf8'));
  base.routes = [{ did: '+442079460100', trunk: 'vs-forward', outboundTrunk: 'vs-payg', workspaceKey: '6f1c2b9e-4d7a-4b1e-9a51-3c2d8e7f0a11', locationKey: '0b8e3c7a-91d4-4f62-8a7e-5d2c1b9f3e44',
    publicNumbers: ['+922111000111'], inboundAliases: [], transferNumbers: ['+923001234567'], callerIdVerified: false }];
  const cfg = validateRouting(base), route = inboundRoute({ routing: cfg }, '+442079460100', 'vs-forward'), call = { calledNumber: '+442079460100', route };
  assert.throws(() => dialDestination({ routing: cfg }, call, { targetPhone: '+923001234567' }), /caller ID/);   // transfers stay off until the operator confirms caller ID
  route.callerIdVerified = true;
  assert.match(dialDestination({ routing: cfg }, call, { targetPhone: '+923001234567' }).endpoint, /^PJSIP\/\+923001234567@/);
  assert.throws(() => dialDestination({ routing: cfg }, call, { targetPhone: '+923009999999' }), /not authorised/);
  assert.throws(() => dialDestination({ routing: cfg }, call, { targetPhone: '+922111000111' }));                       // never loop back to a public business number
});
