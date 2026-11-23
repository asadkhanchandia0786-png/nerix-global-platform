import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id,createOrg,chargeFor} from '../server/core.ts';
import {eligibility,mapLead,importSchema} from '../server/leads.ts';
import {expireReservations,credit} from '../server/wallet.ts';
import {exportBackup,restoreBackup} from '../server/backup.ts';
import {buildPrompt} from '../server/agents.ts';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.NODE_ENV='test';
let db:DB,app:ReturnType<typeof createApp>,owner:Session;
const password='Nerix-test-only-password-42',setupToken='test-setup-token-at-least-24-chars';
class Session {
  agent:ReturnType<typeof request.agent>;csrf='';me:any;
  constructor(){this.agent=request.agent(app);}
  async sync(){const r=await this.agent.get('/api/me');assert.equal(r.status,200,JSON.stringify(r.body));this.me=r.body;this.csrf=r.body.csrf;return this;}
  async send(path:string,body:any={},method='post'){return (this.agent as any)[method](`/api${path}`).set('X-Nerix-Client','workspace').set('X-CSRF-Token',this.csrf).send(body);}
  get(path:string){return this.agent.get(`/api${path}`);}
  async signup(name='Separate company'){const r=await this.send('/auth/signup',{email:`${id()}@example.test`,password,name:'Customer',business:name,industry:'general'});assert.equal(r.status,200,JSON.stringify(r.body));return this.sync();}
}
const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
async function fixture(){const s=await new Session().signup(),org=s.me.orgs[0].id,meta=ok(await s.get(`/org/${org}/meta`)),campaign=(ok(await s.get(`/org/${org}/campaigns`)))[0],leads=ok(await s.get(`/org/${org}/leads`));const body={name:campaign.name,companyId:campaign.company_id,locationId:campaign.location_id,mode:'leadgen',service:'outbound',status:'ready',authorization:true,rules:{days:[1,2,3,4,5,6,7],start:'09:00',end:'17:00',maxAttempts:3,retryHours:48,followupDays:7}};ok(await s.send(`/org/${org}/campaigns/${campaign.id}`,body,'patch'));return{s,org,meta,campaign,leads,body};}
async function start(f:any,lead?:any,key=id()){return f.s.send(`/org/${f.org}/simulations`,{campaignId:f.campaign.id,leadId:(lead||f.leads.find((l:any)=>l.disposition==='New')).id,seconds:90,requestKey:key,at:'2026-10-13T10:00:00Z'});}
before(async()=>{db=await openDB(undefined,'memory://');await migrate(db);app=createApp(db,{mode:'demo',setupToken});owner=new Session();
  const early=await owner.send('/auth/signup',{email:'early@example.test',password,name:'Premature',business:'Premature',industry:'general'});ok(early,409);
  ok(await owner.send('/auth/setup',{email:'owner@example.test',password,name:'Nerix Owner',setupToken}));await owner.sync();
});
after(async()=>{await db.close();});
test('Initial owner setup is one-time; passwords are hashed and sessions are HttpOnly',async()=>{
  ok(await owner.send('/auth/setup',{email:'owner2@example.test',password,name:'Another',setupToken}),409);
  const row=(await db.query('SELECT password_hash FROM users WHERE id=$1',[owner.me.user.id])).rows[0];assert.notEqual(row.password_hash,password);assert.ok(!JSON.stringify(owner.me).includes('password_hash'));
  const r=await new Session().send('/auth/login',{email:'owner@example.test',password});ok(r);assert.match(r.headers['set-cookie'][0],/HttpOnly/);assert.match(r.headers['set-cookie'][0],/SameSite=Strict/);
});
test('Customer workspaces are isolated across metadata, leads, wallet, invites and admin APIs',async()=>{
  const a=await fixture(),b=await fixture();for(const path of ['meta','leads','wallet','calls','agents','team','tickets','tasks'])ok(await a.s.get(`/org/${b.org}/${path}`),403);
  ok(await a.s.send(`/org/${b.org}/quotes`,{usd:'100',currency:'USD'}),403);ok(await a.s.get('/admin'),403);
  ok(await a.s.send(`/org/${a.org}/simulations`,{campaignId:a.campaign.id,leadId:b.leads[0].id,seconds:90,requestKey:id(),at:'2026-10-13T10:00:00Z'}),400);
});
test('CSRF, cross-origin requests and wrong Content-Type cannot mutate data',async()=>{
  const f=await fixture();ok(await f.s.agent.post(`/api/org/${f.org}/quotes`).set('X-Nerix-Client','workspace').send({usd:'100',currency:'USD'}),403);
  ok(await f.s.agent.post(`/api/org/${f.org}/quotes`).set('Origin','https://attacker.example').set('X-Nerix-Client','workspace').set('X-CSRF-Token',f.s.csrf).send({usd:'100',currency:'USD'}),403);
  const r=await f.s.agent.post(`/api/org/${f.org}/quotes`).set('X-Nerix-Client','workspace').set('X-CSRF-Token',f.s.csrf).type('form').send('usd=100');ok(r,415);
});
test('90 seconds at USD0.30/minute costs exactly USD0.45 and replays cannot double bill',async()=>{
  const f=await fixture(),key=id(),call=ok(await start(f,undefined,key));assert.equal(Number(call.reserved),450000);
  const replay=ok(await start(f,undefined,key));assert.equal(replay.id,call.id);
  const done=ok(await f.s.send(`/org/${f.org}/simulations/${call.id}/finish`,{answered:true,outcome:'Interested'}));assert.equal(done.charge,450000);
  ok(await f.s.send(`/org/${f.org}/simulations/${call.id}/finish`,{answered:true,outcome:'Interested'}));
  const w=ok(await f.s.get(`/org/${f.org}/wallet`));assert.equal(Number(w.wallet.bonus),299550000);assert.equal(Number(w.wallet.reserved),0);assert.equal(w.ledger.filter((x:any)=>x.kind==='usage').length,1);
  assert.equal(ok(await f.s.get(`/org/${f.org}/tasks`)).length,1);
});
test('Ringing-only simulation is free, and fractional minute rates use exact integer accounting',async()=>{
  const f=await fixture(),c=ok(await start(f));const result=ok(await f.s.send(`/org/${f.org}/simulations/${c.id}/finish`,{answered:false,outcome:'No answer'}));assert.equal(result.charge,0);assert.equal(result.seconds,0);
  assert.equal(chargeFor(300000,1),5000);assert.equal(chargeFor(301001,1),5017);assert.equal(chargeFor(301001,60),301001);
});
test('Concurrent calls cannot reserve the same funds; zero credit blocks new reservations',async()=>{
  const f=await fixture();await db.query('UPDATE wallets SET bonus=450000 WHERE org_id=$1',[f.org]);
  const out=await Promise.all([start(f),start(f,f.leads.find((l:any)=>l.disposition==='Interested'))]);assert.deepEqual(out.map(r=>r.status).sort(),[200,409]);
  const c=out.find(r=>r.status===200)!.body;ok(await f.s.send(`/org/${f.org}/simulations/${c.id}/finish`,{answered:true,outcome:'Not interested'}));
  const w=ok(await f.s.get(`/org/${f.org}/wallet`));assert.equal(Number(w.wallet.bonus),0);assert.equal(Number(w.wallet.reserved),0);ok(await start(f,f.leads.find((l:any)=>l.disposition==='Callback requested')),409);
});
test('Abandoned simulations release funds durably and company caps stop overspending',async()=>{
  const f=await fixture(),c=ok(await start(f));await db.query("UPDATE calls SET expires_at=now()-interval '1 minute' WHERE id=$1",[c.id]);await expireReservations(db);const w=ok(await f.s.get(`/org/${f.org}/wallet`));assert.equal(Number(w.wallet.reserved),0);assert.equal(Number(w.wallet.bonus),300000000);
  await db.query('UPDATE companies SET monthly_cap=400000 WHERE id=$1',[f.campaign.company_id]);ok(await start(f),409);
});
test('Rate changes do not change a call already reserved',async()=>{
  const f=await fixture(),c=ok(await start(f));ok(await owner.send(`/admin/org/${f.org}`,{paused:false,rates:{outbound:600000,basic:500000,advanced:750000}},'patch'));
  const done=ok(await f.s.send(`/org/${f.org}/simulations/${c.id}/finish`,{answered:true,outcome:'Interested'}));assert.equal(done.charge,450000);
});
test('Importer validates country/date format, retains history and durable suppression on reimport',async()=>{
  const f=await fixture(),l=f.leads.find((l:any)=>l.disposition==='New');
  ok(await f.s.send(`/org/${f.org}/leads/${l.id}`,{disposition:'Do not call',note:'Please do not contact again.'},'patch'));
  const body={companyId:l.company_id,locationId:l.location_id,country:'GB',timezone:'Europe/London',dateFormat:'dd/MM/yyyy HH:mm',mapping:{business:'Business',phone:'Phone',contact_name:'Contact',notes:'Notes',callback_at:'Callback'},rows:[{Business:'Changed name',Phone:l.phone,Contact:'Additional contact',Notes:'New note',Callback:'14/10/2026 10:00'}]};
  const preview=ok(await f.s.send(`/org/${f.org}/import/preview`,body));assert.equal(preview[0].suppressed,true);ok(await f.s.send(`/org/${f.org}/import/commit`,body));
  const updated=ok(await f.s.get(`/org/${f.org}/leads`)).find((x:any)=>x.id===l.id);assert.equal(updated.disposition,'Do not call');assert.equal(updated.notes,l.notes);assert.ok(updated.contacts.some((x:any)=>x.name==='Additional contact'));
  assert.equal(ok(await f.s.get(`/org/${f.org}/leads/${l.id}/history`)).length,2);ok(await f.s.send(`/org/${f.org}/leads/${l.id}`,{disposition:'New'},'patch'),409);ok(await start(f,l),409);
  const invalid={...body,rows:[{Business:'Invalid',Phone:'12',Callback:'12/31/2026 10:00'}]};ok(await f.s.send(`/org/${f.org}/import/commit`,invalid),400);
});
test('Import scope cannot move contacts across companies/locations, even by reusing a phone',async()=>{
  const f=await fixture(),l=f.leads[0],loc=ok(await f.s.send(`/org/${f.org}/locations`,{name:'Other branch',companyId:l.company_id,timezone:'Asia/Karachi',monthlyCap:null}));
  const token=ok(await f.s.send(`/org/${f.org}/invitations`,{email:'scoped@example.test',role:'staff',companyId:l.company_id,locationId:loc.id})).token;
  const s=new Session();ok(await s.send('/auth/join',{email:'scoped@example.test',password,name:'Scoped staff',token}));await s.sync();
  assert.equal(ok(await s.get(`/org/${f.org}/leads`)).length,0);ok(await s.get(`/org/${f.org}/leads/${l.id}/history`),404);ok(await s.get(`/org/${f.org}/wallet`),403);
  const b={companyId:l.company_id,locationId:loc.id,country:'GB',timezone:'Europe/London',dateFormat:'yyyy-MM-dd HH:mm',mapping:{business:'b',phone:'p'},rows:[{b:'Duplicate',p:l.phone}]};ok(await s.send(`/org/${f.org}/import/commit`,b),400);
});
test('Recipient timezone, DST, bounded retries and conflicting callbacks are enforced',()=>{
  const c={authorization:true,status:'ready',mode:'leadgen',rules:{days:[2,3],start:'09:00',end:'17:00',maxAttempts:3,retryHours:48}};
  const lead={timezone:'America/New_York',attempts:0,disposition:'New'};
  assert.equal(eligibility(lead,c,false,new Date('2026-10-13T13:00:00Z')),null);
  assert.equal(eligibility(lead,c,false,new Date('2026-11-10T13:00:00Z')),'Outside recipient calling window');
  assert.equal(eligibility({...lead,attempts:3},c,false,new Date('2026-10-13T13:00:00Z')),'Attempt limit reached');
  assert.equal(eligibility({...lead,next_call_at:'2026-10-12T13:00:00Z'},c,false,new Date('2026-10-12T13:00:00Z')),'Requested callback conflicts with campaign window');
  assert.equal(eligibility(lead,c,true,new Date()),'Do not call');
  const b=importSchema.parse({companyId:id(),locationId:id(),country:'US',timezone:'America/New_York',dateFormat:'yyyy-MM-dd HH:mm',mapping:{business:'b',phone:'p',callback_at:'date'},rows:[{}]});
  assert.throws(()=>mapLead({b:'Test',p:'+12125550100',date:'2026-11-01 01:30'},b),/ambiguous/);assert.throws(()=>mapLead({b:'Test',p:'+12125550100',date:'2026-03-08 02:30'},b),/Invalid callback/);
});
test('The first/normal minimum is USD100; seven currencies quote only on server and test payments are idempotent',async()=>{
  const f=await fixture();ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'5',currency:'USD'}),400);
  ok(await owner.send(`/admin/org/${f.org}/exceptions`,{usd:'10',currency:'USD',reason:'Requested help'}),400);
  for(const currency of ['USD','PKR','GBP','EUR','CAD','AED','SAR']){const q=ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'100',currency,charge_minor:1,rate:1}));assert.equal(Number(q.usd),100000000);assert.equal(q.test_mode,true);assert.ok(Number(q.charge_minor)>100);}
  const q=ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'100',currency:'PKR'}));assert.equal(Number(q.charge_minor),2800000);
  const r=await Promise.all([f.s.send(`/org/${f.org}/quotes/${q.id}/confirm-test`,{}),f.s.send(`/org/${f.org}/quotes/${q.id}/confirm-test`,{})]);r.forEach(x=>ok(x));
  const w=ok(await f.s.get(`/org/${f.org}/wallet`));assert.equal(Number(w.wallet.bonus),400000000);assert.equal(Number(w.wallet.paid),0);assert.equal(w.payments.length,1);ok(await f.s.send(`/org/${f.org}/refunds`,{usd:'100',reason:'Refund demo'}),400);
});
test('Private smaller deposits are bound to customer, amount, currency, expiry and single use',async()=>{
  const f=await fixture(),q=ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'100',currency:'USD'}));ok(await f.s.send(`/org/${f.org}/quotes/${q.id}/confirm-test`,{}));
  const exception=ok(await owner.send(`/admin/org/${f.org}/exceptions`,{usd:'10',currency:'USD',reason:'One private later payment'}));
  ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'5',currency:'USD',exceptionId:exception.id}),400);
  ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'10',currency:'GBP',exceptionId:exception.id}),400);
  const one=ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'10',currency:'USD',exceptionId:exception.id})),two=ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'10',currency:'USD',exceptionId:exception.id}));
  ok(await f.s.send(`/org/${f.org}/quotes/${one.id}/confirm-test`,{}));ok(await f.s.send(`/org/${f.org}/quotes/${two.id}/confirm-test`,{}),409);
  const exp=ok(await f.s.send(`/org/${f.org}/quotes`,{usd:'100',currency:'USD'}));await db.query("UPDATE payment_quotes SET expires_at=now()-interval '1 minute' WHERE id=$1",[exp.id]);ok(await f.s.send(`/org/${f.org}/quotes/${exp.id}/confirm-test`,{}),409);
});
test('Refund reserves unused PAID funds only and completes once in original currency without fee deduction',async()=>{
  const org=(await db.transaction(q=>createOrg(q,'Paid refund fixture','general',owner.me.user.id,false))).id;
  const payment={usd:'100',currency:'GBP',originalMinor:7500,reference:`WIRE-${id()}`,reason:'Verified approved transfer',verified:true};ok(await owner.send(`/admin/org/${org}/manual-payment`,payment));ok(await owner.send(`/admin/org/${org}/manual-payment`,payment));
  ok(await owner.send(`/admin/org/${org}/credit`,{usd:'20',reference:id(),reason:'Service goodwill',kind:'promotional_credit'}));
  ok(await owner.send(`/org/${org}/refunds`,{usd:'120',reason:'Must exclude promotion'}),400);
  const refund=ok(await owner.send(`/org/${org}/refunds`,{usd:'100',reason:'Full unused balance'}));ok(await owner.send(`/org/${org}/refunds`,{usd:'100',reason:'Concurrent repeat'}),409);
  let w=ok(await owner.get(`/org/${org}/wallet`));assert.equal(Number(w.wallet.reserved),100000000);assert.equal(w.refunds[0].allocations[0].minor,7500);
  ok(await owner.send(`/admin/org/${org}/refunds/${refund.id}`,{status:'completed',reference:'not-approved-yet'},'patch'),400);
  ok(await owner.send(`/admin/org/${org}/refunds/${refund.id}`,{status:'approved'},'patch'));ok(await owner.send(`/admin/org/${org}/refunds/${refund.id}`,{status:'completed',reference:`REFUND-${id()}`},'patch'));ok(await owner.send(`/admin/org/${org}/refunds/${refund.id}`,{status:'completed',reference:'repeat-reference'},'patch'));
  w=ok(await owner.get(`/org/${org}/wallet`));assert.equal(Number(w.wallet.paid),0);assert.equal(Number(w.wallet.bonus),20000000);assert.equal(Number(w.wallet.reserved),0);assert.equal(w.ledger.filter((l:any)=>l.kind==='refund').length,1);assert.equal(Number(w.payments[0].refunded_minor),7500);
});
test('Customer invitations are one-time; viewers cannot mutate; removing access revokes existing sessions',async()=>{
  const f=await fixture(),address=`${id()}@example.test`,inv=ok(await f.s.send(`/org/${f.org}/invitations`,{email:address,role:'viewer',companyId:null,locationId:null}));
  const s=new Session();ok(await s.send('/auth/join',{email:address,password,name:'Read only',token:inv.token}));await s.sync();
  ok(await new Session().send('/auth/join',{email:address,password,name:'Replay',token:inv.token}),400);ok(await s.send(`/org/${f.org}/tickets`,{subject:'Attempt',message:'Attempt'}),403);
  const members=ok(await f.s.get(`/org/${f.org}/team`)).members,m=members.find((m:any)=>m.email===address);ok(await f.s.send(`/org/${f.org}/team/${m.id}`,{active:false,role:'viewer',companyId:null,locationId:null},'patch'));ok(await s.get(`/org/${f.org}/leads`),401);
});
test('Assigned support can update tickets but cannot see leads, billing or unassigned customers',async()=>{
  const f=await fixture(),address=`${id()}@example.test`,inv=ok(await owner.send('/admin/invitations',{email:address,role:'support'})),s=new Session();ok(await s.send('/auth/join',{email:address,password,name:'Support staff',token:inv.token}));await s.sync();
  ok(await s.get(`/org/${f.org}/overview`),403);ok(await owner.send(`/admin/users/${s.me.user.id}`,{active:true,role:'support',orgIds:[f.org]},'patch'));
  ok(await s.send('/auth/login',{email:address,password}));await s.sync();ok(await s.get(`/org/${f.org}/overview`));ok(await s.get(`/org/${f.org}/leads`),403);ok(await s.get(`/org/${f.org}/wallet`),403);ok(await s.send(`/admin/org/${f.org}/credit`,{usd:'100',reference:id(),reason:'bad',kind:'test_credit'}),403);
  const ticket=ok(await f.s.send(`/org/${f.org}/tickets`,{subject:'Account question',message:'Please help.'}));ok(await s.send(`/org/${f.org}/tickets/${ticket.id}`,{reply:'We are reviewing this.',status:'in_progress'},'patch'));
  ok(await owner.send(`/admin/users/${s.me.user.id}`,{active:false,role:'support',orgIds:[]},'patch'));ok(await s.get(`/org/${f.org}/tickets`),401);
});
test('Recharge preferences never activate automatic payments; public input cannot enable live operation',async()=>{
  const f=await fixture();ok(await f.s.send(`/org/${f.org}/auto-recharge`,{threshold:'20',amount:'100',monthlyCap:'500',currency:'PKR',consent:true,enabled:true},'put'));const w=ok(await f.s.get(`/org/${f.org}/wallet`));assert.equal(w.autoRecharge.enabled,false);assert.equal(w.autoRecharge.status,'awaiting_provider_authorization');assert.equal(w.payments.length,0);
  ok(await f.s.send(`/org/${f.org}/auto-recharge`,{threshold:'20',amount:'10',monthlyCap:'500',currency:'USD',consent:true},'put'),400);
});
test('Referral partners see their own records; demos and self-referrals cannot qualify',async()=>{
  const address=`${id()}@example.test`,inv=ok(await owner.send('/admin/invitations',{email:address,role:'partner'})),s=new Session();ok(await s.send('/auth/join',{email:address,password,name:'Referral partner',token:inv.token}));await s.sync();
  ok(await s.send('/referrals',{business:'Self',email:address,note:'No'}),400);const r=ok(await s.send('/referrals',{business:'A new business',email:`${id()}@example.test`,note:'Requested an introduction.'}));
  const f=await fixture();ok(await owner.send(`/admin/referrals/${r.id}`,{status:'qualified',orgId:f.org,verified:true,contributionPkr:10000,note:'Test cannot qualify',payoutReference:''},'patch'),400);
  ok(await s.get('/admin'),403);assert.equal(ok(await s.get('/referrals')).length,1);ok(await s.get(`/org/${f.org}/overview`),403);
});
test('Sarah preserves the supplied short attentive style; Alex identifies Nerix and avoids pressure',()=>{
  const common={name:'Sarah',language:'en-GB',voice:'marin',knowledge:'Approved info',instructions:''};
  const sarah=buildPrompt({...common,tone:'sarah'},'Customer');assert.match(sarah,/warm, calm, polite and attentive/);assert.match(sarah,/Ask one necessary question at a time/);
  const alex=buildPrompt({...common,name:'Alex',tone:'alex'},'Customer');assert.match(alex,/AI assistant from Nerix Global/);assert.match(alex,/Never use fake urgency/);assert.match(alex,/durable suppression/);
});
test('Backups restore into an empty database with balances and history intact, but never overwrite a populated database',async()=>{
  const dump=JSON.parse(JSON.stringify(await exportBackup(db))),fresh=await openDB(undefined,'memory://');try{await migrate(fresh);await restoreBackup(fresh,dump);for(const t of ['users','organizations','ledger','leads','calls','refunds'])assert.equal((await fresh.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n,(await db.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);await assert.rejects(()=>restoreBackup(fresh,dump),/empty database/);}finally{await fresh.close();}
});
test('Embedded preview data survives a process/database restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'nerix-persist-'));let local=await openDB(undefined,directory);try{await migrate(local);await local.query("INSERT INTO industries VALUES('persistence','Persistence','{}')");await local.close();local=await openDB(undefined,directory);assert.equal((await local.query("SELECT name FROM industries WHERE id='persistence'")).rows[0].name,'Persistence');}finally{await local.close();await rm(directory,{recursive:true,force:true});}
});
