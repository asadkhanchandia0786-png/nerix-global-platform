import type { DB, Query, Row } from './db.ts';
import { id, need, audit } from './core.ts';
import { credit, lockWallet } from './wallet.ts';
// Illustrative test rates, deliberately never used to create a live charge.
export const TEST_FX:Record<string,number> = {USD:1,PKR:280,GBP:0.75,EUR:0.87,CAD:1.38,AED:3.6725,SAR:3.75};
export const INTEGRATIONS = [
  {id:'safepay',name:'Safepay',status:'Awaiting onboarding',detail:'Hosted checkout, verified events and refunds require merchant approval and a tested adapter. This release provides test checkout and manual verification only.'},
  {id:'voice',name:'OpenAI Realtime',status:'Not connected',detail:'Separate Alex and Sarah instructions are saved. Live audio sessions and measured token usage are the next voice-test milestone.'},
  {id:'sip',name:'Telephone gateway',status:'Not connected',detail:'Asterisk/carrier, caller ID, private warm transfers and hangup controls need a controlled live pilot.'},
  {id:'calendar',name:'Calendar',status:'Request workflow',detail:'Callbacks and meeting requests are stored for staff. No external calendar event is created.'},
  {id:'crm',name:'External CRM / dialer',status:'Under review',detail:'Choose one platform for a separately tested adapter. No universal CRM connection is advertised.'}
];
export async function createQuote(db:DB,org:string,usd:number,currency:string,exceptionId?:string) {
  return db.transaction(async q=>{
    const o=(await q.query('SELECT is_demo,billing_mode FROM organizations WHERE id=$1',[org])).rows[0];
    need(o?.billing_mode!=='internal',409,'Internal companies do not need Nerix top-ups.');
    need(o?.is_demo,409,'Live checkout needs Safepay approval and integration testing. Ask the team about an approved transfer.');
    need(TEST_FX[currency],400,'Unsupported currency.');
    if(usd<100000000) {
      const e=(await q.query('SELECT * FROM deposit_exceptions WHERE id=$1 AND org_id=$2 FOR UPDATE',[exceptionId||null,org])).rows[0];
      need(e&&!e.used&&new Date(e.expires_at)>new Date()&&Number(e.usd)===usd&&e.currency===currency,400,'Normal top-ups require at least USD100.');
      need((await q.query("SELECT 1 FROM payments WHERE org_id=$1 AND status='settled'",[org])).rows.length,400,'The first deposit must be at least USD100.');
    }
    need(usd<=100000000000,400,'Maximum test quote is USD100,000.');
    const rate=TEST_FX[currency],chargeMinor=Math.round(usd*rate/10000);
    const quote=(await q.query("INSERT INTO payment_quotes(id,org_id,usd,currency,charge_minor,rate,expires_at,exception_id,test_mode) VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes',$7,true) RETURNING *",[id(),org,usd,currency,chargeMinor,rate,exceptionId||null])).rows[0];
    return {...quote,source:'Illustrative test rate — not a current exchange-rate quote',fee:0};
  });
}
export async function confirmTestQuote(db:DB,org:string,quoteId:string,actor:string) {
  return db.transaction(async q=>{
    await lockWallet(q,org);
    const o=(await q.query('SELECT is_demo,billing_mode FROM organizations WHERE id=$1',[org])).rows[0];
    need(o?.is_demo&&o.billing_mode!=='internal',409,'Test checkout is only available to demonstration customer workspaces.');
    const quote=(await q.query('SELECT * FROM payment_quotes WHERE id=$1 AND org_id=$2 FOR UPDATE',[quoteId,org])).rows[0];
    need(quote?.test_mode,404,'Test quote not found.');
    if(quote.consumed) return {alreadyProcessed:true};
    need(new Date(quote.expires_at)>new Date(),409,'Quote expired. Request another quote.');
    if(quote.exception_id) {
      const e=(await q.query('SELECT * FROM deposit_exceptions WHERE id=$1 AND org_id=$2 FOR UPDATE',[quote.exception_id,org])).rows[0];
      need(e&&!e.used&&new Date(e.expires_at)>new Date()&&Number(e.usd)===Number(quote.usd)&&e.currency===quote.currency,409,'This exception is no longer available.');
      await q.query('UPDATE deposit_exceptions SET used=true WHERE id=$1',[e.id]);
    }
    const reference=`TEST-${quoteId}`;
    await q.query("INSERT INTO payments(id,org_id,reference,usd,remaining,currency,original_minor,test_mode,status,quote) VALUES($1,$2,$3,$4,0,$5,$6,true,'settled',$7)",[id(),org,reference,quote.usd,quote.currency,quote.charge_minor,JSON.stringify(quote)]);
    await credit(q,org,Number(quote.usd),reference,'test_credit',{quoteId,reason:'Simulated payment. No money charged.'});
    await q.query('UPDATE payment_quotes SET consumed=true WHERE id=$1',[quoteId]); await audit(q,actor,org,'payment.test',{quoteId}); return {alreadyProcessed:false};
  });
}
export async function manualPayment(q:Query,org:string,b:{amount:number;currency:string;originalMinor:number;reference:string;reason:string;verified:boolean;exceptionId?:string},actor:string) {
  const w=await lockWallet(q,org);
  const o=(await q.query('SELECT is_demo,billing_mode FROM organizations WHERE id=$1',[org])).rows[0];
  need(o?.billing_mode!=='internal',409,'Internal companies do not need Nerix paid credit.');
  need(o&&!o.is_demo,409,'Manual paid receipts belong to a real workspace. Use test checkout here.');
  need(b.verified,400,'Verify cleared funds through the approved bank/provider before crediting.');
  const exists=(await q.query('SELECT * FROM payments WHERE reference=$1',[b.reference])).rows[0];
  if(exists) { need(exists.org_id===org&&Number(exists.usd)===b.amount&&exists.currency===b.currency&&Number(exists.original_minor)===b.originalMinor,409,'Payment reference is already used.'); return {alreadyProcessed:true}; }
  if(b.amount<100000000) {
    need((await q.query("SELECT 1 FROM payments WHERE org_id=$1 AND test_mode=false AND status='settled'",[org])).rows.length,400,'The first paid deposit must be at least USD100.');
    const e=(await q.query('SELECT * FROM deposit_exceptions WHERE id=$1 AND org_id=$2 FOR UPDATE',[b.exceptionId||null,org])).rows[0];
    need(e&&!e.used&&new Date(e.expires_at)>new Date()&&Number(e.usd)===b.amount&&e.currency===b.currency,400,'A matching private exception is required.');
    await q.query('UPDATE deposit_exceptions SET used=true WHERE id=$1',[e.id]);
  }
  await q.query("INSERT INTO payments(id,org_id,reference,usd,remaining,currency,original_minor,test_mode,status,quote) VALUES($1,$2,$3,$4,$4,$5,$6,false,'settled',$7)",[id(),org,b.reference,b.amount,b.currency,b.originalMinor,JSON.stringify({source:'Owner-verified transfer',reason:b.reason})]);
  await credit(q,org,b.amount,`payment:${b.reference}`,'paid_credit',{reference:b.reference,reason:b.reason}); await audit(q,actor,org,'payment.manual_verified',{reference:b.reference,amount:b.amount}); return {alreadyProcessed:false};
}
export async function requestRefund(db:DB,org:string,amount:number,reason:string,actor:string) {
  return db.transaction(async q=>{
    const w=await lockWallet(q,org);
    need(w.reserved===0,409,'Finish active calls or the pending refund first.'); need(amount>0&&amount<=w.paid,400,'Only unused paid credit is refundable. Test and promotional credit have no cash value.');
    const lots=(await q.query('SELECT * FROM payments WHERE org_id=$1 AND test_mode=false AND remaining>0 ORDER BY created_at,id FOR UPDATE',[org])).rows;
    let left=amount; const allocations:Row[]=[];
    for(const p of lots) {
      const usd=Math.min(left,Number(p.remaining)); if(!usd) break;
      const previous=Number(p.refunded_usd||0);
      const minor=Number((BigInt(previous+usd)*BigInt(p.original_minor))/BigInt(p.usd))-Number(p.refunded_minor);
      need(minor>0,400,'This amount is smaller than the original currency refund unit. Contact support.');
      allocations.push({paymentId:p.id,reference:p.reference,usd,currency:p.currency,minor});left-=usd;
    }
    need(left===0,409,'Funding transactions need reconciliation.');
    const refundId=id();
    await q.query('INSERT INTO refunds(id,org_id,amount,status,reason,allocations) VALUES($1,$2,$3,$4,$5,$6)',[refundId,org,amount,'requested',reason,JSON.stringify(allocations)]);
    await q.query('UPDATE wallets SET reserved=reserved+$1 WHERE org_id=$2',[amount,org]);
    await q.query("UPDATE organizations SET paused=true,settings=jsonb_set(settings,'{autoRecharge}', '{\"enabled\":false,\"status\":\"disabled_for_refund\"}'::jsonb) WHERE id=$1",[org]);
    await audit(q,actor,org,'refund.requested',{refundId,amount});return {id:refundId};
  });
}
export async function updateRefund(db:DB,org:string,refundId:string,status:string,reference:string,actor:string) {
  return db.transaction(async q=>{
    await lockWallet(q,org);
    const r=(await q.query('SELECT * FROM refunds WHERE id=$1 AND org_id=$2 FOR UPDATE',[refundId,org])).rows[0]; need(r,404,'Refund not found.');
    if(r.status===status) return r;
    need(['requested','approved'].includes(r.status),409,'This refund is already closed.');
    if(status==='approved') need(r.status==='requested',409,'Already reviewed.');
    else if(status==='completed') {
      need(r.status==='approved'&&reference.length>=6,400,'Approve first, then record a verified original-method refund reference.');
      for(const allocation of r.allocations) {
        const result=await q.query('UPDATE payments SET remaining=remaining-$1,refunded_usd=refunded_usd+$1,refunded_minor=refunded_minor+$2 WHERE id=$3 AND org_id=$4 AND remaining>=$1 RETURNING id',[allocation.usd,allocation.minor,allocation.paymentId,org]);need(result.rows.length,409,'Refund funding changed. Reconcile before completion.');
      }
      await q.query('UPDATE wallets SET paid=paid-$1,reserved=reserved-$1 WHERE org_id=$2',[r.amount,org]);
      await q.query("INSERT INTO ledger(id,org_id,event_key,kind,amount,details) VALUES($1,$2,$3,'refund',$4,$5)",[id(),org,`refund:${r.id}`,-Number(r.amount),JSON.stringify({refundId:r.id,reference,allocations:r.allocations})]);
      await q.query("UPDATE referrals SET status=CASE WHEN status='paid' THEN 'reversed' ELSE 'pending' END,note='Refund recorded: commission requires recalculation.' WHERE org_id=$1 AND status IN ('qualified','paid')",[org]);
    } else if(status==='rejected') await q.query('UPDATE wallets SET reserved=reserved-$1 WHERE org_id=$2',[r.amount,org]);
    else need(false,400,'Invalid refund transition.');
    await q.query('UPDATE refunds SET status=$1,reference=$2 WHERE id=$3 AND org_id=$4',[status,status==='completed'?reference:null,r.id,org]); await audit(q,actor,org,`refund.${status}`,{refundId,reference});return {...r,status};
  });
}
