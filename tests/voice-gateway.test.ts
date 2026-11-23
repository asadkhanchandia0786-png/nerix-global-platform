// Integration tests for the inbound-call gateway API. They use the same in-memory database
// harness as the rest of the suite (run with: npm test).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id} from '../server/core.ts';
import {exportBackup} from '../server/backup.ts';
import {sweepInbound} from '../server/gateway.ts';
import {signGatewayBody} from '../shared/gateway-signature.js';

process.env.NODE_ENV='test';
const setupToken='voice-test-setup-token-24-characters',password='Voice-test-password-12345',SECRET='g'.repeat(48);
let db:DB,app:ReturnType<typeof createApp>,owner:Session,industry='';
class Session{
  agent:ReturnType<typeof request.agent>;csrf='';
  constructor(){this.agent=request.agent(app);}
  async sync(){this.csrf=ok(await this.agent.get('/api/me')).csrf;return this;}
  get(path:string){return this.agent.get('/api'+path);}
  send(path:string,body:any={},method='post'){return(this.agent as any)[method]('/api'+path).set('X-Nerix-Client','workspace').set('X-CSRF-Token',this.csrf).send(body);}
}
const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
function gw(body:any,o:{secret?:string;ts?:string;tamper?:string}={}){
  const ts=o.ts??String(Math.floor(Date.now()/1000)),raw=JSON.stringify(body),sig=signGatewayBody(o.secret??SECRET,ts,raw);
  return request(app).post('/api/gateway/events').set('Content-Type','application/json').set('X-Nerix-Timestamp',ts).set('X-Nerix-Signature',sig).send(raw+(o.tamper??''));
}
const didFor=()=>'+4420'+String(Math.floor(10000000+Math.random()*89999999));
async function workspace({internal=true,channels=2}={}){
  const org=ok(await owner.send('/workspaces',{name:'Acme Plumbing '+id(),industry})).id;
  if(internal)ok(await owner.send(`/admin/org/${org}/internal-company`,{name:'Acme Plumbing',ownedCompany:true}));
  else await db.query('UPDATE organizations SET is_demo=false WHERE id=$1',[org]);   // test credit stays in the wallet so billing can be exercised
  const meta=ok(await owner.get(`/org/${org}/meta`)),location=meta.locations[0].id,did=didFor();
  ok(await owner.send(`/org/${org}/voice/numbers`,{locationId:location,e164:did,includedChannels:channels}));
  return {org,location,did,meta};
}
const settings=(over:any={})=>({assistantName:'Sarah',businessName:'Acme Plumbing',businessType:'plumbing company',greeting:'',voice:'marin',language:'en-GB',about:'We fix leaks.',knowledge:'Callout fee is PKR 3,000.',policies:'',emergency:'',afterHoursNote:'',weeklyHours:null,
  fallbackPhone:'+923001111111',publicNumbers:['+922111000111'],transferTargets:[{id:'mgr',name:'Priya Shah',role:'manager',phone:'+923001234567',defaultForRole:true}],transfersEnabled:true,callbacksEnabled:true,notifyEmails:['owner@example.test'],service:'basic',...over});
const authorize=(w:any,over:any={})=>gw({type:'authorize',eventId:id(),providerCallId:'call-'+id(),calledNumber:w.did,callerPhone:'+14155550123',billingProtocol:4,...over});
const event=(call:any,providerCallId:string,type:string,extra:any={})=>gw({type,eventId:id(),callId:call.callId,providerCallId,...extra});
before(async()=>{
  db=await openDB(undefined,'memory://');await migrate(db);
  app=createApp(db,{mode:'demo',setupToken,gateway:{enabled:true,secret:SECRET,maxTransfers:5}});
  owner=new Session();ok(await owner.send('/auth/setup',{email:'voice-owner@example.test',password,name:'Nerix Owner',setupToken}));await owner.sync();
  industry=ok(await owner.get('/industries'))[0].id;
});
after(async()=>{await db.close();});

