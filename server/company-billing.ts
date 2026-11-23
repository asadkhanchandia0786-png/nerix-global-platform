import type {Express,Request} from 'express';
import {z} from 'zod';
import type {DB} from './db.ts';
import {Auth} from './auth.ts';
import {audit,id,need,text,uuid} from './core.ts';
import {serviceAccessInput,serviceProfile,softwareCompany,softwareEntitlement} from './services.ts';
const org=(req:Request)=>uuid.parse(req.params.org);
const companyInput=z.object({companyId:uuid});
export function registerCompanyBilling(app:Express,db:DB,auth:Auth){
 app.get('/api/org/:org/service-management',async(req,res)=>{
  const a=await auth.access(req,org(req),'team');const requested=uuid.optional().parse(req.query.company);
  const company=await softwareCompany(db,a,requested);
  const companies=(await db.query(`SELECT c.id,c.name,s.plan_name,s.amount_cents,s.currency,s.status,s.period_start,s.period_end,s.legacy_access
   FROM companies c LEFT JOIN software_company_subscriptions s ON s.company_id=c.id AND s.org_id=c.org_id WHERE c.org_id=$1 ORDER BY c.name,c.id`,[a.orgId])).rows;
  res.json({...(await softwareEntitlement(db,a.orgId,company.id)),company,companies,
   services:(await serviceProfile(db,a.user,a.orgId)).configured,
   invoices:(await db.query('SELECT * FROM software_company_invoices WHERE org_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 100',[a.orgId,company.id])).rows,
   legacyInvoices:(await db.query('SELECT * FROM software_invoices WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100',[a.orgId])).rows,
   members:(await db.query('SELECT m.*,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY u.name',[a.orgId])).rows});
 });
 app.put('/api/org/:org/service-management/members/:member',async(req,res)=>{
  const a=await auth.access(req,org(req),'team',true),b=serviceAccessInput.parse(req.body);
  await db.transaction(async q=>{const m=(await q.query('SELECT * FROM memberships WHERE id=$1 AND org_id=$2 FOR UPDATE',[uuid.parse(req.params.member),a.orgId])).rows[0];
   need(m,404,'Member not found.');need(m.role!=='owner',400,'Workspace owners manage all subscribed services. Assign a staff role to restrict service access.');
   await q.query('UPDATE memberships SET service_access=$1 WHERE id=$2',[JSON.stringify(b),m.id]);await audit(q,a.user.id,a.orgId,'team.services_changed',{memberId:m.id,...b});});
  res.json({ok:true});
 });
 app.put('/api/org/:org/service-management/services',async(req,res)=>{
  const user=await auth.owner(req),o=org(req),b=z.object({voice:z.boolean(),chat:z.boolean()}).strict().parse(req.body);
  await db.transaction(async q=>{need((await q.query('UPDATE organizations SET services=$1 WHERE id=$2 RETURNING id',[JSON.stringify(b),o])).rows.length,404,'Workspace not found.');await audit(q,user.id,o,'services.configured',b);});res.json({ok:true});
 });
 app.put('/api/org/:org/service-management',async(req,res)=>{
  const user=await auth.owner(req),o=org(req),b=companyInput.extend({planName:text(100),amountCents:z.number().int().min(0).max(100000000),currency:z.enum(['USD','PKR','GBP','EUR','AED'])}).strict().parse(req.body);
  await db.transaction(async q=>{
   need((await q.query('SELECT id FROM companies WHERE id=$1 AND org_id=$2 FOR UPDATE',[b.companyId,o])).rows.length,404,'Company not found.');
   await q.query(`INSERT INTO software_company_subscriptions(company_id,org_id,plan_name,amount_cents,currency) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(company_id) DO UPDATE SET plan_name=excluded.plan_name,amount_cents=excluded.amount_cents,currency=excluded.currency,legacy_access=false,updated_at=now()`,[b.companyId,o,b.planName,b.amountCents,b.currency]);
   await audit(q,user.id,o,'software.company_plan_configured',b);
  });res.json({ok:true});
 });
 app.post('/api/org/:org/service-management/trial',async(req,res)=>{
  const u=await auth.owner(req),o=org(req),b=companyInput.extend({days:z.number().int().min(1).max(30)}).strict().parse(req.body);
  await db.transaction(async q=>{const s=(await q.query('SELECT * FROM software_company_subscriptions WHERE org_id=$1 AND company_id=$2 FOR UPDATE',[o,b.companyId])).rows[0];
   need(s&&s.status==='pending'&&!s.period_end,409,'Save this company’s plan first. A trial can be started only once, before a paid period.');
   await q.query("UPDATE software_company_subscriptions SET status='trial',period_start=now(),period_end=now()+$3::integer*interval '1 day',updated_at=now() WHERE org_id=$1 AND company_id=$2",[o,b.companyId,b.days]);await audit(q,u.id,o,'software.company_trial_started',b);});res.json({ok:true});
 });
 app.post('/api/org/:org/service-management/invoices',async(req,res)=>{
  const u=await auth.owner(req),o=org(req),b=companyInput.strict().parse(req.body);
  res.json(await db.transaction(async q=>{
   const s=(await q.query('SELECT * FROM software_company_subscriptions WHERE org_id=$1 AND company_id=$2 FOR UPDATE',[o,b.companyId])).rows[0];need(s&&s.amount_cents>0,400,'Set this company’s agreed monthly price first.');
   const existing=(await q.query("SELECT * FROM software_company_invoices WHERE org_id=$1 AND company_id=$2 AND status='unpaid'",[o,b.companyId])).rows[0];if(existing)return existing;
   const start=s.period_end&&new Date(s.period_end)>new Date()?s.period_end:new Date().toISOString();
   const invoice=(await q.query(`INSERT INTO software_company_invoices(id,org_id,company_id,plan_name,amount_cents,currency,period_start,period_end)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7::timestamptz+interval '1 month') RETURNING *`,[id(),o,b.companyId,s.plan_name,s.amount_cents,s.currency,start])).rows[0];
   await audit(q,u.id,o,'software.company_invoice_created',{invoiceId:invoice.id,companyId:b.companyId});return invoice;
  }));
 });
 app.post('/api/org/:org/service-management/invoices/:invoice/settle',async(req,res)=>{
  const u=await auth.owner(req),o=org(req),b=companyInput.extend({reference:text(200).refine(v=>v.length>=6),verified:z.literal(true)}).strict().parse(req.body);
  await db.transaction(async q=>{
   await q.query('SELECT company_id FROM software_company_subscriptions WHERE org_id=$1 AND company_id=$2 FOR UPDATE',[o,b.companyId]);
   const i=(await q.query('SELECT * FROM software_company_invoices WHERE id=$1 AND org_id=$2 AND company_id=$3 FOR UPDATE',[uuid.parse(req.params.invoice),o,b.companyId])).rows[0];need(i,404,'Invoice not found for this company.');
   if(i.status==='paid'){need(i.payment_reference===b.reference,409,'This invoice was already paid with another reference.');return;}
   need(i.status==='unpaid',409,'This invoice was voided.');need(new Date(i.period_end)>new Date(),409,'This invoice period expired. Void it and create a current invoice.');
   // Old organization payment references cannot be reused as a new company payment.
   need(!(await q.query('SELECT 1 FROM software_invoices WHERE org_id=$1 AND payment_reference=$2',[o,b.reference])).rows.length,409,'This reference is already recorded in earlier software billing.');
   await q.query("UPDATE software_company_invoices SET status='paid',payment_reference=$1,paid_at=now() WHERE id=$2",[b.reference,i.id]);
   await q.query(`UPDATE software_company_subscriptions SET status='active',period_start=CASE WHEN status='active' AND period_end>now() THEN period_start ELSE LEAST($3::timestamptz,now()) END,
    period_end=$4,legacy_access=false,updated_at=now() WHERE org_id=$1 AND company_id=$2`,[o,b.companyId,i.period_start,i.period_end]);
   await audit(q,u.id,o,'software.company_invoice_paid',{invoiceId:i.id,companyId:b.companyId,reference:b.reference});
  });res.json({ok:true});
 });
 app.post('/api/org/:org/service-management/invoices/:invoice/void',async(req,res)=>{
  const u=await auth.owner(req),o=org(req),b=companyInput.strict().parse(req.body);
  need((await db.query("UPDATE software_company_invoices SET status='void' WHERE id=$1 AND org_id=$2 AND company_id=$3 AND status='unpaid' RETURNING id",[uuid.parse(req.params.invoice),o,b.companyId])).rows.length,409,'Only an unpaid invoice belonging to this company can be voided.');
  await audit(db,u.id,o,'software.company_invoice_voided',{invoiceId:req.params.invoice,companyId:b.companyId});res.json({ok:true});
 });
 app.post('/api/org/:org/service-management/cancel',async(req,res)=>{
  const u=await auth.owner(req),o=org(req),b=companyInput.strict().parse(req.body);
  await db.transaction(async q=>{need((await q.query("UPDATE software_company_subscriptions SET status='cancelled',updated_at=now() WHERE org_id=$1 AND company_id=$2 RETURNING company_id",[o,b.companyId])).rows.length,404,'Company plan not found.');
   await q.query("UPDATE software_company_invoices SET status='void' WHERE org_id=$1 AND company_id=$2 AND status='unpaid'",[o,b.companyId]);await audit(q,u.id,o,'software.company_cancelled',b);});res.json({ok:true});
 });
}
