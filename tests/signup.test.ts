// Self-serve sign-up, email verification, activation lock and owner account tools.
// Run with the rest of the suite: npm test
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id} from '../server/core.ts';
import {startEmail,flush} from '../server/email.ts';
import {orgLock} from '../server/activation.ts';
import {signGatewayBody} from '../shared/gateway-signature.js';

process.env.NODE_ENV='test';
const setupToken='signup-test-setup-token-24-chars',password='Signup-test-password-12345',SECRET='s'.repeat(48);
let db:DB,app:ReturnType<typeof createApp>,owner:Session;
const sent:{to:string;subject:string;text:string}[]=[];let aiCalls=0;
const origin='https://customer-site.example';
const realFetch=globalThis.fetch;
class Session{
  agent:ReturnType<typeof request.agent>;csrf='';
  constructor(){this.agent=request.agent(app);}
  async sync(){this.csrf=ok(await this.agent.get('/api/me')).csrf;return this;}
  get(path:string){return this.agent.get('/api'+path);}
  send(path:string,body:any={},method='post'){return(this.agent as any)[method]('/api'+path).set('X-Nerix-Client','workspace').set('X-CSRF-Token',this.csrf).send(body);}
}
const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const mail=()=>`${id()}@example.test`;
// Delivers queued mail through the stubbed Resend endpoint, then returns the newest 6-digit code sent to the address.
async function codeFor(to:string){await flush();const m=[...sent].reverse().find(x=>x.to===to&&/verification code/.test(x.text));assert.ok(m,'no verification email for '+to);return /\b(\d{6})\b/.exec(m.text)![1];}
async function register(over:any={}){await db.query('DELETE FROM rate_limits');const s=new Session(),email=over.email||mail();const r=await s.send('/auth/register',{name:'Sam Plumber',business:'Sam Plumbing '+id().slice(0,6),email,password,...over});ok(r);return {s,email};}
async function verified(){const {s,email}=await register();ok(await s.send('/auth/verify-email',{email,code:await codeFor(email)}));await s.sync();const org=ok(await s.get('/me')).orgs[0].id;return {s,email,org};}
const gw=(body:any)=>{const ts=String(Math.floor(Date.now()/1000)),raw=JSON.stringify(body);return request(app).post('/api/gateway/events').set('Content-Type','application/json').set('X-Nerix-Timestamp',ts).set('X-Nerix-Signature',signGatewayBody(SECRET,ts,raw)).send(raw);};

before(async()=>{
  globalThis.fetch=(async(url:any,init:any)=>{if(String(url).includes('api.resend.com')){const b=JSON.parse(init.body);sent.push({to:b.to[0],subject:b.subject,text:b.text});return new Response('{"id":"x"}',{status:200});}return realFetch(url,init);}) as typeof fetch;
  db=await openDB(undefined,'memory://');await migrate(db);
  app=createApp(db,{mode:'pilot',setupToken,gateway:{enabled:true,secret:SECRET,maxTransfers:5},chat:{aiEnabled:true,dailyLimit:1000,provider:async()=>{aiCalls++;return{text:'AI reply for the visitor.',usage:{input_tokens:10,output_tokens:5}};}}});
  startEmail(db,{apiKey:'re_test',from:'Nerix <test@example.test>'});
  owner=new Session();
  // sign-up is not open until the platform owner exists
  const early=await new Session().send('/auth/register',{name:'Early',business:'Early Co',email:mail(),password});assert.equal(early.status,409);
  ok(await owner.send('/auth/setup',{email:'signup-owner@example.test',password,name:'Nerix Owner',setupToken}));await owner.sync();
});
after(async()=>{globalThis.fetch=realFetch;await db.close();});

