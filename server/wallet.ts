import type { DB, Query, Row } from './db.ts';
import { audit, chargeFor, id, need, rateFor } from './core.ts';
import { buildPrompt } from './agents.ts';
import { eligibility } from './leads.ts';
import { type Access, checkScope } from './auth.ts';
import type { Service } from '../shared/constants.ts';
export async function lockWallet(q: Query, org: string) {
  const w=(await q.query('SELECT * FROM wallets WHERE org_id=$1 FOR UPDATE',[org])).rows[0];
  need(w,404,'Wallet not found.'); return {paid:Number(w.paid),bonus:Number(w.bonus),reserved:Number(w.reserved)};
}
export async function credit(q: Query,org:string,amount:number,event:string,kind:'test_credit'|'promotional_credit'|'paid_credit',details:Row) {
  await lockWallet(q,org);
  need((await q.query('SELECT billing_mode FROM organizations WHERE id=$1',[org])).rows[0]?.billing_mode!=='internal',409,'Internal companies do not need Nerix wallet credit.');
  if((await q.query('SELECT id FROM ledger WHERE org_id=$1 AND event_key=$2',[org,event])).rows.length) return false;
  need(Number.isSafeInteger(amount)&&amount>0,400,'Invalid credit.');
  await q.query(`UPDATE wallets SET ${kind==='paid_credit'?'paid':'bonus'}=${kind==='paid_credit'?'paid':'bonus'}+$1 WHERE org_id=$2`,[amount,org]);
  await q.query('INSERT INTO ledger(id,org_id,event_key,kind,amount,details) VALUES($1,$2,$3,$4,$5,$6)',[id(),org,event,kind,amount,JSON.stringify(details)]); return true;
}
export async function consume(q:Query,org:string,amount:number,reservation:number,event:string,details:Row) {
  const w=await lockWallet(q,org);
  if((await q.query('SELECT id FROM ledger WHERE org_id=$1 AND event_key=$2',[org,event])).rows.length) return;
  need(amount<=reservation && reservation<=w.reserved,409,'Charge exceeds reserved credit.');
  const bonus=Math.min(w.bonus,amount),paid=amount-bonus;
  const lots=(await q.query('SELECT * FROM payments WHERE org_id=$1 AND test_mode=false AND remaining>0 ORDER BY created_at,id FOR UPDATE',[org])).rows;
  let remaining=paid;
  for(const lot of lots) { const used=Math.min(remaining,Number(lot.remaining)); if(used) await q.query('UPDATE payments SET remaining=remaining-$1 WHERE id=$2',[used,lot.id]); remaining-=used; }
  need(remaining===0,409,'Paid funding needs reconciliation before billing.');
  await q.query('UPDATE wallets SET bonus=bonus-$1,paid=paid-$2,reserved=reserved-$3 WHERE org_id=$4',[bonus,paid,reservation,org]);
  await q.query("INSERT INTO ledger(id,org_id,event_key,kind,amount,details) VALUES($1,$2,$3,'usage',$4,$5)",[id(),org,event,-amount,JSON.stringify({...details,paid,bonus})]);
}
export async function startCall(db: DB,a:Access,b:{campaignId:string;leadId:string;seconds:number;requestKey:string;at:string}) {
  return db.transaction(async q=>{
    const w=await lockWallet(q,a.orgId);
    const existing=(await q.query('SELECT c.*,l.company_id,l.location_id FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1 AND c.request_key=$2',[a.orgId,b.requestKey])).rows[0]; if(existing) {checkScope(a,existing.company_id,existing.location_id);return existing;}
    const org=(await q.query('SELECT * FROM organizations WHERE id=$1',[a.orgId])).rows[0];
    need(org?.is_demo||org?.billing_mode==='internal',409,'This release only runs simulations in demonstration or internal company workspaces.'); need(!org.paused,409,'Workspace service is paused.');
    const c=(await q.query('SELECT * FROM campaigns WHERE org_id=$1 AND id=$2',[a.orgId,b.campaignId])).rows[0];
    const l=(await q.query('SELECT * FROM leads WHERE org_id=$1 AND id=$2',[a.orgId,b.leadId])).rows[0];
    need(c&&l&&c.company_id===l.company_id&&c.location_id===l.location_id,400,'Choose a lead from this campaign location.'); checkScope(a,c.company_id,c.location_id);
    const blocked=(await q.query('SELECT 1 FROM suppression WHERE org_id=$1 AND company_id=$2 AND phone=ANY($3::text[])',[a.orgId,l.company_id,[l.phone,l.followup_phone].filter(Boolean)])).rows.length>0;
    const why=eligibility(l,c,blocked,new Date(b.at)); need(!why,409,why||'Not eligible.');
    need(!(await q.query("SELECT 1 FROM calls WHERE org_id=$1 AND status='reserved'",[a.orgId])).rows.length,409,'Pilot limit: finish the current simulated call first.');
    const price=await rateFor(q,a.orgId,c.service as Service), reserve=chargeFor(price.rate,b.seconds);
    need(w.paid+w.bonus-w.reserved>=reserve,409,'Not enough available credit.');
    for(const [table,key] of [['companies','company_id'],['locations','location_id']] as const) {
      const cap=(await q.query(`SELECT monthly_cap FROM ${table} WHERE org_id=$1 AND id=$2`,[a.orgId,l[key]])).rows[0]?.monthly_cap;
      if(cap!==null&&cap!==undefined) { const used=(await q.query(`SELECT COALESCE(sum(c.charge+c.reserved),0) AS used FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1 AND l.${key}=$2 AND c.created_at>=date_trunc('month',now())`,[a.orgId,l[key]])).rows[0]; need(Number(used.used)+reserve<=Number(cap),409,'Company or location monthly spending cap reached.'); }
    }
    const agent=(await q.query('SELECT * FROM agents WHERE org_id=$1 AND service=$2',[a.orgId,c.service])).rows[0];
    const callId=id(); await q.query('UPDATE wallets SET reserved=reserved+$1 WHERE org_id=$2',[reserve,a.orgId]);
    const call=(await q.query("INSERT INTO calls(id,org_id,campaign_id,lead_id,request_key,service,rate,rate_source,reserved,seconds,status,script_snapshot,timeline,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reserved',$11,$12,now()+interval '5 minutes') RETURNING *",[callId,a.orgId,c.id,l.id,b.requestKey,c.service,price.rate,price.source,reserve,b.seconds,buildPrompt(agent,org.name),JSON.stringify([{event:'simulation_scheduled',at:b.at},{event:'ringing',billable:false}])])).rows[0];
    await audit(q,a.user.id,a.orgId,'simulation.reserved',{callId,seconds:b.seconds,reserve}); return call;
  });
}
export async function finishCall(db:DB,a:Access,callId:string,outcome:string,answered:boolean) {
  return db.transaction(async q=>{
    await lockWallet(q,a.orgId);
    const call=(await q.query('SELECT c.*,l.company_id,l.location_id FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1 AND c.id=$2 FOR UPDATE OF c',[a.orgId,callId])).rows[0];
    need(call,404,'Call not found.'); checkScope(a,call.company_id,call.location_id); if(call.status!=='reserved') return call;
    need(new Date(call.expires_at)>new Date(),409,'This reservation expired. Refresh to release it.');
    const seconds=answered?call.seconds:0,charge=chargeFor(Number(call.rate),seconds);
    await consume(q,a.orgId,charge,Number(call.reserved),`call:${callId}`,{callId,seconds,rate:call.rate,simulated:true,billingMode:Number(call.rate)===0&&call.rate_source==='Internal company · Nerix service fees waived'?'internal':'customer'});
    const events=[...call.timeline,...(answered?[{event:'answered_and_ai_attached',offsetSeconds:0,billable:true},{event:'ai_detached',offsetSeconds:seconds,billable:false}]:[{event:'not_answered',billable:false}])];
    await q.query("UPDATE calls SET status='completed',seconds=$1,charge=$2,reserved=0,outcome=$3,timeline=$4 WHERE id=$5 AND org_id=$6",[seconds,charge,outcome,JSON.stringify(events),callId,a.orgId]);
    const c=(await q.query('SELECT * FROM campaigns WHERE id=$1 AND org_id=$2',[call.campaign_id,a.orgId])).rows[0];
    const requested=outcome==='Callback requested'||outcome==='Decision maker unavailable';
    const due=requested ? new Date(Date.now()+c.rules.followupDays*86400000).toISOString():null;
    await q.query('UPDATE leads SET disposition=$1,attempts=attempts+1,last_called_at=now(),next_call_at=$2 WHERE id=$3 AND org_id=$4',[outcome,due,call.lead_id,a.orgId]);
    await q.query("INSERT INTO lead_history(id,org_id,lead_id,kind,body) VALUES($1,$2,$3,'simulated_call',$4)",[id(),a.orgId,call.lead_id,JSON.stringify({callId,outcome,seconds,charge,simulated:true})]);
    if(outcome==='Do not call') {
      const lead=(await q.query('SELECT phone,followup_phone FROM leads WHERE id=$1 AND org_id=$2',[call.lead_id,a.orgId])).rows[0];
      for(const phone of [lead.phone,lead.followup_phone].filter(Boolean)) await q.query("INSERT INTO suppression(org_id,company_id,phone,reason) VALUES($1,$2,$3,'Recorded opt-out') ON CONFLICT DO NOTHING",[a.orgId,call.company_id,phone]);
    }
    if(requested||outcome==='Interested') await q.query('INSERT INTO tasks(id,org_id,company_id,location_id,lead_id,kind,title,notes,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(),a.orgId,call.company_id,call.location_id,call.lead_id,requested?'callback':'meeting_request',requested?'Review callback window':'Arrange a conversation','Created by a simulated call. No calendar booking or telephone transfer has occurred.',due]);
    await audit(q,a.user.id,a.orgId,'simulation.completed',{callId,charge}); return {...call,status:'completed',seconds,charge,reserved:0,outcome,timeline:events};
  });
}
export async function expireReservations(db:DB) {
  const expired=(await db.query("SELECT DISTINCT org_id FROM calls WHERE status='reserved' AND expires_at<=now()")).rows;
  for(const {org_id} of expired) await db.transaction(async q=>{
    await lockWallet(q,org_id);
    const calls=(await q.query("SELECT id,reserved FROM calls WHERE org_id=$1 AND status='reserved' AND expires_at<=now() FOR UPDATE",[org_id])).rows;
    for(const c of calls) { await q.query('UPDATE wallets SET reserved=reserved-$1 WHERE org_id=$2',[c.reserved,org_id]); await q.query("UPDATE calls SET status='cancelled',reserved=0,outcome='Expired simulation' WHERE id=$1",[c.id]); }
  });
  await db.query('DELETE FROM sessions WHERE expires_at<now()'); await db.query('DELETE FROM rate_limits WHERE expires_at<now()');
}
