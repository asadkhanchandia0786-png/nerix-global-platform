import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id,rateFor} from '../server/core.ts';
import {exportBackup,restoreBackup} from '../server/backup.ts';

process.env.NODE_ENV='test';
const setupToken='internal-test-setup-token-24-characters',password='Internal-test-password-12345';
let db:DB,app:ReturnType<typeof createApp>,owner:Session;
class Session{
  agent:ReturnType<typeof request.agent>;csrf='';me:any;
  constructor(){this.agent=request.agent(app);}
  async sync(){this.me=ok(await this.agent.get('/api/me'));this.csrf=this.me.csrf;return this;}
  get(path:string){return this.agent.get('/api'+path);}
  send(path:string,body:any={},method='post'){return(this.agent as any)[method]('/api'+path).set('X-Nerix-Client','workspace').set('X-CSRF-Token',this.csrf).send(body);}
}
const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
async function fixture(){
  const org=ok(await owner.send('/workspaces',{name:'Dentive test '+id()+' · pilot',industry:'dental'})).id;
  const campaign=ok(await owner.get(`/org/${org}/campaigns`))[0],leads=ok(await owner.get(`/org/${org}/leads`));
  ok(await owner.send(`/org/${org}/campaigns/${campaign.id}`,{name:campaign.name,companyId:campaign.company_id,locationId:campaign.location_id,mode:'leadgen',service:'outbound',status:'ready',authorization:true,rules:{days:[1,2,3,4,5,6,7],start:'09:00',end:'17:00',maxAttempts:3,retryHours:48,followupDays:7}},'patch'));
  return {org,campaign,leads};
}
const convert=(org:string,s=owner)=>s.send(`/admin/org/${org}/internal-company`,{name:'Dentive AI',ownedCompany:true});
const start=(f:any,key=id(),lead=f.leads.find((l:any)=>l.disposition==='New'))=>owner.send(`/org/${f.org}/simulations`,{campaignId:f.campaign.id,leadId:lead.id,seconds:90,requestKey:key,at:'2026-10-13T10:00:00Z'});
async function client(org:string){const address=id()+'@example.test',token=ok(await owner.send(`/org/${org}/invitations`,{email:address,role:'owner',companyId:null,locationId:null})).token,s=new Session();ok(await s.send('/auth/join',{email:address,password,name:'Dentive Company Owner',token}));return s.sync();}
before(async()=>{db=await openDB(undefined,'memory://');await migrate(db);app=createApp(db,{mode:'demo',setupToken});owner=new Session();ok(await owner.send('/auth/setup',{email:'internal-owner@example.test',password,name:'Nerix Owner',setupToken}));await owner.sync();});
after(async()=>{await db.close();});

