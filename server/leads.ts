import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { DB, Row, Query } from './db.ts';
import { id, need, timezone, audit } from './core.ts';
import { checkScope, validScope, type Access } from './auth.ts';
export const importSchema = z.object({ companyId: z.string().uuid(), locationId: z.string().uuid(), country: z.string().regex(/^[A-Z]{2}$/), timezone, dateFormat: z.enum(['dd/MM/yyyy HH:mm','MM/dd/yyyy HH:mm','yyyy-MM-dd HH:mm']), mapping: z.record(z.string(), z.string().max(200)), rows: z.array(z.record(z.string(), z.union([z.string().max(5000),z.number(),z.null()]))).min(1).max(1000) });
export type ImportInput = z.infer<typeof importSchema>;
export function normalizePhone(value: string, country: string) {
  const p = parsePhoneNumberFromString(value, country as CountryCode);
  need(p && p.isValid(), 400, 'Phone number is invalid for the selected country.');
  return p.number;
}
export function mapLead(row: Record<string, any>, b: ImportInput) {
  const read = (key: string) => String(row[b.mapping[key]] ?? '').trim();
  const business = read('business'), originalPhone = read('phone');
  need(business && business.length <= 200, 400, 'A business name is required (maximum 200 characters).');
  const phone = normalizePhone(originalPhone, b.country);
  const followup = read('followup_phone') ? normalizePhone(read('followup_phone'), b.country) : null;
  const tz = read('timezone') || b.timezone;
  need(DateTime.now().setZone(tz).isValid, 400, 'Invalid recipient timezone.');
  let callback: string | null = null;
  if (read('callback_at')) {
    const raw = read('callback_at');
    const date = DateTime.fromFormat(raw, b.dateFormat, { zone: tz });
    need(date.isValid && date.toFormat(b.dateFormat) === raw, 400, `Invalid callback time. Use ${b.dateFormat}; nonexistent daylight-saving times are rejected.`);
    need(date.getPossibleOffsets().length === 1, 400, 'Callback time is ambiguous during daylight-saving change. Choose another time.');
    callback = date.toUTC().toISO();
  }
  const contacts = [['contact_name', read('contact_role') || 'Contact'], ['receptionist','Receptionist'], ['manager','Office manager'], ['doctor','Doctor']].flatMap(([field, role]) => read(field) ? [{ name: read(field).slice(0,200), role }] : []);
  const address = read('email');
  need(!address || z.email().safeParse(address).success, 400, 'Invalid email address.');
  return { business, phone, originalPhone, followup, timezone: tz, callback, email: address.toLowerCase(), contacts, notes: read('notes'), previousCaller: read('previous_caller') };
}
export async function previewImport(q: Query, a: Access, b: ImportInput) {
  checkScope(a,b.companyId,b.locationId); await validScope(q,a.orgId,b.companyId,b.locationId);
  const seen = new Set<string>();
  const known = (await q.query('SELECT phone,location_id,disposition FROM leads WHERE org_id=$1 AND company_id=$2', [a.orgId,b.companyId])).rows;
  const blocked = new Set((await q.query('SELECT phone FROM suppression WHERE org_id=$1 AND company_id=$2', [a.orgId,b.companyId])).rows.map(x=>x.phone));
  return b.rows.map((row,index) => {
    try {
      const data = mapLead(row,b); need(!seen.has(data.phone),400,'Duplicate phone number in this file.'); seen.add(data.phone);
      const existing = known.find(x=>x.phone===data.phone);
      need(!existing || !a.locationId || existing.location_id === a.locationId, 403, 'This number exists outside your assigned location.');
      return { row: index+2, valid: true, data, action: existing ? 'Preserve & add import history' : 'Create', suppressed: blocked.has(data.phone) || !!data.followup && blocked.has(data.followup) };
    } catch(e) { return { row: index+2, valid: false, error: e instanceof Error ? e.message : 'Invalid row' }; }
  });
}
export async function saveImport(db: DB,a: Access,b: ImportInput) {
  return db.transaction(async q => {
    await q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[a.orgId]);
    const preview = await previewImport(q,a,b);
    need(preview.every(x=>x.valid),400,'Fix the rows marked invalid before importing. No rows were saved.');
    let added = 0, updated = 0;
    for(const item of preview) {
      const d = item.data!;
      const existing = (await q.query('SELECT * FROM leads WHERE org_id=$1 AND company_id=$2 AND phone=$3',[a.orgId,b.companyId,d.phone])).rows[0];
      let leadId = existing?.id || id();
      if(existing) {
        const merged = [...existing.contacts];
        for(const contact of d.contacts) if(!merged.some(x=>x.name===contact.name&&x.role===contact.role)) merged.push(contact);
        await q.query("UPDATE leads SET contacts=$1,email=CASE WHEN email='' THEN $2 ELSE email END, disposition=CASE WHEN $3 THEN 'Do not call' ELSE disposition END WHERE id=$4 AND org_id=$5",[JSON.stringify(merged),d.email,!!item.suppressed,leadId,a.orgId]); updated++;
      } else {
        await q.query('INSERT INTO leads(id,org_id,company_id,location_id,business,phone,original_phone,followup_phone,email,contacts,timezone,disposition,notes,previous_caller,next_call_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[leadId,a.orgId,b.companyId,b.locationId,d.business,d.phone,d.originalPhone,d.followup,d.email,JSON.stringify(d.contacts),d.timezone,item.suppressed?'Do not call':'New',d.notes,d.previousCaller,d.callback]); added++;
      }
      await q.query("INSERT INTO lead_history(id,org_id,lead_id,kind,body) VALUES($1,$2,$3,'import',$4)",[id(),a.orgId,leadId,JSON.stringify(d)]);
    }
    await audit(q,a.user.id,a.orgId,'leads.import',{added,updated}); return {added,updated};
  });
}
export const rulesSchema = z.object({ days:z.array(z.number().int().min(1).max(7)).min(1).max(7),start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),maxAttempts:z.number().int().min(1).max(10),retryHours:z.number().int().min(1).max(720),followupDays:z.number().int().min(1).max(90) }).refine(r=>r.start<r.end,'End time must follow start time. Split overnight windows into separate campaigns.');
export function eligibility(lead: Row, campaign: Row, suppressed: boolean, now = new Date()) {
  const r = campaign.rules;
  if(suppressed || lead.disposition==='Do not call') return 'Do not call';
  if(['Not interested','Invalid number','Meeting booked','Transferred'].includes(lead.disposition)) return 'Sequence ended';
  if(!campaign.authorization) return 'Calling authorization not recorded';
  if(campaign.status!=='ready') return 'Campaign is paused or draft';
  if(lead.attempts>=r.maxAttempts) return 'Attempt limit reached';
  if(campaign.mode==='followup' && lead.disposition==='New' && lead.attempts===0) return 'No previous conversation';
  if(lead.next_call_at && +new Date(lead.next_call_at)>+now) return 'Follow-up is not due';
  if(lead.last_called_at && +now-+new Date(lead.last_called_at)<r.retryHours*3600000) return 'Retry spacing';
  const local = DateTime.fromJSDate(now).setZone(lead.timezone);
  if(!local.isValid) return 'Recipient timezone required';
  if(!r.days.includes(local.weekday) || local.toFormat('HH:mm')<r.start || local.toFormat('HH:mm')>=r.end) return lead.next_call_at ? 'Requested callback conflicts with campaign window' : 'Outside recipient calling window';
  return null;
}
export function nextWindow(timezoneName: string, rules: Row, from = new Date()) {
  let date = DateTime.fromJSDate(from).setZone(timezoneName);
  for(let i=0;i<15;i++) {
    if(rules.days.includes(date.weekday)) {
      const [hour,minute] = rules.start.split(':').map(Number);
      const opening = date.set({hour,minute,second:0,millisecond:0});
      if(opening.toMillis()>=from.getTime()) return opening.toUTC().toISO();
      if(date.toFormat('HH:mm')<rules.end) return date.toUTC().toISO();
    }
    date=date.plus({days:1}).startOf('day');
  }
  return null;
}