test('register creates an unverified user and a locked, isolated workspace, and signs nobody in',async()=>{
  const {s,email}=await register();
  assert.equal((await s.agent.get('/api/me')).status,401);
  const u=(await db.query('SELECT * FROM users WHERE email=$1',[email])).rows[0];
  assert.equal(u.email_verified_at,null);assert.equal(u.self_registered,true);assert.notEqual(u.password_hash,password);
  const m=(await db.query("SELECT o.* FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE m.user_id=$1 AND m.role='owner'",[u.id])).rows;
  assert.equal(m.length,1);assert.equal(m[0].activation_status,'locked');assert.equal(m[0].self_registered,true);assert.equal(m[0].is_demo,false);
  const w=(await db.query('SELECT paid,bonus FROM wallets WHERE org_id=$1',[m[0].id])).rows[0];assert.equal(Number(w.paid)+Number(w.bonus),0);   // no free credit
  assert.match(await codeFor(email),/^\d{6}$/);
});
test('the dashboard is blocked until the email code is verified; login prompts for it',async()=>{
  const {s,email}=await register();
  const login=await new Session().send('/auth/login',{email,password});assert.equal(login.status,403);assert.equal(login.body.needsVerification,true);
  assert.equal((await s.agent.get('/api/me')).status,401);
  ok(await s.send('/auth/verify-email',{email,code:await codeFor(email)}));
  assert.equal((await s.agent.get('/api/me')).status,200);
  ok(await new Session().send('/auth/login',{email,password}));       // can sign in normally afterwards
  ok(await s.send('/auth/verify-email',{email,code:'123456'}),400);    // a code cannot be used twice
});
test('wrong codes are rejected and the code dies after five failures',async()=>{
  const {s,email}=await register(),good=await codeFor(email),bad=good==='000000'?'111111':'000000';
  for(let i=0;i<5;i++)ok(await s.send('/auth/verify-email',{email,code:bad}),400);
  ok(await s.send('/auth/verify-email',{email,code:good}),400);        // even the right code no longer works
  assert.equal((await db.query('SELECT 1 FROM users WHERE email=$1 AND email_verified_at IS NULL',[email])).rows.length,1);
  assert.equal((await s.send('/auth/verify-email',{email,code:'12345'})).status,400);   // must be six digits
});
test('expired codes fail; resend has a cool-down and gives the same answer for unknown addresses',async()=>{
  const {s,email}=await register();const first=await codeFor(email);
  await db.query("UPDATE email_verifications SET expires_at=now()-interval '1 minute' WHERE user_id=(SELECT id FROM users WHERE email=$1)",[email]);
  ok(await s.send('/auth/verify-email',{email,code:first}),400);
  const before=sent.length;
  await db.query("UPDATE email_verifications SET sent_at=now()-interval '2 minutes' WHERE user_id=(SELECT id FROM users WHERE email=$1)",[email]);
  ok(await s.send('/auth/resend-code',{email}));await codeFor(email);const after1=sent.length;assert.equal(after1,before+1);
  ok(await s.send('/auth/resend-code',{email}));await flush();assert.equal(sent.length,after1);   // inside the cool-down: nothing more is sent
  const unknown=ok(await s.send('/auth/resend-code',{email:mail()}));assert.deepEqual(unknown,{ok:true,verify:true});
  ok(await s.send('/auth/verify-email',{email,code:await codeFor(email)}));
});
test('registering an existing address changes nothing and does not reveal the account',async()=>{
  const {email}=await register();const hashBefore=(await db.query('SELECT password_hash FROM users WHERE email=$1',[email])).rows[0].password_hash;
  const again=await new Session().send('/auth/register',{name:'Intruder',business:'Intruder Co',email,password:'Another-password-98765'});
  assert.deepEqual(ok(again),{ok:true,verify:true});
  const row=(await db.query('SELECT password_hash,name FROM users WHERE email=$1',[email])).rows[0];assert.equal(row.password_hash,hashBefore);assert.equal(row.name,'Sam Plumber');
  assert.equal((await db.query("SELECT 1 FROM organizations WHERE self_registered=true AND name='Intruder Co'")).rows.length,0);
});
test('pre-registration squatting: a later registration replaces an unverified account, so the mailbox owner ends up with their own password',async()=>{
  const email=mail(),attackerPw='Attacker-known-password-1',victimPw='Victim-chosen-password-123';
  await register({email,password:attackerPw,name:'Attacker',business:'Attacker Co'});
  await db.query("UPDATE email_verifications SET created_at=now()-interval '11 minutes' WHERE user_id=(SELECT id FROM users WHERE email=$1)",[email]);   // the first attempt has gone stale
  const {s}=await register({email,password:victimPw,name:'Real Owner',business:'Real Owner Plumbing'});
  ok(await s.send('/auth/verify-email',{email,code:await codeFor(email)}));await s.sync();
  ok(await new Session().send('/auth/login',{email,password:attackerPw}),401);
  ok(await new Session().send('/auth/login',{email,password:victimPw}));
  const org=ok(await s.get('/me')).orgs[0];assert.equal(org.name,'Real Owner Plumbing');assert.equal(ok(await s.get('/me')).user.name,'Real Owner');
  // while a registration is fresh, a second submission cannot change it
  const fresh=mail();await register({email:fresh,password:victimPw,name:'First',business:'First Co'});
  await new Session().send('/auth/register',{name:'Second',business:'Second Co',email:fresh,password:attackerPw});
  assert.equal((await db.query('SELECT name FROM users WHERE email=$1',[fresh])).rows[0].name,'First');
});
test('sign-up and code endpoints are rate limited, and short passwords are refused',async()=>{
  await db.query('DELETE FROM rate_limits');
  ok(await new Session().send('/auth/register',{name:'A',business:'B',email:mail(),password:'short'}),400);
  const email=mail(),s=new Session();ok(await s.send('/auth/register',{name:'Rate',business:'Rate Co',email,password}));
  let blocked=0;for(let i=0;i<8;i++)if((await s.send('/auth/resend-code',{email})).status===429)blocked++;assert.ok(blocked>0);
  let regBlocked=0;for(let i=0;i<8;i++)if((await new Session().send('/auth/register',{name:'Bot',business:'Bot Co',email:mail(),password})).status===429)regBlocked++;assert.ok(regBlocked>0);
});
test('a locked workspace cannot change the AI receptionist, agents, numbers, campaigns or simulations',async()=>{
  const {s,org}=await verified(),meta=ok(await s.get(`/org/${org}/meta`));
  assert.equal(meta.lock.locked,true);
  ok(await s.send(`/org/${org}/voice/settings/${meta.locations[0].id}`,{assistantName:'Sarah',businessName:'X',voice:'marin',language:'en-GB'},'put'),402);
  ok(await s.send(`/org/${org}/agents/basic`,{name:'Sarah',tone:'sarah',language:'en-GB',voice:'marin',knowledge:'',instructions:''},'put'),402);
  const campaign=ok(await s.get(`/org/${org}/campaigns`))[0];
  ok(await s.send(`/org/${org}/campaigns`,{name:'Go',companyId:campaign.company_id,locationId:campaign.location_id,mode:'leadgen',service:'outbound',status:'ready',authorization:true,rules:campaign.rules},'post'),402);
  ok(await s.send(`/org/${org}/simulations`,{campaignId:campaign.id,leadId:id(),seconds:60,requestKey:id(),at:new Date().toISOString()}),402);
  ok(await s.send(`/org/${org}/voice/numbers`,{locationId:meta.locations[0].id,e164:'+442079460111'}),403);   // numbers stay owner-only
  ok(await s.get(`/org/${org}/voice/settings`));ok(await s.get(`/org/${org}/voice/calls`));                       // reading still works
});
test('the Nerix owner can activate a workspace, and a funded wallet also lifts a normal lock but not a hard lock',async()=>{
  const {s,org}=await verified(),agent={name:'Sarah',tone:'sarah',language:'en-GB',voice:'marin',knowledge:'',instructions:''};
  ok(await s.send(`/org/${org}/agents/basic`,agent,'put'),402);
  ok(await s.send(`/admin/org/${org}/activation`,{status:'active'}),403);                                         // customers cannot activate themselves
  ok(await owner.send(`/admin/org/${org}/activation`,{status:'active',note:'Paid by bank transfer'}));
  ok(await s.send(`/org/${org}/agents/basic`,agent,'put'));
  ok(await owner.send(`/admin/org/${org}/activation`,{status:'locked'}));assert.equal((await orgLock(db,org)).locked,true);
  await db.query('UPDATE wallets SET paid=5000000 WHERE org_id=$1',[org]);assert.equal((await orgLock(db,org)).locked,false);
  ok(await owner.send(`/admin/org/${org}/activation`,{status:'suspended'}));assert.equal((await orgLock(db,org)).locked,true);   // funds do not lift a hard lock
  ok(await s.send(`/org/${org}/agents/basic`,agent,'put'),402);
});
test('live calls to a locked workspace are refused before any credit is reserved',async()=>{
  const org=ok(await owner.send('/workspaces',{name:'Locked Calls '+id(),industry:'general'})).id;
  await db.query('UPDATE organizations SET is_demo=false WHERE id=$1',[org]);
  const meta=ok(await owner.get(`/org/${org}/meta`)),did='+4420'+String(Math.floor(10000000+Math.random()*89999999));
  ok(await owner.send(`/org/${org}/voice/numbers`,{locationId:meta.locations[0].id,e164:did}));   // assigned while active
  await db.query("UPDATE organizations SET activation_status='locked' WHERE id=$1",[org]);await db.query('UPDATE wallets SET paid=0,bonus=0 WHERE org_id=$1',[org]);
  const call=()=>gw({type:'authorize',eventId:id(),providerCallId:'call-'+id(),calledNumber:did,callerPhone:'+14155550123',billingProtocol:4});
  const denied=ok(await call());assert.equal(denied.allowed,false);assert.equal(denied.reason,'activation_required');
  assert.equal(Number((await db.query('SELECT reserved FROM wallets WHERE org_id=$1',[org])).rows[0].reserved),0);
  await db.query("UPDATE organizations SET activation_status='active' WHERE id=$1",[org]);
  assert.notEqual(ok(await call()).reason,'activation_required');                                  // once activated the normal checks apply
});
test('locked workspaces get prepared chat replies only, never OpenAI; activation restores the AI',async()=>{
  const {s,org}=await verified();
  const site=ok(await s.send('/chat/sites',{orgId:org,companyId:null,locationId:null,name:'Site',businessName:'Sam Plumbing',agentName:'Sarah',purpose:'support',origins:[origin],knowledge:'Approved information.',enabled:true}));
  const pub=(method:string,path:string,body?:any,token?:string)=>{const r=(request(app) as any)[method]('/chat-api/sites/'+site.public_key+path).set('Origin',origin).set('X-Nerix-Chat','widget');if(token)r.set('Authorization','Bearer '+token);return body===undefined?r:r.send(body);};
  const v=ok(await pub('post','/conversations',{})),path=`/conversations/${v.conversation.id}/messages`;
  const before=aiCalls,first=ok(await pub('post',path,{body:'What do you do?',requestKey:id()},v.token));
  assert.equal(aiCalls,before);assert.equal(first.messages.filter((m:any)=>m.kind==='openai').length,0);   // FAQ reply only
  ok(await owner.send(`/admin/org/${org}/activation`,{status:'active'}));
  const second=ok(await pub('post',path,{body:'And your hours?',requestKey:id()},v.token));
  assert.equal(aiCalls,before+1);assert.equal(second.messages.filter((m:any)=>m.kind==='openai').length,1);
});
test('the owner can create, edit, reset and list customer accounts; customers cannot',async()=>{
  const {s}=await verified();
  ok(await s.get('/admin/accounts'),403);ok(await s.send('/admin/accounts',{name:'X',business:'Y',email:mail()}),403);
  const email=mail(),made=ok(await owner.send('/admin/accounts',{name:'Rita Electric',business:'Rita Electrical',email,activate:true}));
  assert.equal(made.setPasswordLink,null);                                                           // emailed, not shown
  await flush();const welcome=sent.find(x=>x.to===email);assert.ok(welcome);const token=/#reset\?token=([\w-]+)/.exec(welcome!.text)![1];
  ok(await new Session().send('/auth/reset',{token,password}));
  const rita=new Session();ok(await rita.send('/auth/login',{email,password}));await rita.sync();
  assert.equal(ok(await rita.get(`/org/${made.orgId}/meta`)).lock.locked,false);                      // created with activation
  const list=ok(await owner.get('/admin/accounts')).accounts,row=list.find((r:any)=>r.email===email);assert.equal(row.activation_status,'active');assert.equal(row.business,'Rita Electrical');
  const newEmail=mail();ok(await owner.send(`/admin/accounts/${made.userId}`,{name:'Rita E.',business:'Rita Electric Ltd',email:newEmail},'patch'));
  assert.equal((await rita.agent.get('/api/me')).status,401);                                         // changing the email signs her out
  ok(await new Session().send('/auth/login',{email,password}),401);ok(await new Session().send('/auth/login',{email:newEmail,password}));
  assert.equal((await db.query('SELECT name FROM organizations WHERE id=$1',[made.orgId])).rows[0].name,'Rita Electric Ltd');
  ok(await owner.send('/admin/accounts',{name:'Dup',business:'Dup',email:newEmail}),409);
  const direct='Direct-password-set-12345';ok(await owner.send(`/admin/accounts/${made.userId}/password`,{password:direct}));
  ok(await new Session().send('/auth/login',{email:newEmail,password:direct}));
  ok(await owner.send(`/admin/accounts/${made.userId}`,{active:false},'patch'));ok(await new Session().send('/auth/login',{email:newEmail,password:direct}),401);
  ok(await owner.send('/admin/accounts/00000000-0000-4000-8000-000000000000',{active:false},'patch'),404);
});
test('password reset by email also proves the mailbox, so a forgotten code is not a dead end',async()=>{
  const {email}=await register();
  ok(await new Session().send('/auth/forgot',{email}));await flush();
  const m=[...sent].reverse().find(x=>x.to===email&&/#reset\?token=/.test(x.text));assert.ok(m);
  const token=/#reset\?token=([\w-]+)/.exec(m!.text)![1],newPw='Fresh-password-for-reset-12345';
  ok(await new Session().send('/auth/reset',{token,password:newPw}));
  const s=new Session();ok(await s.send('/auth/login',{email,password:newPw}));
});
test('existing accounts and owner-created workspaces are unaffected by the lock',async()=>{
  assert.equal((await db.query('SELECT email_verified_at FROM users WHERE email=$1',['signup-owner@example.test'])).rows[0].email_verified_at!==null,true);
  const org=ok(await owner.send('/workspaces',{name:'Owner made '+id(),industry:'general'})).id;
  assert.equal((await orgLock(db,org)).locked,false);
});
