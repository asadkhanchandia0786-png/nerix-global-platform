import express,{type Request} from 'express';
import {z} from 'zod';
import type {DB,Query,Row} from './db.ts';
import {Auth,hash,randomToken,checkScope,validScope} from './auth.ts';
import {id,need,text,email,uuid,audit} from './core.ts';
import {serviceProfile} from './services.ts';
import {orgLock} from './activation.ts';
import {chatInstructions,faqReply} from './chat-policy.ts';

export interface ChatConfig {
  apiKey?:string; aiEnabled?:boolean; model?:string; dailyLimit?:number; appOrigin?:string;
  // Test-only injection. The runtime entrypoint never accepts a provider from a request.
  provider?:(input:{instructions:string;messages:{role:string;content:string}[];model:string;visitor:string})=>Promise<{text:string;usage?:Record<string,unknown>}>;
}

const INTERNAL=['owner','support','operations','closer'];
const siteInput=z.object({name:text(120),businessName:text(180),agentName:text(60),purpose:z.enum(['support','sales']),origins:z.array(z.string().url().max(250)).min(1).max(10),knowledge:z.string().max(12000),enabled:z.boolean()});
const contactInput=z.object({reason:text(2000),name:text(100),email,phone:z.string().trim().regex(/^\+\d[\d ()-]{6,27}$/,'Use a phone number with + and country code.'),consent:z.literal(true)});
const publicToken=(req:Request)=>{const value=req.get('Authorization')||'';need(/^Bearer [A-Za-z0-9_-]{43}$/.test(value),401,'Chat session expired. Start a new conversation.');return value.slice(7);};
const originValue=(value:string)=>{const u=new URL(value);need(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)),400,'Website origins must use HTTPS.');need(value===u.origin,400,'Enter the exact website origin without a path or trailing slash.');return u.origin;};

// Site access is re-evaluated on every private request and availability check.
// Scoped staff only see sites that match their explicit company/location scope.
function permissionSQL(userAlias='u',siteAlias='s') {
  return `(${userAlias}.platform_role='owner' OR ((${siteAlias}.org_id IS NULL OR EXISTS(SELECT 1 FROM organizations so WHERE so.id=${siteAlias}.org_id AND so.services->>'chat'='true')) AND (false
    OR (${siteAlias}.org_id IS NULL AND ${userAlias}.platform_role IN ('support','operations','closer'))
    OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=${userAlias}.id AND m.org_id=${siteAlias}.org_id AND m.active=true AND m.role IN ('owner','manager','staff') AND (m.role='owner' OR m.service_access->>'chat'='true')
      AND (m.company_id IS NULL OR m.company_id=${siteAlias}.company_id) AND (m.location_id IS NULL OR m.location_id=${siteAlias}.location_id))
    OR (${userAlias}.platform_role IN ('support','operations','closer') AND EXISTS(SELECT 1 FROM support_assignments a WHERE a.user_id=${userAlias}.id AND a.org_id=${siteAlias}.org_id)))))`;
}
async function accessibleSites(q:Query,user:Row) {return (await q.query(`SELECT s.* FROM chat_sites s JOIN users u ON u.id=$1 AND u.active=true WHERE ${permissionSQL()} ORDER BY s.created_at`,[user.id])).rows;}
async function siteAccess(q:Query,user:Row,siteId:string) {const s=(await accessibleSites(q,user)).find(s=>s.id===siteId);need(s,403,'This chat site is outside your assigned access.');return s;}
async function manageSite(q:Query,user:Row,site:Row) {
  if(user.platform_role==='owner')return;
  need(site.org_id,403,'Only the Nerix owner can configure the Nerix website.');
  const m=(await q.query("SELECT 1 FROM memberships WHERE user_id=$1 AND org_id=$2 AND active=true AND role='owner' AND company_id IS NULL AND location_id IS NULL",[user.id,site.org_id])).rows[0];
  need(m,403,'The workspace owner must configure this chat site.');
}
async function addMessage(q:Query,cid:string,sender:string,name:string,body:string,key:string,kind='system',user:string|null=null,usage:Record<string,unknown>={}) {
  return (await q.query('INSERT INTO chat_messages(id,conversation_id,sender,sender_name,body,event_key,kind,user_id,usage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(conversation_id,event_key) DO NOTHING RETURNING id',[id(),cid,sender,name,body.slice(0,7000),key,kind,user,JSON.stringify(usage)])).rows[0];
}
async function ensureFollowup(q:Query,cid:string) {return (await q.query("INSERT INTO chat_followups(id,conversation_id) VALUES($1,$2) ON CONFLICT(conversation_id) DO UPDATE SET status='open',completed_by=NULL,completed_at=NULL RETURNING id",[id(),cid])).rows[0].id;}

