import type {DB} from './db.ts';
import {audit,id,need} from './core.ts';
import {lockWallet} from './wallet.ts';

// Invoked only after Auth.owner; ordinary workspace owners cannot waive fees.
export async function convertInternalCompany(db:DB,org:string,name:string,actor:string){
  return db.transaction(async q=>{
    const wallet=await lockWallet(q,org);
    const current=(await q.query('SELECT * FROM organizations WHERE id=$1 FOR UPDATE',[org])).rows[0];
    need(current,404,'Workspace not found.');
    if(current.billing_mode==='internal')return {alreadyConverted:true,orgId:org};
    need(current.is_demo,409,'Only a demonstration workspace can be converted here. Existing billed customers require separate reconciliation.');
    need(wallet.paid===0&&wallet.reserved===0,409,'Finish active reservations and reconcile paid funds before conversion.');
    need(!(await q.query("SELECT 1 FROM calls WHERE org_id=$1 AND status='reserved'",[org])).rows.length,409,'Finish or cancel the current simulation before conversion.');
    need(!(await q.query("SELECT 1 FROM payments WHERE org_id=$1 AND test_mode=false UNION ALL SELECT 1 FROM refunds WHERE org_id=$1 AND status IN ('requested','approved')",[org])).rows.length,409,'This workspace has paid transactions or pending refunds. Reconcile them separately.');
    await q.query("UPDATE organizations SET name=$1,is_demo=false,billing_mode='internal',settings=jsonb_set(settings,'{autoRecharge}','{\"enabled\":false,\"status\":\"not_required_internal\"}'::jsonb) WHERE id=$2",[name,org]);
    await q.query('UPDATE companies SET name=$1 WHERE org_id=$2 AND name=$3',[name,org,current.name]);
    await q.query('UPDATE wallets SET bonus=0 WHERE org_id=$1',[org]);
    await q.query("INSERT INTO ledger(id,org_id,event_key,kind,amount,details) VALUES($1,$2,'internal-company:conversion','demo_credit_removed',$3,$4)",[id(),org,-wallet.bonus,JSON.stringify({reason:'Removed demonstration credit when converting to an owned internal company. No money was sent or refunded.',previousName:current.name,internal:true})]);
    // Existing quote/exception links cannot fund a now-exempt company later.
    await q.query('UPDATE payment_quotes SET consumed=true WHERE org_id=$1',[org]);
    await q.query('UPDATE deposit_exceptions SET used=true WHERE org_id=$1',[org]);
    await audit(q,actor,org,'workspace.converted_to_internal',{name,previousName:current.name,removedDemoCredit:wallet.bonus});
    return {alreadyConverted:false,orgId:org};
  });
}
