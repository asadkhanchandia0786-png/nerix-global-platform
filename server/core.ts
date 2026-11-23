import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { Query } from './db.ts';
import { SERVICES } from '../shared/constants.ts';
export const id = () => randomUUID();
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export function need(condition: unknown, status: number, message: string): asserts condition { if (!condition) throw new AppError(status, message); }
export const uuid = z.string().uuid();
export const text = (max = 200) => z.string().trim().min(1).max(max);
export const timezone = z.string().refine(v => DateTime.now().setZone(v).isValid, 'Choose a valid IANA timezone.');
export const service = z.enum(['outbound', 'basic', 'advanced']);
export const email = z.email().max(254).transform(s => s.toLowerCase());
export const dollars = z.string().regex(/^\d{1,6}(\.\d{1,2})?$/, 'Use a USD amount with up to two decimal places.');
export function toMicros(value: string): number { const [whole, fraction = ''] = value.split('.'); return Number(whole) * 1000000 + Number(fraction.padEnd(6, '0')); }
export async function audit(q: Query, actor: string | null, org: string | null, action: string, details: unknown = {}) { await q.query('INSERT INTO audit(id,org_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)', [id(), org, actor, action, JSON.stringify(details)]); }
export async function rateFor(q: Query, orgId: string, kind: keyof typeof SERVICES) {
  const row = (await q.query('SELECT o.billing_mode,o.rates AS overrides,i.rates,i.name FROM organizations o JOIN industries i ON i.id=o.industry WHERE o.id=$1', [orgId])).rows[0];
  need(row, 404, 'Workspace not found.');
  if(row.billing_mode==='internal')return {rate:0,source:'Internal company · Nerix service fees waived'};
  const rate = row.overrides[kind] ?? row.rates[kind] ?? SERVICES[kind].rate;
  return { rate: Number(rate), source: row.overrides[kind] !== undefined ? 'Customer agreement' : `${row.name} rate` };
}
export const chargeFor = (rate: number, seconds: number) => Number((BigInt(rate) * BigInt(seconds) + 59n) / 60n);
export const DEFAULT_RULES = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', maxAttempts: 3, retryHours: 48, followupDays: 7 };
export async function createOrg(q: Query, name: string, industry: string, ownerId: string, demo: boolean, internal=false) {
  const org = id(), company = id(), location = id();
  if(internal)demo=false;
  need((await q.query('SELECT id FROM industries WHERE id=$1', [industry])).rows.length, 400, 'Unknown industry.');
  await q.query('INSERT INTO organizations(id,name,industry,is_demo,billing_mode) VALUES($1,$2,$3,$4,$5)', [org, name, industry, demo,internal?'internal':'customer']);
  await q.query('INSERT INTO companies(id,org_id,name) VALUES($1,$2,$3)', [company, org, name]);
  await q.query('INSERT INTO locations(id,org_id,company_id,name,timezone) VALUES($1,$2,$3,$4,$5)', [location, org, company, 'Main location', industry === 'dental' ? 'Europe/London' : 'Asia/Karachi']);
  await q.query("INSERT INTO memberships(id,org_id,user_id,role) VALUES($1,$2,$3,'owner')", [id(), org, ownerId]);
  await q.query('INSERT INTO wallets(org_id,bonus) VALUES($1,$2)', [org, demo ? 300000000 : 0]);
  if (demo) await q.query("INSERT INTO ledger(id,org_id,event_key,kind,amount,details) VALUES($1,$2,'seed','test_credit',300000000,$3)", [id(), org, JSON.stringify({ reason: 'Demonstration credit. No cash value; never refundable.' })]);
  for (const kind of Object.keys(SERVICES)) await q.query('INSERT INTO agents(id,org_id,service,name,tone,knowledge) VALUES($1,$2,$3,$4,$5,$6)', [id(), org, kind, kind === 'outbound' ? 'Alex' : 'Sarah', kind === 'outbound' ? 'alex' : 'sarah', `You represent Nerix Global. This workspace belongs to ${name}. Only discuss information approved by its team. Nerix offers lead generation and reception/support. No setup fee. Do not guarantee results.`]);
  const campaign = id();
  await q.query('INSERT INTO campaigns(id,org_id,company_id,location_id,name,mode,service,rules) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [campaign, org, company, location, industry === 'dental' ? 'Dentive · first conversations' : 'First conversations', 'leadgen', 'outbound', JSON.stringify({ ...DEFAULT_RULES, days: industry === 'dental' ? [2, 3] : DEFAULT_RULES.days })]);
  if (demo) for (const [n, business, disposition, contact] of [[1, 'Maple Dental · example', 'New', 'Jamie'], [2, 'Willow Clinic · example', 'Interested', 'Sam'], [3, 'Parkside Practice · example', 'Callback requested', 'Taylor'], [4, 'Oak House · example', 'Do not call', 'Jordan']] as const) {
    const lead = id(), phone = `+44207946000${n}`;
    await q.query('INSERT INTO leads(id,org_id,company_id,location_id,business,phone,original_phone,timezone,disposition,contacts,notes) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10)', [lead, org, company, location, business, phone, 'Europe/London', disposition, JSON.stringify([{ name: contact, role: 'Office manager' }]), 'Fictional example for simulation. This is not a customer or a callable prospect.']);
    if (disposition === 'Do not call') await q.query('INSERT INTO suppression(org_id,company_id,phone,reason) VALUES($1,$2,$3,$4)', [org, company, phone, 'Example opt-out']);
  }
  return { id: org, company, location };
}