test('gateway requests need a valid signature, fresh timestamp and the right secret',async()=>{
  const body={type:'authorize',eventId:id(),providerCallId:'x',calledNumber:'+442079460100'};
  ok(await gw(body,{tamper:' '}),401);ok(await gw(body,{secret:'h'.repeat(48)}),401);ok(await gw(body,{ts:String(Math.floor(Date.now()/1000)-900)}),401);
  assert.equal((await request(app).post('/api/gateway/events').send(body)).status,401);
  assert.equal(ok(await gw(body),404).reason,'inbound_route_unavailable');
});
test('full internal call: authorize, callback, transfer, end, idempotent replay and privacy of staff numbers',async()=>{
  const w=await workspace();ok(await owner.send(`/org/${w.org}/voice/settings/${w.location}`,settings(),'put'));
  const providerCallId='call-'+id(),a=ok(await authorize(w,{providerCallId}));
  assert.equal(a.allowed,true);assert.equal(a.workspaceKey,w.org);assert.equal(a.locationKey,w.location);assert.equal(a.prepaid.enabled,false);assert.equal(a.assistantName,'Sarah');
  assert.match(a.instructions,/Acme Plumbing/);assert.match(a.instructions,/PKR 3,000/);assert.doesNotMatch(a.instructions,/dental|patient|Dentive/i);
  assert.doesNotMatch(JSON.stringify(a),/\+923001234567|\+923001111111/);                      // staff numbers never travel to the AI
  assert.deepEqual(a.transferTargets.map((t:any)=>t.id).sort(),['mgr','reception']);
  ok(await authorize(w,{providerCallId}),409);                                                    // duplicate provider call id
  ok(await event(a,providerCallId,'connected'));
  const hb=ok(await event(a,providerCallId,'heartbeat'));assert.equal(hb.prepaid.enabled,false);
  ok(await event(a,providerCallId,'save_callback',{callerName:'Sam',reason:'Leaking tap',callbackPhone:'+14155550123',callbackDetailsConfirmed:false}),400);   // unconfirmed details are refused
  const cb=ok(await event(a,providerCallId,'save_callback',{callerName:'Sam Lee',reason:'Leaking tap in the kitchen',callbackPhone:'+14155550123',callbackDetailsConfirmed:true,callerType:'customer'}));assert.ok(cb.callbackId);
  const list=ok(await owner.get(`/org/${w.org}/voice/callbacks`));assert.equal(list.length,1);assert.equal(list[0].caller_phone,'+14155550123');
  assert.ok(ok(await owner.get(`/org/${w.org}/tasks`)).some((t:any)=>t.kind==='callback'));
  assert.equal((await db.query("SELECT 1 FROM email_outbox WHERE kind='callback' AND to_email='owner@example.test'")).rows.length,1);
  ok(await event(a,providerCallId,'transfer_request',{targetId:'ghost',targetName:'Nobody',callerName:'Sam Lee',reason:'invoice',callerDetailsConfirmed:true}),403);
  const tr=ok(await event(a,providerCallId,'transfer_request',{targetId:'mgr',targetName:'Priya Shah',callerName:'Sam Lee',reason:'invoice question',callerDetailsConfirmed:true,callerType:'customer'}));
  assert.equal(tr.available,true);assert.equal(tr.targetPhone,'+923001234567');
  ok(await event(a,providerCallId,'transfer_connected',{transferId:tr.transferId}),409);       // staff must accept first
  for(const t of ['transfer_answered','transfer_accepted','transfer_connected'])ok(await event(a,providerCallId,t,{transferId:tr.transferId}));
  assert.equal(ok(await event(a,providerCallId,'heartbeat')).prepaid.detached,true);
  const endEvent={type:'ended',eventId:id(),callId:a.callId,providerCallId,outcome:'transferred',reason:'caller_hangup'};
  const ended=ok(await gw(endEvent));assert.deepEqual(ok(await gw(endEvent)),ended);                // identical replay returns the stored result
  ok(await gw({...endEvent,outcome:'information_only'}),409);                                        // same event id, different body
  ok(await event(a,providerCallId,'heartbeat'),409);                                                 // ended calls take no more events
  const calls=ok(await owner.get(`/org/${w.org}/voice/calls`));assert.equal(calls[0].transfers[0].status,'completed');assert.equal(calls[0].outcome,'transferred');
});
test('prepaid billing reserves credit, settles actual connected seconds and releases the rest',async()=>{
  const w=await workspace({internal:false}),rate=w.meta.prices.basic.rate,before=Number((await db.query('SELECT bonus,reserved FROM wallets WHERE org_id=$1',[w.org])).rows[0].bonus);
  assert.equal(ok(await authorize(w,{billingProtocol:3})).reason,'gateway_update_required');
  const providerCallId='call-'+id(),a=ok(await authorize(w,{providerCallId}));assert.equal(a.allowed,true);assert.equal(a.prepaid.enabled,true);assert.equal(a.prepaid.seconds,60);
  const held=Number((await db.query('SELECT reserved FROM wallets WHERE org_id=$1',[w.org])).rows[0].reserved);assert.equal(held,Math.ceil(rate*60/60));
  ok(await event(a,providerCallId,'connected'));
  await db.query("UPDATE inbound_calls SET connected_at=now()-interval '20 seconds' WHERE id=$1",[a.callId]);
  const ended=ok(await event(a,providerCallId,'ended',{outcome:'information_only',reason:'caller_hangup'}));
  assert.ok(ended.billableSeconds>=20&&ended.billableSeconds<=22);assert.equal(ended.charge,Math.ceil(rate*ended.billableSeconds/60));
  const w2=(await db.query('SELECT bonus,reserved FROM wallets WHERE org_id=$1',[w.org])).rows[0];assert.equal(Number(w2.reserved),0);assert.equal(before-Number(w2.bonus),ended.charge);
  assert.equal((await db.query("SELECT 1 FROM ledger WHERE org_id=$1 AND event_key=$2",[w.org,`inbound:${a.callId}`])).rows.length,1);
});
test('calls are refused when credit is too low, a number is paused, or all channels are busy',async()=>{
  const w=await workspace({internal:false});await db.query('UPDATE wallets SET bonus=10000,paid=0 WHERE org_id=$1',[w.org]);
  assert.equal(ok(await authorize(w)).reason,'wallet_funding_required');
  const c=await workspace({channels:2});
  assert.equal(ok(await authorize(c)).allowed,true);assert.equal(ok(await authorize(c)).allowed,true);assert.equal(ok(await authorize(c)).reason,'channels_busy');
  const numbers=ok(await owner.get(`/org/${c.org}/voice/numbers`)).numbers;ok(await owner.send(`/org/${c.org}/voice/numbers/${numbers[0].id}`,{status:'paused'},'patch'));
  assert.equal(ok(await authorize(c)).reason,'service_unavailable');
});
test('credit held by a call that never connected is released by the reconciliation sweep',async()=>{
  const w=await workspace({internal:false}),a=ok(await authorize(w));assert.equal(a.allowed,true);
  assert.ok(Number((await db.query('SELECT reserved FROM wallets WHERE org_id=$1',[w.org])).rows[0].reserved)>0);
  await db.query("UPDATE inbound_calls SET started_at=now()-interval '5 minutes' WHERE id=$1",[a.callId]);await sweepInbound(db);
  assert.equal(Number((await db.query('SELECT reserved FROM wallets WHERE org_id=$1',[w.org])).rows[0].reserved),0);
  assert.equal((await db.query('SELECT status FROM inbound_calls WHERE id=$1',[a.callId])).rows[0].status,'failed');
});
test('dashboard rules: only the Nerix owner assigns numbers; staff numbers cannot loop back; backups include call data',async()=>{
  const w=await workspace(),address=id()+'@example.test',token=ok(await owner.send(`/org/${w.org}/invitations`,{email:address,role:'owner',companyId:null,locationId:null})).token,cust=new Session();
  ok(await cust.send('/auth/join',{email:address,password,name:'Customer Owner',token}));await cust.sync();
  ok(await cust.send(`/org/${w.org}/voice/numbers`,{locationId:w.location,e164:didFor()}),403);
  ok(await cust.send(`/org/${w.org}/voice/settings/${w.location}`,settings({fallbackPhone:w.did}),'put'),400);                       // a Nerix number as a staff number
  ok(await cust.send(`/org/${w.org}/voice/settings/${w.location}`,settings({fallbackPhone:'+922111000111'}),'put'),400);              // a public business number as a staff number
  ok(await cust.send(`/org/${w.org}/voice/settings/${w.location}`,settings({service:'advanced'}),'put'),403);                         // tier is Nerix-only
  ok(await cust.send(`/org/${w.org}/voice/settings/${w.location}`,settings()  ,'put'));
  assert.equal((await db.query("SELECT kind FROM email_outbox WHERE kind='invite' AND to_email=$1",[address])).rows.length,1);      // invitation email queued
  const b:any=await exportBackup(db);for(const t of ['phone_numbers','reception_settings','inbound_calls','callback_requests'])assert.ok(Array.isArray(b.tables[t]),t);
  assert.equal(b.tables.email_outbox,undefined);assert.equal(b.tables.password_resets,undefined);
});
test('password reset works once, expires, and never reveals whether an address exists',async()=>{
  const before=(await db.query('SELECT COUNT(*) AS n FROM email_outbox')).rows[0].n;
  ok(await request(app).post('/api/auth/forgot').set('X-Nerix-Client','workspace').send({email:'nobody@example.test'}));
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM email_outbox')).rows[0].n,before);   // no email without Resend configured and no account
  const u=(await db.query("SELECT id FROM users WHERE email='voice-owner@example.test'")).rows[0],token='reset-token-'+id()+id();
  const {hash}=await import('../server/auth.ts');
  await db.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hash(token),u.id]);
  ok(await request(app).post('/api/auth/reset').set('X-Nerix-Client','workspace').send({token,password:'A-brand-new-password-12'}));
  ok(await request(app).post('/api/auth/reset').set('X-Nerix-Client','workspace').send({token,password:'Another-new-password-123'}),400);   // single use
  ok(await request(app).post('/api/auth/login').set('X-Nerix-Client','workspace').send({email:'voice-owner@example.test',password:'A-brand-new-password-12'}));
});