async function availableAgents(q:Query,siteId:string) {
  return (await q.query(`SELECT p.user_id,p.capacity,u.name FROM chat_presence p JOIN users u ON u.id=p.user_id JOIN chat_sites s ON s.id=p.site_id
    WHERE p.site_id=$1 AND p.available=true AND p.seen_at>now()-interval '75 seconds' AND u.active=true AND ${permissionSQL()}
    AND EXISTS(SELECT 1 FROM sessions se WHERE se.user_id=u.id AND se.expires_at>now())
    AND (SELECT count(*) FROM chat_conversations c WHERE c.site_id=p.site_id AND c.assigned_to=p.user_id AND c.status='human')<p.capacity`,[siteId])).rows;
}

export async function recoverChats(db:DB) {
  await db.transaction(async q=>{
    const rows=(await q.query(`SELECT c.* FROM chat_conversations c WHERE
      (c.status='waiting' AND c.queued_at<now()-interval '2 minutes') OR
      (c.status='human' AND NOT EXISTS(SELECT 1 FROM chat_presence p JOIN users u ON u.id=p.user_id JOIN chat_sites s ON s.id=p.site_id
        WHERE p.site_id=c.site_id AND p.user_id=c.assigned_to AND p.seen_at>now()-interval '75 seconds' AND u.active=true AND ${permissionSQL()}
        AND EXISTS(SELECT 1 FROM sessions se WHERE se.user_id=u.id AND se.expires_at>now())))
      FOR UPDATE OF c`)).rows;
    for(const c of rows) {
      await q.query("UPDATE chat_conversations SET status='follow_up',assigned_to=NULL,updated_at=now() WHERE id=$1",[c.id]);
      await ensureFollowup(q,c.id);
      await addMessage(q,c.id,'system','Nerix Global',c.status==='human'?'Your agent is no longer connected. Your follow-up remains saved; you can continue with automatic help while our team picks it up.':'Nobody has joined yet. Your request is saved for our team to follow up. You can keep asking questions here.',`recovered:${c.id}:${c.updated_at}`);
    }
    const expired=(await q.query("UPDATE chat_conversations SET ai_busy_until=NULL,ai_request_id=NULL WHERE ai_busy_until<now() RETURNING id")).rows;
    for(const c of expired)await addMessage(q,c.id,'system','Nerix Global','The last automatic reply was interrupted. Please ask again or request help from our team.',`interrupted:${id()}`);
  });
}