test('Converting an owned demo preserves login and business data, removes test credit once, and exposes zero Nerix rates',async()=>{
  const f=await fixture(),s=await client(f.org),beforeTeam=ok(await owner.get(`/org/${f.org}/team`)).members;
  ok(await owner.send(`/admin/org/${f.org}/internal-company`,{name:'Dentive AI',ownedCompany:false}),400);
  ok(await convert(f.org));ok(await convert(f.org));
  const meta=ok(await s.get(`/org/${f.org}/meta`)),wallet=ok(await s.get(`/org/${f.org}/wallet`));
  assert.equal(meta.org.name,'Dentive AI');assert.equal(meta.org.is_demo,false);assert.equal(meta.org.billing_mode,'internal');
  for(const service of ['outbound','basic','advanced'])assert.equal(meta.prices[service].rate,0);
  assert.equal(Number(wallet.wallet.bonus),0);assert.equal(Number(wallet.wallet.paid),0);assert.equal(wallet.autoRecharge.status,'not_required_internal');
  const removed=wallet.ledger.filter((l:any)=>l.kind==='demo_credit_removed');assert.equal(removed.length,1);assert.equal(Number(removed[0].amount),-300000000);
  assert.equal(ok(await s.get(`/org/${f.org}/team`)).members.length,beforeTeam.length);assert.equal(ok(await s.get(`/org/${f.org}/leads`)).length,f.leads.length);assert.equal(ok(await s.get(`/org/${f.org}/campaigns`))[0].id,f.campaign.id);
  assert.ok(ok(await s.get(`/org/${f.org}/agents`)).some((a:any)=>a.name==='Alex'&&a.service==='outbound'));
});
test('Only the Nerix platform owner can grant internal exemption; customer input cannot change billing mode',async()=>{
  const f=await fixture(),s=await client(f.org);ok(await convert(f.org,s),403);ok(await s.send('/workspaces',{name:'Bypass',industry:'dental',internal:true}),403);
  const publicSignup=new Session();ok(await publicSignup.send('/auth/signup',{name:'Other customer',email:id()+'@example.test',password,business:'Untrusted flags',industry:'general',internal:true,billing_mode:'internal'}));await publicSignup.sync();
  const meta=ok(await publicSignup.get(`/org/${publicSignup.me.orgs[0].id}/meta`));assert.equal(meta.org.billing_mode,'customer');assert.equal(meta.prices.outbound.rate,300000);
  ok(await publicSignup.send(`/org/${publicSignup.me.orgs[0].id}/quotes`,{usd:'5',currency:'USD'}),400);
});
test('Zero-balance internal simulations reserve and charge zero, retain concurrency guards, and respect opt-outs and pause',async()=>{
  const f=await fixture();ok(await convert(f.org));
  const results=await Promise.all([start(f),start(f,id(),f.leads.find((l:any)=>l.disposition==='Interested'))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const call=results.find(r=>r.status===200)!.body;assert.equal(Number(call.rate),0);assert.equal(Number(call.reserved),0);
  const done=ok(await owner.send(`/org/${f.org}/simulations/${call.id}/finish`,{answered:true,outcome:'Interested'}));assert.equal(done.charge,0);assert.equal(done.seconds,90);
  ok(await owner.send(`/org/${f.org}/simulations/${call.id}/finish`,{answered:true,outcome:'Interested'}));
  const wallet=ok(await owner.get(`/org/${f.org}/wallet`));assert.equal(Number(wallet.wallet.bonus),0);assert.equal(wallet.ledger.filter((l:any)=>l.kind==='usage').length,1);assert.equal(wallet.ledger.find((l:any)=>l.kind==='usage').details.billingMode,'internal');
  ok(await start(f,id(),f.leads.find((l:any)=>l.disposition==='Do not call')),409);
  ok(await owner.send(`/admin/org/${f.org}`,{paused:true,rates:{outbound:300000,basic:500000,advanced:750000}},'patch'));
  ok(await start(f,id(),f.leads.find((l:any)=>l.id!==call.lead_id&&l.disposition==='Interested')),409);
});
test('Conversion refuses an active simulation and never discards paid customer funds',async()=>{
  const f=await fixture(),call=ok(await start(f));ok(await convert(f.org),409);
  assert.equal(ok(await owner.get(`/org/${f.org}/meta`)).org.billing_mode,'customer');
  ok(await owner.send(`/org/${f.org}/simulations/${call.id}/finish`,{answered:false,outcome:'No answer'}));ok(await convert(f.org));
  const paid=ok(await owner.send('/workspaces',{name:'Actual paid customer',industry:'general'})).id;
  await db.query('UPDATE organizations SET is_demo=false WHERE id=$1',[paid]);await db.query('UPDATE wallets SET bonus=0 WHERE org_id=$1',[paid]);
  ok(await owner.send(`/admin/org/${paid}/manual-payment`,{usd:'100',currency:'USD',originalMinor:10000,reference:'PAY-'+id(),reason:'Fixture verified transfer',verified:true}));
  ok(await convert(paid),409);assert.equal(Number(ok(await owner.get(`/org/${paid}/wallet`)).wallet.paid),100000000);
});
test('Old checkout links, new top-ups, manual receipts, recharge and credit adjustments cannot fund an exempt company',async()=>{
  const f=await fixture(),q=ok(await owner.send(`/org/${f.org}/quotes`,{usd:'100',currency:'USD'}));ok(await convert(f.org));
  ok(await owner.send(`/org/${f.org}/quotes/${q.id}/confirm-test`,{}),409);
  ok(await owner.send(`/org/${f.org}/quotes`,{usd:'100',currency:'USD'}),409);
  ok(await owner.send(`/org/${f.org}/auto-recharge`,{threshold:'20',amount:'100',monthlyCap:'500',currency:'USD',consent:true},'put'),409);
  ok(await owner.send(`/admin/org/${f.org}/manual-payment`,{usd:'100',currency:'USD',originalMinor:10000,reference:id(),reason:'No payment required',verified:true}),409);
  ok(await owner.send(`/admin/org/${f.org}/credit`,{usd:'100',reference:id(),reason:'Do not credit internal',kind:'promotional_credit'}),409);
  ok(await owner.send(`/admin/org/${f.org}/exceptions`,{usd:'10',currency:'USD',reason:'Not required'}),409);
  const wallet=ok(await owner.get(`/org/${f.org}/wallet`));assert.equal(Number(wallet.wallet.bonus),0);assert.equal(Number(wallet.wallet.paid),0);
});
test('New owned-company workspaces start with no deposit or fake credit and have separate Alex/Sarah profiles',async()=>{
  const org=ok(await owner.send('/workspaces',{name:'Dentive AI owned',industry:'dental',internal:true})).id,meta=ok(await owner.get(`/org/${org}/meta`));
  assert.equal(meta.org.billing_mode,'internal');assert.equal(meta.org.is_demo,false);assert.equal(meta.prices.outbound.rate,0);
  assert.equal(ok(await owner.get(`/org/${org}/leads`)).length,0);const wallet=ok(await owner.get(`/org/${org}/wallet`));assert.equal(wallet.ledger.length,0);assert.equal(Number(wallet.wallet.bonus),0);
  assert.ok(ok(await owner.get(`/org/${org}/agents`)).some((a:any)=>a.name==='Alex'));
});
test('Internal billing survives backup restore; pre-0.2.2 organizations default to normal customer billing',async()=>{
  const f=await fixture();ok(await convert(f.org));const backup=JSON.parse(JSON.stringify(await exportBackup(db))),fresh=await openDB(undefined,'memory://');
  try{await migrate(fresh);await restoreBackup(fresh,backup);assert.equal((await rateFor(fresh,f.org,'outbound')).rate,0);assert.equal((await fresh.query('SELECT billing_mode FROM organizations WHERE id=$1',[f.org])).rows[0].billing_mode,'internal');}finally{await fresh.close();}
  const legacy={...backup,version:'0.2.1',tables:{...backup.tables,organizations:backup.tables.organizations.map(({billing_mode,...o}:any)=>o)}},old=await openDB(undefined,'memory://');
  try{await migrate(old);await restoreBackup(old,legacy);assert.equal((await old.query('SELECT billing_mode FROM organizations WHERE id=$1',[f.org])).rows[0].billing_mode,'customer');assert.equal((await rateFor(old,f.org,'outbound')).rate,300000);}finally{await old.close();}
});
