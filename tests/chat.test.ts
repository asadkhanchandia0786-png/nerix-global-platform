import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id} from '../server/core.ts';
import {recoverChats,type ChatConfig} from '../server/chat.ts';
import {exportBackup,restoreBackup} from '../server/backup.ts';

process.env.NODE_ENV='test';
const password='Chat-test-password-12345',setupToken='chat-test-setup-at-least-24-chars';
const origin='https://nerixglobal.com';
let db:DB,app:ReturnType<typeof createApp>,owner:Session,providerCalls=0;
const config:ChatConfig={aiEnabled:true,dailyLimit:1000,provider:async()=>{providerCalls++;return{text:'Sarah can help with that. What would you like to know next?',usage:{input_tokens:90,output_tokens:20}};}};
class Session {
  agent:ReturnType<typeof request.agent>;csrf='';me:any;
  constructor(){this.agent=request.agent(app);}
  async sync(){const r=ok(await this.agent.get('/api/me'));this.me=r;this.csrf=r.csrf;return this;}
  send(path:string,body:any={},method='post'){return(this.agent as any)[method]('/api'+path).set('X-Nerix-Client','workspace').set('X-CSRF-Token',this.csrf).send(body);}
  get(path:string){return this.agent.get('/api'+path);}
}
const ok=(r:any,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const pub=(site:any,method:string,path:string,body?:any,token?:string,customApp=app)=>{const r=(request(customApp) as any)[method]('/chat-api/sites/'+site.public_key+path).set('Origin',origin).set('X-Nerix-Chat','widget');if(token)r.set('Authorization','Bearer '+token);return body===undefined?r:r.send(body);};
async function newSite(){const org=owner.me.orgs[0].id;return ok(await owner.send('/chat/sites',{orgId:org,companyId:null,locationId:null,name:'Test '+id(),businessName:'Nerix Global',agentName:'Sarah',purpose:'support',origins:[origin],knowledge:'Approved test information only.',enabled:true}));}
async function start(site:any){return ok(await pub(site,'post','/conversations',{}));}
const contact={reason:'I need help choosing the right service.',name:'Visitor Example',email:'visitor@example.test',phone:'+442079460088',consent:true};
async function handoff(site:any,v:any){return ok(await pub(site,'post',`/conversations/${v.conversation.id}/handoff`,contact,v.token));}
async function available(site:any,s=owner,capacity=3){return ok(await s.send(`/chat/sites/${site.id}/presence`,{available:true,capacity},'put'));}
async function invite(role='support',orgs:string[]=[]){const email=id()+'@example.test',token=ok(await owner.send('/admin/invitations',{email,role})).token,s=new Session();ok(await s.send('/auth/join',{token,email,password,name:role+' person'}));await s.sync();ok(await owner.send(`/admin/users/${s.me.user.id}`,{active:true,role,orgIds:orgs},'patch'));ok(await s.send('/auth/login',{email,password}));return s.sync();}

before(async()=>{
  db=await openDB(undefined,'memory://');await migrate(db);app=createApp(db,{mode:'demo',setupToken,chat:config});owner=new Session();
  ok(await request(app).get('/chat-api/sites/nerix-global/config').set('Origin',origin),503);
  ok(await owner.send('/auth/setup',{email:'chat-owner@example.test',password,name:'Chat Owner',setupToken}));await owner.sync();
});
after(async()=>{await db.close();});

test('Public chat uses an allowlist, opaque expiring tokens, no cookie credentials, and idempotent AI replies',async()=>{
  const site=await newSite();ok(await request(app).get(`/chat-api/sites/${site.public_key}/config`).set('Origin','https://attacker.example'),403);
  const pre=await pub(site,'options','/conversations');ok(pre,204);assert.equal(pre.headers['access-control-allow-origin'],origin);assert.ok(!pre.headers['access-control-allow-credentials']);
  const v=await start(site),other=await start(site);ok(await pub(site,'get',`/conversations/${v.conversation.id}`,undefined,other.token),401);
  const key=id(),path=`/conversations/${v.conversation.id}/messages`,before=providerCalls;
  const first=ok(await pub(site,'post',path,{body:'How can Sarah help?',requestKey:key},v.token));
  assert.equal(first.messages.filter((m:any)=>m.kind==='openai').length,1);
  ok(await pub(site,'post',path,{body:'How can Sarah help?',requestKey:key},v.token));assert.equal(providerCalls,before+1);
  await db.query("UPDATE chat_conversations SET expires_at=now()-interval '1 minute' WHERE id=$1",[v.conversation.id]);ok(await pub(site,'get',`/conversations/${v.conversation.id}`,undefined,v.token),401);
});
test('Reason, name, email, phone and contact consent are required; an unavailable team produces one durable follow-up',async()=>{
  const site=await newSite(),v=await start(site),path=`/conversations/${v.conversation.id}/handoff`;
  for(const field of ['reason','name','email','phone','consent']){const input:any={...contact};delete input[field];ok(await pub(site,'post',path,input,v.token),400);}
  ok(await pub(site,'post',path,{...contact,consent:false},v.token),400);
  const out=await handoff(site,v);assert.equal(out.status,'follow_up');assert.equal(out.followup.status,'open');assert.equal(out.contactSaved,true);assert.match(out.messages.at(-1).body,/not available/);
  const again=await handoff(site,v);assert.equal(again.followup.id,out.followup.id);assert.equal(again.messages.filter((m:any)=>m.sender==='system').length,1);
  const staff=ok(await owner.get(`/chat/conversations/${v.conversation.id}`));assert.equal(staff.contact.email,contact.email);assert.equal(staff.reason,contact.reason);
});
test('Two people cannot claim the same visitor; AI stops after a successful human join and only the assigned person may reply',async()=>{
  const site=await newSite(),v=await start(site),second=await invite('support',[site.org_id]);await available(site);await available(site,second);
  assert.equal((await handoff(site,v)).status,'waiting');
  const results=await Promise.all([owner.send(`/chat/conversations/${v.conversation.id}/claim`),second.send(`/chat/conversations/${v.conversation.id}/claim`)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const c=(await db.query('SELECT assigned_to FROM chat_conversations WHERE id=$1',[v.conversation.id])).rows[0],joined=c.assigned_to===owner.me.user.id?owner:second,other=joined===owner?second:owner;
  const before=providerCalls;const msg=ok(await pub(site,'post',`/conversations/${v.conversation.id}/messages`,{body:'Hello to the person who joined.',requestKey:id()},v.token));assert.equal(msg.status,'human');assert.equal(providerCalls,before);
  ok(await other.send(`/chat/conversations/${v.conversation.id}/messages`,{body:'Wrong person',requestKey:id()}),403);
  const response=ok(await joined.send(`/chat/conversations/${v.conversation.id}/messages`,{body:'I can help with that.',requestKey:id()}));assert.equal(response.messages.at(-1).sender,'human');
  ok(await joined.send(`/chat/conversations/${v.conversation.id}/resolve`));const ended=ok(await pub(site,'get',`/conversations/${v.conversation.id}`,undefined,v.token));assert.equal(ended.status,'closed');assert.equal(ended.followup.status,'done');
});
test('An AI reply already in progress cannot interrupt a person who joins',async()=>{
  let started!:()=>void,complete!:(value:any)=>void;const waiting=new Promise<void>(resolve=>started=resolve),answer=new Promise<any>(resolve=>complete=resolve);
  const slow=createApp(db,{mode:'demo',setupToken,chat:{...config,provider:async()=>{started();return answer;}}});
  const site=await newSite(),v=await start(site);await available(site);await handoff(site,v);
  const pending=pub(site,'post',`/conversations/${v.conversation.id}/messages`,{body:'What is the price?',requestKey:id()},v.token,slow).then((r:any)=>r);
  await waiting;ok(await owner.send(`/chat/conversations/${v.conversation.id}/claim`));complete({text:'Late automatic reply that must be discarded.',usage:{input_tokens:7,output_tokens:9}});
  const result=ok(await pending);assert.equal(result.status,'human');assert.ok(!result.messages.some((m:any)=>m.body.includes('must be discarded')));
  const usage=(await db.query('SELECT outcome FROM chat_ai_usage WHERE conversation_id=$1',[v.conversation.id])).rows;assert.equal(usage[0].outcome,'discarded');
});
test('Capacity, stale availability, offline visitors and abandoned handoffs are handled without inventing a connected person',async()=>{
  const site=await newSite();await available(site,owner,1);const first=await start(site);await handoff(site,first);ok(await owner.send(`/chat/conversations/${first.conversation.id}/claim`));
  const second=await start(site);assert.equal((await handoff(site,second)).status,'follow_up');ok(await owner.send(`/chat/conversations/${second.conversation.id}/claim`),409);
  await db.query("UPDATE chat_presence SET seen_at=now()-interval '2 minutes' WHERE site_id=$1",[site.id]);await recoverChats(db);
  const abandoned=ok(await pub(site,'get',`/conversations/${first.conversation.id}`,undefined,first.token));assert.equal(abandoned.status,'follow_up');assert.match(abandoned.messages.at(-1).body,/no longer connected/);
  await available(site);await db.query("UPDATE chat_conversations SET visitor_seen_at=now()-interval '2 minutes' WHERE id=$1",[second.conversation.id]);ok(await owner.send(`/chat/conversations/${second.conversation.id}/claim`),409);
  const third=await start(site);assert.equal((await handoff(site,third)).status,'waiting');await db.query("UPDATE chat_conversations SET queued_at=now()-interval '3 minutes' WHERE id=$1",[third.conversation.id]);await recoverChats(db);
  assert.equal(ok(await pub(site,'get',`/conversations/${third.conversation.id}`,undefined,third.token)).status,'follow_up');
});
test('Public visitors and unauthorized customers cannot read the staff inbox or another customer’s conversations',async()=>{
  const site=await newSite(),v=await start(site);ok(await request(app).get(`/api/chat/conversations/${v.conversation.id}`),401);
  const customer=new Session();ok(await customer.send('/auth/signup',{email:id()+'@example.test',password,name:'Other customer',business:'Other workspace',industry:'general'}));await customer.sync();
  assert.equal(ok(await customer.get('/chat/sites')).sites.length,0);ok(await customer.get(`/chat/sites/${site.id}/inbox`),403);ok(await customer.get(`/chat/conversations/${v.conversation.id}`),403);
  const scoped=await invite('support',[]);ok(await scoped.get(`/chat/sites/${site.id}/inbox`),403);
  const global=(await scoped.get('/chat/sites')).body.sites;assert.ok(global.some((s:any)=>s.public_key==='nerix-global'));assert.ok(!global.some((s:any)=>s.id===site.id));
});
test('Removing staff access revokes their chat session and removes them from availability',async()=>{
  const site=await newSite(),staff=await invite('support',[site.org_id]);await available(site,staff);
  assert.equal(ok(await pub(site,'get','/config')).available,true);
  ok(await owner.send(`/admin/users/${staff.me.user.id}`,{active:false,role:'support',orgIds:[]},'patch'));
  ok(await staff.get(`/chat/sites/${site.id}/inbox`),401);assert.equal(ok(await pub(site,'get','/config')).available,false);
});
test('The OpenAI HTTP adapter uses Responses, bounded output, disabled storage and server-only credentials',async()=>{
  const original=globalThis.fetch;let captured:any;
  globalThis.fetch=(async(url:any,options:any)=>{captured={url,options,body:JSON.parse(options.body)};return new Response(JSON.stringify({id:'response-test',output:[{type:'message',content:[{type:'output_text',text:'An approved answer.'}]}],usage:{input_tokens:12,output_tokens:4}}),{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
  try{
    const live=createApp(db,{mode:'demo',setupToken,chat:{apiKey:'not-a-real-key-used-only-for-contract-test',aiEnabled:true,model:'gpt-4.1-mini'}}),site=await newSite(),v=await start(site);
    const result=ok(await pub(site,'post',`/conversations/${v.conversation.id}/messages`,{body:'Tell me about services.',requestKey:id()},v.token,live));assert.equal(result.messages.at(-1).body,'An approved answer.');
    assert.equal(captured.url,'https://api.openai.com/v1/responses');assert.equal(captured.body.store,false);assert.equal(captured.body.max_output_tokens,350);assert.equal(captured.body.model,'gpt-4.1-mini');assert.match(captured.body.instructions,/Nerix Global's AI assistant/);assert.equal(captured.body.input.at(-1).role,'user');
    assert.ok(!JSON.stringify(result).includes('not-a-real-key'));assert.equal(captured.body.safety_identifier.length,64);
  }finally{globalThis.fetch=original;}
});
test('Provider failures and an exhausted daily limit preserve a usable, honestly labeled FAQ fallback',async()=>{
  const broken=createApp(db,{mode:'demo',setupToken,chat:{...config,provider:async()=>{throw new Error('Temporary failure.');}}}),site=await newSite(),v=await start(site);
  let r=ok(await pub(site,'post',`/conversations/${v.conversation.id}/messages`,{body:'What is the price?',requestKey:id()},v.token,broken));assert.equal(r.messages.at(-1).kind,'faq');assert.match(r.messages.at(-1).body,/temporarily unavailable/);assert.equal(r.busy,false);
  const limited=createApp(db,{mode:'demo',setupToken,chat:{...config,dailyLimit:1}}),before=providerCalls;
  r=ok(await pub(site,'post',`/conversations/${v.conversation.id}/messages`,{body:'What about chat?',requestKey:id()},v.token,limited));assert.equal(r.messages.at(-1).kind,'faq');assert.equal(providerCalls,before);
});
test('Follow-ups and transcripts survive backup restoration while old visitor tokens and staff claims do not',async()=>{
  const site=await newSite(),v=await start(site);await handoff(site,v);const backup=await exportBackup(db),restored=await openDB(undefined,'memory://');
  try{await migrate(restored);await restoreBackup(restored,backup);assert.equal((await restored.query('SELECT reason FROM chat_conversations WHERE id=$1',[v.conversation.id])).rows[0].reason,contact.reason);assert.equal((await restored.query('SELECT status FROM chat_followups WHERE conversation_id=$1',[v.conversation.id])).rows[0].status,'open');
    assert.equal(Number((await restored.query('SELECT count(*) FROM chat_messages WHERE conversation_id=$1',[v.conversation.id])).rows[0].count),v.conversation.messages.length+1);
    assert.equal((await restored.query('SELECT * FROM chat_presence')).rows.length,0);
    const restoredApp=createApp(restored,{mode:'demo',setupToken});ok(await pub(site,'get',`/conversations/${v.conversation.id}`,undefined,v.token,restoredApp),401);
    // Imported bigserial values must not collide with the next new message.
    const fresh=ok(await pub(site,'post','/conversations',{},undefined,restoredApp));
    const next=ok(await pub(site,'post',`/conversations/${fresh.conversation.id}/messages`,{body:'Can I still get help after a restore?',requestKey:id()},fresh.token,restoredApp));
    assert.equal(next.messages.length,3);
    const priorMax=Math.max(...(backup.tables.chat_messages as any[]).map(m=>Number(m.sequence)));
    assert.ok(Number(next.messages[0].sequence)>priorMax);
  }finally{await restored.close();}
});
test('Older open follow-ups remain discoverable after more than 100 newer chats, with complete queue counts and pagination',async()=>{
  const site=await newSite(),v=await start(site);await handoff(site,v);
  await db.transaction(async q=>{for(let i=0;i<105;i++)await q.query('INSERT INTO chat_conversations(id,site_id,token_hash) VALUES($1,$2,$3)',[id(),site.id,id()]);});
  const followups=ok(await owner.get(`/chat/sites/${site.id}/inbox?filter=followup&page=1`));
  assert.equal(followups.conversations.length,1);assert.equal(followups.conversations[0].id,v.conversation.id);assert.equal(followups.counts.all,106);assert.equal(followups.counts.followup,1);
  const first=ok(await owner.get(`/chat/sites/${site.id}/inbox?filter=all&page=1`));
  const second=ok(await owner.get(`/chat/sites/${site.id}/inbox?filter=all&page=2`));
  const third=ok(await owner.get(`/chat/sites/${site.id}/inbox?filter=all&page=3`));
  assert.equal(first.total,106);assert.equal(first.pageSize,50);assert.equal(new Set([...first.conversations,...second.conversations,...third.conversations].map(c=>c.id)).size,106);
});
test('A v0.1.0 foundation backup still restores customer data and gains an empty working chat schema',async()=>{
  const backup=await exportBackup(db),legacy={...backup,version:'0.1.0',tables:Object.fromEntries(Object.entries(backup.tables).filter(([name])=>!name.startsWith('chat_')))},restored=await openDB(undefined,'memory://');
  try{await migrate(restored);await restoreBackup(restored,legacy);assert.equal((await restored.query('SELECT id FROM users')).rows.length,legacy.tables.users.length);assert.equal((await restored.query("SELECT public_key FROM chat_sites WHERE org_id IS NULL")).rows[0].public_key,'nerix-global');assert.equal((await restored.query('SELECT id FROM chat_conversations')).rows.length,0);}finally{await restored.close();}
});
