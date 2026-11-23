import {z} from 'zod';
import type {Query,Row} from './db.ts';
import {need} from './core.ts';
import type {Access} from './auth.ts';
export const serviceAccessInput=z.object({voice:z.boolean(),chat:z.boolean(),software:z.enum(['none','read','edit','admin'])}).strict();
export async function serviceProfile(q:Query,user:Row,org:string,member?:Row) {
 const o=(await q.query('SELECT services,billing_mode FROM organizations WHERE id=$1',[org])).rows[0];
 need(o,404,'Workspace not found.');
 const m=member||(await q.query('SELECT * FROM memberships WHERE org_id=$1 AND user_id=$2 AND active=true',[org,user.id])).rows[0];
 const platformOwner=user.platform_role==='owner',workspaceOwner=m?.role==='owner';
 const grants=m?.service_access||{voice:true,chat:true,software:'none'};
 const assigned=!m&&(await q.query('SELECT 1 FROM support_assignments WHERE org_id=$1 AND user_id=$2',[org,user.id])).rows.length>0;
 const admitted=platformOwner||!!m||assigned;
 const software=platformOwner||workspaceOwner?'admin':m?.role==='viewer'&&grants.software!=='none'?'read':m?grants.software||'none':'none';
 return {voice:admitted&&(platformOwner||(o.services.voice!==false&&(workspaceOwner||grants.voice===true))),chat:admitted&&(platformOwner||(o.services.chat!==false&&(workspaceOwner||grants.chat===true))),software,platformOwner,workspaceOwner,configured:o.services};
}
export async function softwareCompany(q:Query,a:Access,requested?:string) {
 const params:any[]=[a.orgId];let clause='';
 if(a.companyId){params.push(a.companyId);clause+=` AND id=$${params.length}`;}
 if(requested){params.push(requested);clause+=` AND id=$${params.length}`;}
 const company=(await q.query(`SELECT id,name FROM companies WHERE org_id=$1${clause} ORDER BY name,id LIMIT 1`,params)).rows[0];
 need(company,404,'Company not found within your assigned workspace.');return company;
}
export async function softwareEntitlement(q:Query,org:string,company:string) {
 const o=(await q.query('SELECT o.billing_mode FROM organizations o JOIN companies c ON c.org_id=o.id WHERE o.id=$1 AND c.id=$2',[org,company])).rows[0];need(o,404,'Company not found.');
 const s=(await q.query('SELECT * FROM software_company_subscriptions WHERE org_id=$1 AND company_id=$2',[org,company])).rows[0]||null;
 const active=o.billing_mode==='internal'||!!(s&&['trial','active'].includes(s.status)&&s.period_start&&new Date(s.period_start)<=new Date()&&s.period_end&&new Date(s.period_end)>new Date());
 return {companyId:company,subscription:s,active,internal:o.billing_mode==='internal',state:o.billing_mode==='internal'?'internal':active?s.status:s?.status==='cancelled'?'cancelled':s?.period_end&&new Date(s.period_end)<=new Date()?'expired':'not active'};
}
export async function requireSoftware(q:Query,org:string,company:string){need((await softwareEntitlement(q,org,company)).active,402,'This company’s business software is read-only. Ask Nerix to activate or renew its monthly plan.');}
export async function preserveLegacySoftwareAccess(q:Query){
 await q.query(`INSERT INTO software_company_subscriptions(company_id,org_id,plan_name,amount_cents,currency,status,period_start,period_end,legacy_access)
  SELECT c.id,c.org_id,s.plan_name,0,s.currency,s.status,s.period_start,s.period_end,true
  FROM companies c JOIN software_subscriptions s ON s.org_id=c.org_id ON CONFLICT(company_id) DO NOTHING`);
}
