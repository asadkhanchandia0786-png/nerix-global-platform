import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id,createOrg} from '../server/core.ts';
import {readFile} from 'node:fs/promises';
import {softwareEntitlement} from '../server/services.ts';
import {exportBackup,restoreBackup} from '../server/backup.ts';
process.env.NODE_ENV='test';
let db:DB,app:ReturnType<typeof createApp>,owner:Session;
const password='Software-test-password-42',setupToken='software-test-setup-token-at-least-24-chars';
class Session{
 agent:ReturnType<typeof request.agent>;csrf='';me:any;
 constructor(){this.agent=request.agent(app);}
 async sync(){this.me=ok(await this.agent.get('/api/me'));this.csrf=this.me.csrf;return this;}
 async send(path:string,body:any={},method='post'){return (this.agent as any)[method]('/api'+path).set('X-Nerix-Client','workspace').set('X-CSRF-Token',this.csrf).send(body);}
 get(path:string){return this.agent.get('/api'+path);}
 async signup(){ok(await this.send('/auth/signup',{email:`${id()}@example.test`,password,name:'Customer',business:'Example business',industry:'general'}));return this.sync();}
}
const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
before(async()=>{db=await openDB(undefined,'memory://');await migrate(db);app=createApp(db,{mode:'demo',setupToken});owner=new Session();ok(await owner.send('/auth/setup',{email:'software-owner@example.test',password,name:'Software Owner',setupToken}));await owner.sync();});
after(async()=>db.close());
async function fixture(active=true){const s=await new Session().signup(),org=s.me.orgs[0].id,meta=ok(await s.get(`/org/${org}/meta`)),company=meta.companies[0].id,location=meta.locations[0].id,base=`/org/${org}/software`,billing=`/org/${org}/service-management`;ok(await owner.send(billing,{companyId:company,planName:'Agreed software plan',amountCents:25000,currency:'USD'},'put'));if(active)ok(await owner.send(billing+'/trial',{companyId:company,days:14}));const modules=ok(await owner.send(base+'/templates',{companyId:company,key:'general'}));return{s,org,meta,company,location,base,billing,modules};}
function body(f:any,overrides:any={}){return{id:id(),title:'Example record',status:f.modules[0].stages[0],locationId:f.location,data:{email:'contact@example.test',phone:'+442079460000',business:'Example',notes:'Test'},assigneeId:null,dueDate:'2026-11-12',archived:false,...overrides};}
function definition(m:any,overrides:any={}){return{name:m.name,description:m.description,fields:m.fields,stages:m.stages,workflows:m.workflows,version:m.version,archived:m.archived,...overrides};}
async function invite(f:any,grants:any,company:string|null=f.company,location:string|null=f.location,role='staff'){const email=`${id()}@example.test`,token=ok(await f.s.send(`/org/${f.org}/invitations`,{email,role,companyId:company,locationId:location,serviceAccess:grants})).token,s=new Session();ok(await s.send('/auth/join',{email,password,name:'Scoped team',token}));await s.sync();return s;}
test('Monthly software access is independent of wallet, manual payment activation is idempotent, expiry retains reads',async()=>{
 const f=await fixture(false),m=f.modules[0],payload=body(f);ok(await f.s.send(f.base+`/modules/${m.id}/records`,payload),402);
 const invoice=ok(await owner.send(f.billing+'/invoices',{companyId:f.company}));assert.equal(invoice.amount_cents,25000);assert.equal(ok(await owner.send(f.billing+'/invoices',{companyId:f.company})).id,invoice.id);
 ok(await f.s.send(f.billing+`/invoices/${invoice.id}/settle`,{companyId:f.company,verified:true,reference:'BANK-123456'}),403);
 ok(await owner.send(f.billing+`/invoices/${invoice.id}/settle`,{companyId:f.company,verified:false,reference:'BANK-123456'}),400);
 const walletBefore=ok(await f.s.get(`/org/${f.org}/wallet`)).wallet;
 ok(await owner.send(f.billing+`/invoices/${invoice.id}/settle`,{companyId:f.company,verified:true,reference:'BANK-123456'}));
 ok(await owner.send(f.billing+`/invoices/${invoice.id}/settle`,{companyId:f.company,verified:true,reference:'BANK-123456'}));
 assert.deepEqual(ok(await f.s.get(`/org/${f.org}/wallet`)).wallet,walletBefore);
 await db.query('UPDATE wallets SET bonus=0,paid=0 WHERE org_id=$1',[f.org]);
 const r=ok(await f.s.send(f.base+`/modules/${m.id}/records`,payload));
 await db.query("UPDATE software_company_subscriptions SET period_end=now()-interval '1 minute' WHERE org_id=$1",[f.org]);
 assert.equal(ok(await f.s.get(f.base)).active,false);ok(await f.s.get(f.base+`/records/${r.id}`));ok(await f.s.get(f.base+`/modules/${m.id}/export`));ok(await f.s.send(f.base+`/records/${r.id}`,{...payload,version:r.version,title:'Cannot update'},'put'),402);
});
test('Software-only staff cannot access voice or chat; revocation takes effect without a new login',async()=>{
 const f=await fixture(),s=await invite(f,{voice:false,chat:false,software:'edit'});for(const path of ['leads','calls','overview','campaigns','tasks','wallet'])ok(await s.get(`/org/${f.org}/${path}`),403);
 const meta=ok(await s.get(`/org/${f.org}/meta`));assert.equal(meta.services.voice,false);assert.equal(meta.services.software,'edit');
 const sites=ok(await s.get('/chat/sites'));assert.equal(sites.sites?.length??sites.length,0);
 const r=ok(await s.send(f.base+`/modules/${f.modules[0].id}/records`,body(f)));
 const member=ok(await f.s.get(f.billing)).members.find((m:any)=>m.user_id===s.me.user.id);ok(await f.s.send(f.billing+`/members/${member.id}`,{voice:true,chat:false,software:'none'},'put'));
 ok(await s.get(f.base+`/records/${r.id}`),403);ok(await s.get(`/org/${f.org}/leads`));
});
test('Company and location isolation applies to record reads, writes, tasks, reports, exports and linked records',async()=>{
 const f=await fixture(),other=await fixture();const loc=ok(await f.s.send(`/org/${f.org}/locations`,{name:'Other branch',companyId:f.company,timezone:'UTC',monthlyCap:null}));
 const contact=ok(await f.s.send(f.base+`/modules/${f.modules[0].id}/records`,body(f,{locationId:loc.id})));
 const staff=await invite(f,{voice:false,chat:false,software:'edit'});
 ok(await staff.get(f.base+`/records/${contact.id}`),404);ok(await staff.send(f.base+`/records/${contact.id}/notes`,{body:'No'}),404);ok(await staff.send(f.base+`/records/${contact.id}/tasks`,{title:'No',dueDate:'2026-11-01',assigneeId:null}),404);
 assert.equal(ok(await staff.get(f.base+`/modules/${f.modules[0].id}/records`)).total,0);assert.equal(ok(await staff.get(f.base+`/modules/${f.modules[0].id}/report`)).statuses.length,0);assert.ok(!ok(await staff.get(f.base+`/modules/${f.modules[0].id}/export`)).csv.includes(contact.id));
 ok(await staff.send(f.base+`/modules/${f.modules[1].id}/records`,body(f,{status:'New',data:{contact:contact.id}})),400);
 ok(await other.s.get(f.base),403);ok(await f.s.get(f.base+`/modules/${other.modules[0].id}/records`),404);
 const different=ok(await f.s.send(`/org/${f.org}/companies`,{name:'Other company',monthlyCap:null}));const differentModules=ok(await owner.send(f.base+'/templates',{companyId:different.id,key:'courier'}));
 ok(await staff.get(f.base+`/modules/${differentModules[0].id}/records`),404);
});
test('Editable templates are idempotent, belong to each company, and preserve manual customizations',async()=>{
 const f=await fixture(),m=f.modules[0];ok(await f.s.send(f.base+`/modules/${m.id}`,definition(m,{name:'Our client book'}),'put'));
 const reapplied=ok(await f.s.send(f.base+'/templates',{companyId:f.company,key:'general'}));assert.equal(reapplied[0].name,'Our client book');assert.equal(reapplied[0].id,m.id);
 const other=ok(await f.s.send(`/org/${f.org}/companies`,{name:'Courier operation',monthlyCap:null}));ok(await owner.send(f.billing,{companyId:other.id,planName:'Courier plan',amountCents:12000,currency:'USD'},'put'));ok(await owner.send(f.billing+'/trial',{companyId:other.id,days:14}));const modules=ok(await f.s.send(f.base+'/templates',{companyId:other.id,key:'courier'}));assert.equal(modules[1].name,'Shipments');assert.notEqual(modules[0].id,m.id);
 const custom=ok(await f.s.send(f.base+'/modules',{companyId:other.id,name:'Equipment',description:'Track equipment',fields:[{key:'serial',label:'Serial number',type:'text',required:true,options:[]}],stages:['Available','Assigned'],workflows:[]}));assert.equal(custom.name,'Equipment');
});
test('Schema validation prevents data loss, stale overwrites, cross-company links and arbitrary fields',async()=>{
 const f=await fixture(),m=f.modules[0],r=ok(await f.s.send(f.base+`/modules/${m.id}/records`,body(f)));
 ok(await f.s.send(f.base+`/modules/${m.id}`,definition(m,{fields:m.fields.slice(1)}),'put'),400);
 ok(await f.s.send(f.base+`/modules/${m.id}`,definition(m,{fields:m.fields.map((v:any,i:number)=>i? v:{...v,type:'number'})}),'put'),400);
 ok(await f.s.send(f.base+`/modules/${m.id}/records`,body(f,{data:{email:'bad'}})),400);
 ok(await f.s.send(f.base+`/modules/${m.id}/records`,body(f,{data:{unrecognized:'x'}})),400);
 const updated=ok(await f.s.send(f.base+`/records/${r.id}`,body(f,{id:r.id,version:r.version,title:'Updated'}),'put'));
 ok(await f.s.send(f.base+`/records/${r.id}`,body(f,{id:r.id,version:r.version,title:'Stale'}),'put'),409);
 assert.equal(ok(await f.s.get(f.base+`/records/${r.id}`)).record.title,'Updated');assert.equal(updated.version,2);
 const archived=ok(await f.s.send(f.base+`/modules/${m.id}`,definition(m,{fields:m.fields.map((v:any)=>({...v,archived:v.key==='notes'}))}),'put'));
 assert.equal(archived.fields.find((v:any)=>v.key==='notes').archived,true);assert.equal(ok(await f.s.get(f.base+`/records/${r.id}`)).record.data.notes,'Test');
 ok(await f.s.send(f.base+`/modules/${m.id}`,definition(m),'put'),409);
});
test('Status workflows run once per transition, retry creates one record, and task changes are audited',async()=>{
 const f=await fixture(),m=f.modules[0];ok(await f.s.send(f.base+`/modules/${m.id}`,definition(m,{workflows:[{id:id(),name:'New client follow-up',trigger:'created',status:'',taskTitle:'Welcome call',dueDays:1,enabled:true},{id:id(),name:'Inactive follow-up',trigger:'status',status:'Inactive',taskTitle:'Check account',dueDays:3,enabled:true}]}),'put'));
 const b=body(f),r=ok(await f.s.send(f.base+`/modules/${m.id}/records`,b));ok(await f.s.send(f.base+`/modules/${m.id}/records`,b));assert.equal(ok(await f.s.get(f.base+`/records/${r.id}`)).tasks.length,1);
 const next=ok(await f.s.send(f.base+`/records/${r.id}`,{...b,version:r.version,status:'Inactive'},'put'));ok(await f.s.send(f.base+`/records/${r.id}`,{...b,version:next.version,status:'Inactive'},'put'));
 const details=ok(await f.s.get(f.base+`/records/${r.id}`));assert.equal(details.tasks.length,2);
 ok(await f.s.send(f.base+`/tasks/${details.tasks[0].id}`,{status:'done'},'patch'));assert.ok(ok(await f.s.get(f.base+`/records/${r.id}`)).history.some((h:any)=>h.kind==='task_updated'));
});
test('Import is atomic, supports validation, and repeated confirmed batches do not duplicate records or tasks',async()=>{
 const f=await fixture(),m=f.modules[0],rows=[body(f),body(f,{title:'Another'})];
 ok(await f.s.send(f.base+`/modules/${m.id}/import`,{rows,preview:true}));assert.equal(ok(await f.s.get(f.base+`/modules/${m.id}/records`)).total,0);
 ok(await f.s.send(f.base+`/modules/${m.id}/import`,{rows:[rows[0],{...rows[1],data:{email:'bad'}}],preview:false}),400);assert.equal(ok(await f.s.get(f.base+`/modules/${m.id}/records`)).total,0);
 assert.equal(ok(await f.s.send(f.base+`/modules/${m.id}/import`,{rows,preview:false})).imported,2);assert.equal(ok(await f.s.send(f.base+`/modules/${m.id}/import`,{rows,preview:false})).skipped,2);
});
test('Read-only and location admins cannot write or change company schemas, software-only organization stays independent',async()=>{
 const f=await fixture(),reader=await invite(f,{voice:false,chat:false,software:'read'}),locationAdmin=await invite(f,{voice:false,chat:false,software:'admin'});
 ok(await reader.get(f.base));ok(await reader.send(f.base+`/modules/${f.modules[0].id}/records`,body(f)),403);ok(await reader.get(f.billing),403);
 ok(await locationAdmin.send(f.base+`/modules/${f.modules[0].id}`,definition(f.modules[0]),'put'),403);
 ok(await owner.send(f.billing+'/services',{voice:false,chat:false},'put'));ok(await f.s.get(`/org/${f.org}/leads`),403);ok(await f.s.get(`/org/${f.org}/overview`),403);ok(await f.s.get(f.base));ok(await f.s.send(f.base+`/modules/${f.modules[0].id}/records`,body(f)));
});
test('CSV export neutralizes spreadsheet formulas and calendar queries filter dates on the server',async()=>{
 const f=await fixture(),m=f.modules[0];ok(await f.s.send(f.base+`/modules/${m.id}/records`,body(f,{title:'=HYPERLINK("https://example.test")'})));ok(await f.s.send(f.base+`/modules/${m.id}/records`,body(f,{dueDate:'2026-12-01'})));
 const csv=ok(await f.s.get(f.base+`/modules/${m.id}/export`)).csv;assert.ok(csv.includes("'=HYPERLINK"));assert.equal(ok(await f.s.get(f.base+`/modules/${m.id}/records?from=2026-11-01&to=2026-11-30`)).total,1);
});
test('Cancelled access is read-only and reactivation cannot recycle a settled payment reference',async()=>{
 const f=await fixture();const invoice=ok(await owner.send(f.billing+'/invoices',{companyId:f.company}));ok(await owner.send(f.billing+`/invoices/${invoice.id}/settle`,{companyId:f.company,reference:'TEST-UNIQUE-123',verified:true}));
 const next=ok(await owner.send(f.billing+'/invoices',{companyId:f.company}));ok(await owner.send(f.billing+`/invoices/${next.id}/settle`,{companyId:f.company,reference:'TEST-UNIQUE-123',verified:true}),409);
 ok(await owner.send(f.billing+'/cancel',{companyId:f.company}));assert.equal(ok(await f.s.get(f.base)).active,false);assert.equal(ok(await f.s.get(f.billing)).invoices.find((i:any)=>i.id===next.id).status,'void');ok(await owner.send(f.billing+'/trial',{companyId:f.company,days:14}),409);
});
test('Backup restores new software records, invoices and access; v0.2.5 backups get safe legacy defaults',async()=>{
 const backup=await exportBackup(db),fresh=await openDB(undefined,'memory://');try{await migrate(fresh);await restoreBackup(fresh,backup);for(const table of ['business_records','software_invoices','software_company_subscriptions','software_company_invoices','business_modules','business_history','business_tasks'])assert.equal(Number((await fresh.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count),backup.tables[table].length);}finally{await fresh.close();}
 const old=structuredClone(backup);old.version='0.2.5';for(const t of ['software_subscriptions','software_invoices','software_company_subscriptions','software_company_invoices','business_modules','business_records','business_history','business_tasks'])delete old.tables[t];for(const t of ['memberships','invitations'])for(const r of old.tables[t] as any[])delete r.service_access;for(const r of old.tables.organizations as any[])delete r.services;
 const legacy=await openDB(undefined,'memory://');try{await migrate(legacy);await restoreBackup(legacy,old);const m=(await legacy.query('SELECT * FROM memberships LIMIT 1')).rows[0];assert.deepEqual(m.service_access,{voice:true,chat:true,software:'none'});assert.equal((await legacy.query('SELECT * FROM business_records')).rows.length,0);await migrate(legacy);}finally{await legacy.close();}
});
test('Chat service grants govern the private inbox and presence, and disabling chat disables its public widget',async()=>{
 const f=await fixture();const site=ok(await f.s.send('/chat/sites',{orgId:f.org,companyId:f.company,locationId:f.location,name:'Customer chat',businessName:'Example business',agentName:'Assistant',purpose:'support',origins:['https://example.test'],knowledge:'Approved support information.',enabled:true}));
 const s=await invite(f,{voice:false,chat:true,software:'none'});assert.equal(ok(await s.get('/chat/sites')).sites.length,1);ok(await s.send(`/chat/sites/${site.id}/presence`,{available:true,capacity:2},'put'));
 const member=ok(await f.s.get(f.billing)).members.find((m:any)=>m.user_id===s.me.user.id);ok(await f.s.send(f.billing+`/members/${member.id}`,{voice:false,chat:false,software:'read'},'put'));assert.equal(ok(await s.get('/chat/sites')).sites.length,0);ok(await s.send(`/chat/sites/${site.id}/presence`,{available:true,capacity:2},'put'),403);
 ok(await request(app).get(`/chat-api/sites/${site.public_key}/config`).set('Origin','https://example.test'));
 ok(await owner.send(f.billing+'/services',{voice:true,chat:false},'put'));ok(await request(app).get(`/chat-api/sites/${site.public_key}/config`).set('Origin','https://example.test'),503);
});
async function secondCompany(f:any,name='Insurance company'){
 const company=ok(await f.s.send(`/org/${f.org}/companies`,{name,monthlyCap:null}));
 const location=ok(await f.s.send(`/org/${f.org}/locations`,{name:'Main office',companyId:company.id,timezone:'UTC',monthlyCap:null}));
 const modules=ok(await owner.send(f.base+'/templates',{companyId:company.id,key:'insurance'}));return{company:company.id,location:location.id,modules};
}
test('Each company has an independently negotiated price, currency and invoice; wrong-company payments cannot activate a plan',async()=>{
 const f=await fixture(false),b=await secondCompany(f);ok(await owner.send(f.billing,{companyId:f.company,planName:'Security agreement',amountCents:17950,currency:'GBP'},'put'));
 ok(await owner.send(f.billing,{companyId:b.company,planName:'Insurance agreement',amountCents:650000,currency:'PKR'},'put'));
 const invoiceA=ok(await owner.send(f.billing+'/invoices',{companyId:f.company})),invoiceB=ok(await owner.send(f.billing+'/invoices',{companyId:b.company}));assert.equal(invoiceA.amount_cents,17950);assert.equal(invoiceA.currency,'GBP');assert.equal(invoiceB.amount_cents,650000);assert.equal(invoiceB.currency,'PKR');assert.notEqual(invoiceA.id,invoiceB.id);
 assert.equal(ok(await f.s.get(f.billing+`?company=${f.company}`)).invoices.length,1);assert.equal(ok(await f.s.get(f.billing+`?company=${b.company}`)).invoices[0].id,invoiceB.id);
 ok(await owner.send(f.billing+`/invoices/${invoiceA.id}/settle`,{companyId:b.company,reference:'WRONG-COMPANY-TEST',verified:true}),404);assert.equal(ok(await f.s.get(f.base+`?company=${f.company}`)).active,false);
 ok(await owner.send(f.billing+`/invoices/${invoiceA.id}/settle`,{companyId:f.company,reference:'SECURITY-BANK-001',verified:true}));assert.equal(ok(await f.s.get(f.base+`?company=${f.company}`)).active,true);assert.equal(ok(await f.s.get(f.base+`?company=${b.company}`)).active,false);
 // A negotiated change applies to future invoices, leaving the existing invoice's amount and currency intact.
 ok(await owner.send(f.billing,{companyId:b.company,planName:'Revised insurance',amountCents:700000,currency:'PKR'},'put'));assert.equal(ok(await owner.send(f.billing+'/invoices',{companyId:b.company})).amount_cents,650000);
 ok(await owner.send(f.billing+`/invoices/${invoiceB.id}/settle`,{companyId:b.company,reference:'SECURITY-BANK-001',verified:true}),409);
 ok(await owner.send(f.billing+`/invoices/${invoiceB.id}/settle`,{companyId:b.company,reference:'INSURANCE-BANK-001',verified:true}));
 const next=ok(await owner.send(f.billing+'/invoices',{companyId:b.company}));assert.equal(next.amount_cents,700000);assert.equal(next.period_start,invoiceB.period_end);
 ok(await f.s.send(f.billing,{companyId:b.company,planName:'Unauthorized discount',amountCents:1,currency:'USD'},'put'),403);
 const foreign=await fixture();ok(await owner.send(f.billing,{companyId:foreign.company,planName:'Wrong workspace',amountCents:5000,currency:'USD'},'put'),404);
 ok(await owner.send(f.billing+'/invoices',{}),400);ok(await owner.send(f.billing,{planName:'Organization price',amountCents:5000,currency:'USD'},'put'),400);
 const scoped=await invite(f,{voice:false,chat:false,software:'edit'});ok(await scoped.get(f.base+`?company=${b.company}`),404);
});
test('Every write uses the target company plan; cancelling one company preserves another company and the voice wallet',async()=>{
 const f=await fixture(),b=await secondCompany(f),rowA=ok(await f.s.send(f.base+`/modules/${f.modules[0].id}/records`,body(f)));
 const bPayload=body(f,{locationId:b.location,status:b.modules[0].stages[0],data:{email:'insurance@example.test',phone:'+442079460000'}});
 // Adding the active company's query string cannot authorize a record in an unpaid company.
 ok(await f.s.send(f.base+`/modules/${b.modules[0].id}/records?company=${f.company}`,bPayload),402);
 ok(await f.s.send(f.base+'/templates',{companyId:b.company,key:'insurance'}),402);
 ok(await owner.send(f.billing,{companyId:b.company,planName:'Insurance negotiated',amountCents:40000,currency:'USD'},'put'));ok(await owner.send(f.billing+'/trial',{companyId:b.company,days:14}));
 const rowB=ok(await f.s.send(f.base+`/modules/${b.modules[0].id}/records`,bPayload));const taskA=ok(await f.s.send(f.base+`/records/${rowA.id}/tasks`,{title:'Company A task',dueDate:'2026-11-01',assigneeId:null}));
 const walletBefore=ok(await f.s.get(`/org/${f.org}/wallet`)).wallet;ok(await owner.send(f.billing+'/cancel',{companyId:f.company}));
 ok(await f.s.send(f.base+`/records/${rowA.id}/notes`,{body:'Not permitted'}),402);ok(await f.s.send(f.base+`/records/${rowA.id}/tasks`,{title:'Not permitted',dueDate:'2026-11-01',assigneeId:null}),402);ok(await f.s.send(f.base+`/tasks/${taskA.id}`,{status:'done'},'patch'),402);
 ok(await f.s.send(f.base+`/records/${rowA.id}`,{...body(f),id:rowA.id,version:rowA.version},'put'),402);ok(await f.s.send(f.base+`/modules/${f.modules[0].id}/import`,{rows:[body(f)],preview:true}),402);
 ok(await f.s.send(f.base+`/modules/${f.modules[0].id}`,definition(f.modules[0]),'put'),402);ok(await f.s.get(f.base+`/records/${rowA.id}`));ok(await f.s.get(f.base+`/modules/${f.modules[0].id}/export`));
 ok(await f.s.send(f.base+`/records/${rowB.id}/notes`,{body:'Still active'}));assert.equal(ok(await f.s.get(f.base+`?company=${b.company}`)).active,true);assert.deepEqual(ok(await f.s.get(`/org/${f.org}/wallet`)).wallet,walletBefore);
 await db.query("UPDATE software_company_subscriptions SET period_end=now()-interval '1 minute' WHERE company_id=$1",[b.company]);ok(await f.s.send(f.base+`/records/${rowB.id}/notes`,{body:'Expired'}),402);assert.equal(ok(await f.s.get(f.base+`?company=${b.company}`)).state,'expired');
});
test('A v0.3.0 upgrade and backup restore preserve paid access and historical invoices without duplicating the old monthly charge',async()=>{
 const legacy=await openDB(undefined,'memory://');let backup:any,orgId:string,companyId:string,otherId:string;
 try{
  await legacy.query('CREATE TABLE migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const [version,file]of [['001','001-foundation.sql'],['002','002-live-chat.sql'],['003','003-internal-companies.sql'],['004','004-business-software.sql']]){const sql=await readFile(new URL('../database/'+file,import.meta.url),'utf8');for(const statement of sql.split('-- statement-break'))if(statement.trim())await legacy.query(statement);await legacy.query('INSERT INTO migrations(version) VALUES($1)',[version]);}
  const user=id();await legacy.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,'migration@example.test','Legacy client','synthetic-test-hash')",[user]);const created=await createOrg(legacy,'Existing group','general',user,true);orgId=created.id;companyId=created.company;otherId=id();await legacy.query("INSERT INTO companies(id,org_id,name) VALUES($1,$2,'Insurance company')",[otherId,orgId]);
  await legacy.query("INSERT INTO software_subscriptions(org_id,plan_name,amount_cents,currency,status,period_start,period_end) VALUES($1,'Old combined agreement',30000,'USD','active',now()-interval '1 day',now()+interval '20 days')",[orgId]);
  await legacy.query("INSERT INTO software_invoices(id,org_id,plan_name,amount_cents,currency,period_start,period_end,status,payment_reference,paid_at) VALUES($1,$2,'Old combined agreement',30000,'USD',now()-interval '1 day',now()+interval '20 days','paid','LEGACY-BANK-001',now())",[id(),orgId]);
  const originalSubscription=(await legacy.query('SELECT * FROM software_subscriptions')).rows[0],originalInvoice=(await legacy.query('SELECT * FROM software_invoices')).rows[0];await migrate(legacy);await migrate(legacy);
  for(const c of [companyId,otherId]){const entitlement=await softwareEntitlement(legacy,orgId,c);assert.equal(entitlement.active,true);assert.equal(entitlement.subscription.amount_cents,0);assert.equal(entitlement.subscription.legacy_access,true);assert.equal(entitlement.subscription.period_end.toISOString(),originalSubscription.period_end.toISOString());}
  assert.deepEqual((await legacy.query('SELECT * FROM software_invoices')).rows[0],originalInvoice);assert.equal((await legacy.query('SELECT * FROM software_company_invoices')).rows.length,0);
  backup=await exportBackup(legacy);backup.version='0.3.0';delete backup.tables.software_company_subscriptions;delete backup.tables.software_company_invoices;
 }finally{await legacy.close();}
 const restored=await openDB(undefined,'memory://');try{await migrate(restored);await restoreBackup(restored,backup);assert.equal((await softwareEntitlement(restored,orgId!,companyId!)).active,true);assert.equal((await softwareEntitlement(restored,orgId!,otherId!)).subscription.amount_cents,0);assert.equal((await restored.query('SELECT * FROM software_invoices')).rows[0].payment_reference,'LEGACY-BANK-001');}finally{await restored.close();}
});