async function snapshot(q:Query,cid:string) {
  const c=(await q.query('SELECT c.*,s.agent_name,s.business_name,u.name AS human_name FROM chat_conversations c JOIN chat_sites s ON s.id=c.site_id LEFT JOIN users u ON u.id=c.assigned_to WHERE c.id=$1',[cid])).rows[0];
  const messages=(await q.query('SELECT id,sequence,sender,sender_name,body,kind,created_at FROM chat_messages WHERE conversation_id=$1 ORDER BY sequence',[cid])).rows;
  const f=(await q.query('SELECT id,status FROM chat_followups WHERE conversation_id=$1',[cid])).rows[0];
  return {id:c.id,status:c.status,agentName:c.agent_name,humanName:c.status==='human'?c.human_name:null,contactSaved:!!c.contact.email,followup:f||null,busy:!!c.ai_busy_until,messages};
}
async function publicConversation(q:Query,site:Row,req:Request) {
  const c=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 AND site_id=$2 AND token_hash=$3 AND expires_at>now()',[uuid.parse(req.params.conversation),site.id,hash(publicToken(req))])).rows[0];
  need(c,401,'Chat session expired. Start a new conversation.');return c;
}
async function throttle(q:Query,key:string,maximum:number) {
  const r=(await q.query("INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING count",[hash(key)])).rows[0];
  need(r.count<=maximum,429,'Please wait a few minutes before trying again. You can also email our team.');
}
async function generateReply(config:ChatConfig,site:Row,messages:Row[],cid:string) {
  const request={instructions:chatInstructions(site),messages:messages.filter(m=>m.sender==='visitor'||m.sender==='assistant').slice(-18).map(m=>({role:m.sender==='visitor'?'user':'assistant',content:String(m.body)})),model:config.model||'gpt-4.1-mini',visitor:hash(cid)};
  if(config.provider)return config.provider(request);
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},body:JSON.stringify({model:request.model,instructions:request.instructions,input:request.messages,max_output_tokens:350,store:false,safety_identifier:request.visitor}),signal:AbortSignal.timeout(18000)});
  if(!response.ok){console.warn(`OpenAI text-chat request failed (HTTP ${response.status}). Check model access, key and credit balance.`);throw new Error('OpenAI chat request failed.');}
  const data=await response.json() as any;
  const output=(data.output||[]).filter((x:any)=>x.type==='message').flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('\n').trim();
  if(!output)throw new Error('No text was returned.');
  return {text:output.slice(0,7000),usage:{model:request.model,input_tokens:data.usage?.input_tokens||0,output_tokens:data.usage?.output_tokens||0,response_id:data.id||''}};
}

export function registerPublicChat(app:express.Express,db:DB,config:ChatConfig={}) {
  const router=express.Router(),aiReady=!!config.aiEnabled&&!!(config.apiKey||config.provider);
  router.use(express.json({limit:'24kb'}));
  router.use('/sites/:key',async(req,res,next)=>{
    try {
      res.set('Cache-Control','no-store');res.vary('Origin');
      const key=z.string().regex(/^[a-z0-9-]{3,100}$/).parse(req.params.key);
      const site=(await db.query("SELECT * FROM chat_sites WHERE public_key=$1 AND enabled=true AND (org_id IS NULL OR EXISTS(SELECT 1 FROM organizations o WHERE o.id=chat_sites.org_id AND o.services->>'chat'='true'))",[key])).rows[0];
      need(site&&(await db.query("SELECT 1 FROM users WHERE platform_role='owner' AND active=true LIMIT 1")).rows.length,503,'Chat is not connected yet. Please email info@nerixglobal.com.');
      const appOrigin=config.appOrigin||`${req.protocol}://${req.get('host')}`,origin=req.get('Origin');
      const allowed=[...site.origins,appOrigin];
      need(!origin||allowed.includes(origin),403,'This website is not enabled for this chat.');
      if(origin)res.set('Access-Control-Allow-Origin',origin);
      res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type, Authorization, X-Nerix-Chat');
      if(req.method==='OPTIONS'){res.set('Access-Control-Max-Age','600');res.sendStatus(204);return;}
      if(!['GET','HEAD'].includes(req.method))need(!!origin&&req.is('application/json')&&req.get('X-Nerix-Chat')==='widget',415,'Use the chat widget from an enabled website.');
      res.locals.chatSite=site;next();
    } catch(e){next(e);}
  });
  router.get('/sites/:key/config',async(_req,res)=>{
    const s=res.locals.chatSite;res.json({name:s.business_name,agentName:s.agent_name,purpose:s.purpose,aiReady,helpLabel:aiReady?`${s.agent_name} · AI assistant`:'Preset FAQ help',available:(await availableAgents(db,s.id)).length>0});
  });
  router.post('/sites/:key/conversations',async(req,res)=>{
    await throttle(db,`chat:new:${req.ip}`,15);const site=res.locals.chatSite,token=randomToken(),cid=id();
    await db.transaction(async q=>{
      await q.query('INSERT INTO chat_conversations(id,site_id,token_hash) VALUES($1,$2,$3)',[cid,site.id,hash(token)]);
      await addMessage(q,cid,'assistant',aiReady?`${site.agent_name} · AI`:'Nerix help',aiReady?`Hi, I'm ${site.agent_name}, Nerix Global’s AI assistant for ${site.business_name}. What can I help you with?`:site.org_id?'Hi! You can request our team or leave a follow-up. Automated help uses prepared replies.':'Hi! I can help with common Nerix Global questions using prepared replies. Choose “Browse FAQs” for the topics, or “Talk to our team” to request a person.','greeting',aiReady?'greeting':'faq');
    });res.json({token,conversation:await snapshot(db,cid)});
  });
  router.get('/sites/:key/conversations/:conversation',async(req,res)=>{
    const c=await publicConversation(db,res.locals.chatSite,req);await recoverChats(db);
    await db.query('UPDATE chat_conversations SET visitor_seen_at=now() WHERE id=$1',[c.id]);res.json(await snapshot(db,c.id));
  });
  router.post('/sites/:key/conversations/:conversation/messages',async(req,res)=>{
    const site=res.locals.chatSite,c=await publicConversation(db,site,req),b=z.object({body:text(1800),requestKey:uuid}).parse(req.body);
    await throttle(db,`chat:message:${req.ip}`,120);await recoverChats(db);
    const pending=await db.transaction(async q=>{
      const current=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      if((await q.query('SELECT 1 FROM chat_messages WHERE conversation_id=$1 AND event_key=$2',[c.id,`visitor:${b.requestKey}`])).rows.length)return null;
      need(current.status!=='closed',409,'This conversation is closed. Start a new conversation.');need(current.status==='human'||!current.ai_busy_until,409,'Please wait for the current reply.');
      need(Number((await q.query("SELECT count(*) FROM chat_messages WHERE conversation_id=$1 AND sender='visitor'",[c.id])).rows[0].count)<200,429,'Start a new conversation to continue.');
      const m=await addMessage(q,c.id,'visitor','You',b.body,`visitor:${b.requestKey}`,'visitor');
      await q.query('UPDATE chat_conversations SET visitor_seen_at=now(),updated_at=now() WHERE id=$1',[c.id]);
      if(current.status==='human')return null;
      const turns=Number((await q.query("SELECT count(*) FROM chat_messages WHERE conversation_id=$1 AND kind='openai'",[c.id])).rows[0].count);
      let useAI=aiReady&&turns<40&&!(site.org_id&&(await orgLock(q,site.org_id)).locked);   // locked workspaces get prepared FAQ replies only
      if(useAI){const quota=(await q.query("INSERT INTO chat_ai_budget(day,count) VALUES((now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET count=chat_ai_budget.count+1 RETURNING count")).rows[0];useAI=quota.count<=(config.dailyLimit||200);}
      if(!useAI){await addMessage(q,c.id,'assistant','Nerix help',faqReply(b.body,site),`reply:${m.id}`,'faq');return null;}
      await q.query("UPDATE chat_conversations SET ai_busy_until=now()+interval '40 seconds',ai_request_id=$2 WHERE id=$1",[c.id,m.id]);
      return {message:m.id,history:(await q.query('SELECT sender,body FROM chat_messages WHERE conversation_id=$1 ORDER BY sequence',[c.id])).rows};
    });
    if(pending){
      let reply:{text:string;usage?:Record<string,unknown>},kind='openai';
      try{reply=await generateReply(config,site,pending.history,c.id);}catch{reply={text:'The AI connection is temporarily unavailable. '+faqReply(b.body,site)};kind='faq';}
      await db.transaction(async q=>{
        const current=(await q.query('SELECT status,ai_request_id FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
        // A human may accept while OpenAI is answering. Never interrupt that human.
        const apply=current.ai_request_id===pending.message&&!['human','closed'].includes(current.status);
        if(apply)await addMessage(q,c.id,'assistant',kind==='openai'?`${site.agent_name} · AI`:'Nerix help',reply.text,`reply:${pending.message}`,kind,null,reply.usage);
        await q.query('INSERT INTO chat_ai_usage(id,conversation_id,outcome,usage) VALUES($1,$2,$3,$4)',[pending.message,c.id,kind==='faq'?'unavailable':apply?'applied':'discarded',JSON.stringify(reply.usage||{})]);
        if(current.ai_request_id===pending.message)await q.query('UPDATE chat_conversations SET ai_busy_until=NULL,ai_request_id=NULL,updated_at=now() WHERE id=$1',[c.id]);
      });
    }
    res.json(await snapshot(db,c.id));
  });
  router.post('/sites/:key/conversations/:conversation/handoff',async(req,res)=>{
    const site=res.locals.chatSite,c=await publicConversation(db,site,req),b=contactInput.parse(req.body);await throttle(db,`chat:handoff:${req.ip}`,30);
    await db.transaction(async q=>{
      const current=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];need(!['human','closed'].includes(current.status),409,'A person has already joined, or this chat has closed.');
      const available=(await availableAgents(q,site.id)).length>0,status=available?'waiting':'follow_up';
      await q.query('UPDATE chat_conversations SET contact=$1,reason=$2,status=$3,queued_at=now(),visitor_seen_at=now(),updated_at=now() WHERE id=$4',[JSON.stringify({name:b.name,email:b.email,phone:b.phone,consentAt:new Date().toISOString()}),b.reason,status,c.id]);
      await ensureFollowup(q,c.id);
      await addMessage(q,c.id,'system','Nerix Global',available?'Your request and contact details are saved. An available team member can accept this chat. No person has joined yet; you can keep asking questions while you wait.':'Our live team is not available right now. Your request and contact details are saved for follow-up. You can keep asking questions here in the meantime.','handoff-saved');
    });res.json(await snapshot(db,c.id));
  });
  router.post('/sites/:key/conversations/:conversation/close',async(req,res)=>{
    const c=await publicConversation(db,res.locals.chatSite,req);
    await db.transaction(async q=>{await q.query("UPDATE chat_conversations SET status='closed',assigned_to=NULL,updated_at=now() WHERE id=$1",[c.id]);await addMessage(q,c.id,'system','Nerix Global','You ended this chat. Any saved follow-up remains with our team.','visitor-closed');});res.json(await snapshot(db,c.id));
  });
  app.use('/chat-api',router);
}

export function registerStaffChat(app:express.Express,db:DB,auth:Auth,config:ChatConfig={}) {
  app.get('/api/chat/sites',async(req,res)=>{const user=await auth.user(req);res.json({sites:await accessibleSites(db,user),aiReady:!!config.aiEnabled&&!!(config.apiKey||config.provider),model:config.model||'gpt-4.1-mini',dailyLimit:config.dailyLimit||200});});
  app.post('/api/chat/sites',async(req,res)=>{
    const user=await auth.user(req),b=siteInput.extend({orgId:uuid,companyId:uuid.nullable(),locationId:uuid.nullable()}).parse(req.body),a=await auth.access(req,b.orgId,'team',true);
    need((await serviceProfile(db,user,b.orgId)).chat,403,'Chat service is not enabled for your account.');
    checkScope(a,b.companyId||'',b.locationId||'');await validScope(db,b.orgId,b.companyId,b.locationId);need(a.role==='owner'&&!a.companyId&&!a.locationId,403,'Only the workspace owner can create a site.');
    const key=`site-${randomToken().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,24)}`;
    const out=(await db.query('INSERT INTO chat_sites(id,public_key,org_id,company_id,location_id,name,business_name,agent_name,purpose,origins,knowledge,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[id(),key,b.orgId,b.companyId,b.locationId,b.name,b.businessName,b.agentName,b.purpose,JSON.stringify(b.origins.map(originValue)),b.knowledge,b.enabled])).rows[0];
    await audit(db,user.id,b.orgId,'chat.site_created',{site:out.id});res.json(out);
  });
  app.put('/api/chat/sites/:site',async(req,res)=>{
    const user=await auth.user(req),s=await siteAccess(db,user,uuid.parse(req.params.site));await manageSite(db,user,s);const b=siteInput.parse(req.body);
    await db.query('UPDATE chat_sites SET name=$1,business_name=$2,agent_name=$3,purpose=$4,origins=$5,knowledge=$6,enabled=$7 WHERE id=$8',[b.name,b.businessName,b.agentName,b.purpose,JSON.stringify(b.origins.map(originValue)),b.knowledge,b.enabled,s.id]);await audit(db,user.id,s.org_id,'chat.site_updated',{site:s.id});res.json({ok:true});
  });
  app.put('/api/chat/sites/:site/presence',async(req,res)=>{
    const user=await auth.user(req),s=await siteAccess(db,user,uuid.parse(req.params.site)),b=z.object({available:z.boolean(),capacity:z.number().int().min(1).max(10)}).parse(req.body);
    await db.query('INSERT INTO chat_presence(site_id,user_id,available,capacity) VALUES($1,$2,$3,$4) ON CONFLICT(site_id,user_id) DO UPDATE SET available=excluded.available,capacity=excluded.capacity,seen_at=now()',[s.id,user.id,b.available,b.capacity]);res.json({ok:true});
  });
  app.get('/api/chat/sites/:site/inbox',async(req,res)=>{
    const user=await auth.user(req),site=await siteAccess(db,user,uuid.parse(req.params.site));await recoverChats(db);
    const filter=z.enum(['all','waiting','human','followup']).parse(req.query.filter||'all');
    const requestedPage=z.coerce.number().int().min(1).max(100000).parse(req.query.page||1),pageSize=50;
    const counts=(await db.query(`SELECT count(*)::int AS all,
      count(*) FILTER(WHERE c.status='waiting')::int AS waiting,
      count(*) FILTER(WHERE c.status='human')::int AS human,
      count(*) FILTER(WHERE f.status='open')::int AS followup
      FROM chat_conversations c LEFT JOIN chat_followups f ON f.conversation_id=c.id WHERE c.site_id=$1`,[site.id])).rows[0];
    const total=counts[filter],page=Math.min(requestedPage,Math.max(1,Math.ceil(total/pageSize)));
    const where=filter==='followup'?" AND f.status='open'":filter==='all'?'':` AND c.status='${filter}'`;
    const conversations=(await db.query(`SELECT c.id,c.status,c.contact,c.reason,c.assigned_to,c.created_at,c.updated_at,c.visitor_seen_at,u.name AS assigned_name,f.id AS followup_id,f.status AS followup_status,
      (SELECT body FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY sequence DESC LIMIT 1) AS last_message
      FROM chat_conversations c LEFT JOIN users u ON u.id=c.assigned_to LEFT JOIN chat_followups f ON f.conversation_id=c.id WHERE c.site_id=$1${where} ORDER BY c.updated_at DESC,c.id DESC LIMIT $2 OFFSET $3`,[site.id,pageSize,(page-1)*pageSize])).rows;
    const presence=(await db.query('SELECT * FROM chat_presence WHERE site_id=$1 AND user_id=$2',[site.id,user.id])).rows[0]||{available:false,capacity:3};
    const usage=(await db.query("SELECT count(*)::int AS replies,COALESCE(sum((m.usage->>'input_tokens')::bigint),0) AS input_tokens,COALESCE(sum((m.usage->>'output_tokens')::bigint),0) AS output_tokens FROM chat_ai_usage m JOIN chat_conversations c ON c.id=m.conversation_id WHERE c.site_id=$1 AND m.created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",[site.id])).rows[0];
    res.json({site,conversations,counts,total,page,pageSize,presence,availableAgents:(await availableAgents(db,site.id)).length,usage,mayConfigure:user.platform_role==='owner'||!!(site.org_id&&(await db.query("SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2 AND role='owner' AND active=true AND company_id IS NULL AND location_id IS NULL",[site.org_id,user.id])).rows.length)});
  });
  async function conversationAccess(req:Request){const user=await auth.user(req),cid=uuid.parse(req.params.conversation),c=(await db.query('SELECT * FROM chat_conversations WHERE id=$1',[cid])).rows[0];need(c,404,'Conversation not found.');await siteAccess(db,user,c.site_id);return {user,c};}
  app.get('/api/chat/conversations/:conversation',async(req,res)=>{const{c}=await conversationAccess(req);res.json({...await snapshot(db,c.id),contact:c.contact,reason:c.reason,assignedTo:c.assigned_to,visitorSeenAt:c.visitor_seen_at,followup:(await db.query('SELECT * FROM chat_followups WHERE conversation_id=$1',[c.id])).rows[0]||null});});
  app.post('/api/chat/conversations/:conversation/claim',async(req,res)=>{
    const{user,c}=await conversationAccess(req);
    await db.transaction(async q=>{
      // Lock the site first so capacity checks and competing claims serialize consistently.
      const site=(await q.query('SELECT id,enabled FROM chat_sites WHERE id=$1 FOR UPDATE',[c.site_id])).rows[0];
      need(site.enabled,409,'This chat site is disabled. Use the saved follow-up details.');
      const current=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      need(['waiting','follow_up'].includes(current.status)&&current.contact.email,409,'This chat cannot be joined, or another person already joined.');
      need(+new Date(current.visitor_seen_at)>Date.now()-75000,409,'The visitor is offline. Use their saved follow-up details.');
      need((await availableAgents(q,c.site_id)).some(p=>p.user_id===user.id),409,'Set yourself available and make room within your chat capacity first.');
      await q.query("UPDATE chat_conversations SET status='human',assigned_to=$1,ai_busy_until=NULL,ai_request_id=NULL,updated_at=now() WHERE id=$2",[user.id,c.id]);
      await addMessage(q,c.id,'system','Nerix Global',`${user.name} has joined. Automatic replies are paused while you chat with this person.`,`joined:${id()}`);
      await audit(q,user.id,null,'chat.claimed',{conversation:c.id,site:c.site_id});
    });res.json(await snapshot(db,c.id));
  });
  app.post('/api/chat/conversations/:conversation/messages',async(req,res)=>{
    const{user,c}=await conversationAccess(req),b=z.object({body:text(4000),requestKey:uuid}).parse(req.body);
    await db.transaction(async q=>{const current=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];need(current.status==='human'&&current.assigned_to===user.id,403,'Only the person who joined this chat can reply.');await addMessage(q,c.id,'human',user.name,b.body,`staff:${b.requestKey}`,'human',user.id);await q.query('UPDATE chat_conversations SET updated_at=now() WHERE id=$1',[c.id]);});res.json(await snapshot(db,c.id));
  });
  app.post('/api/chat/conversations/:conversation/release',async(req,res)=>{
    const{user,c}=await conversationAccess(req);
    await db.transaction(async q=>{const current=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];need(current.status==='human'&&(current.assigned_to===user.id||user.platform_role==='owner'),403,'Only the joined person or owner can return this chat.');await q.query("UPDATE chat_conversations SET status='follow_up',assigned_to=NULL,updated_at=now() WHERE id=$1",[c.id]);await ensureFollowup(q,c.id);await addMessage(q,c.id,'system','Nerix Global','Your live agent has returned this request to the team. Your follow-up remains saved and automatic help is available.',`released:${id()}`);await audit(q,user.id,null,'chat.released',{conversation:c.id});});res.json({ok:true});
  });
  app.post('/api/chat/conversations/:conversation/resolve',async(req,res)=>{
    const{user,c}=await conversationAccess(req);
    await db.transaction(async q=>{const current=(await q.query('SELECT * FROM chat_conversations WHERE id=$1 FOR UPDATE',[c.id])).rows[0];need(current.assigned_to===user.id||user.platform_role==='owner',403,'Only the joined person or owner can resolve this chat.');await q.query("UPDATE chat_conversations SET status='closed',assigned_to=NULL,updated_at=now() WHERE id=$1",[c.id]);await q.query("UPDATE chat_followups SET status='done',completed_by=$1,completed_at=now() WHERE conversation_id=$2",[user.id,c.id]);await addMessage(q,c.id,'system','Nerix Global','Our team marked this conversation resolved. Start a new chat if you need anything else.','staff-resolved');await audit(q,user.id,null,'chat.resolved',{conversation:c.id});});res.json({ok:true});
  });
  app.patch('/api/chat/conversations/:conversation/followup',async(req,res)=>{
    const{user,c}=await conversationAccess(req),b=z.object({status:z.enum(['open','done']),note:text(3000)}).parse(req.body);
    need((await db.query('SELECT 1 FROM chat_followups WHERE conversation_id=$1',[c.id])).rows.length,404,'No follow-up is saved for this chat.');
    need(c.status!=='human'||c.assigned_to===user.id||user.platform_role==='owner',403,'The joined person is handling this follow-up.');
    await db.query("UPDATE chat_followups SET status=$1,note=$2,completed_by=$3,completed_at=CASE WHEN $1='done' THEN now() ELSE NULL END WHERE conversation_id=$4",[b.status,b.note,b.status==='done'?user.id:null,c.id]);await audit(db,user.id,null,'chat.followup_updated',{conversation:c.id,status:b.status});res.json({ok:true});
  });
}
