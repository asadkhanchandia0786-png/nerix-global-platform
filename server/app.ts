import express, { type Request } from 'express';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import type { DB } from './db.ts';
import { Auth, hash, hashPassword, verifyPassword, randomToken, equal, scopeSQL, checkScope, validScope } from './auth.ts';
import { AppError, id, need, text, email, uuid, timezone, service, dollars, toMicros, audit, createOrg, rateFor } from './core.ts';
import { DISPOSITIONS, CURRENCIES, ROLES, INTERNAL_ROLES, SERVICES } from '../shared/constants.ts';
import { importSchema, previewImport, saveImport, rulesSchema, eligibility, nextWindow } from './leads.ts';
import { startCall, finishCall, credit } from './wallet.ts';
import { INTEGRATIONS, createQuote, confirmTestQuote, manualPayment, requestRefund, updateRefund } from './payments.ts';
import { buildPrompt } from './agents.ts';
import {convertInternalCompany} from './internal.ts';
import {registerPublicChat,registerStaffChat,type ChatConfig} from './chat.ts';
import {serviceProfile,serviceAccessInput} from './services.ts';
import {registerBusiness} from './business.ts';
import {registerGateway,type GatewayConfig} from './gateway.ts';
import {registerVoice,registerPasswordReset} from './voice.ts';
import {queueEmail,inviteEmail} from './email.ts';
export interface Config { mode:'demo'|'pilot'; setupToken:string; origin?:string; trustProxy?:boolean; developmentAssets?:boolean; chat?:ChatConfig; gateway?:GatewayConfig }
export function createApp(db: DB,config: Config) {
  const app=express(),auth=new Auth(db,!!config.origin?.startsWith('https:'));
  if(config.trustProxy) app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:config.developmentAssets?["'self'","'unsafe-inline'"]:["'self'"],styleSrc:["'self'","'unsafe-inline'"],connectSrc:config.developmentAssets?["'self'","ws:","wss:"]:["'self'"],imgSrc:["'self'","data:"],frameAncestors:["'self'","https://replit.com","https://*.replit.com","https://*.replit.dev"],objectSrc:["'none'"],upgradeInsecureRequests:config.origin?.startsWith('https:')?[]:null}},crossOriginEmbedderPolicy:false,frameguard:false}));
  const chatConfig={...config.chat,appOrigin:config.origin};
  app.use(['/chat-widget.js','/chat-widget.css','/assets/nerix-logo.png'],(_req,res,next)=>{res.set('Cross-Origin-Resource-Policy','cross-origin');next();});
  registerPublicChat(app,db,chatConfig);
  const gatewayConfig:GatewayConfig=config.gateway||{enabled:false,secret:'',maxTransfers:5,appOrigin:config.origin};
  // The gateway endpoint is machine-to-machine (HMAC signed), so it is registered before the browser CSRF guard and keeps the exact raw body for signature checks.
  app.use(express.json({limit:'6mb',verify:(req:any,_res,buf)=>{if(String(req.url||'').startsWith('/api/gateway/'))req.rawBody=buf;}}));
  registerGateway(app,db,gatewayConfig);
  app.use('/api',async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    try {
      if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
        const expected=config.origin || `${req.protocol}://${req.get('host')}`;
        need(!req.get('Origin')||req.get('Origin')===expected,403,'Request origin is not permitted.');
        need(req.get('Sec-Fetch-Site')!=='cross-site',403,'Cross-site request rejected.');
        need(req.is('application/json')&&req.get('X-Nerix-Client')==='workspace',415,'Use the workspace application.');
        if(!['/auth/login','/auth/setup','/auth/join','/auth/signup','/auth/forgot','/auth/reset'].includes(req.path)) need(!!auth.cookie(req)&&equal(req.get('X-CSRF-Token')||'',auth.csrf(req)),403,'Session expired. Refresh and sign in again.');
      }
      next();
    } catch(e) {next(e);}
  });
  app.get('/api/health',async(_req,res)=>{await db.query('SELECT 1');res.json({ok:true,version:'0.4.0',mode:config.mode,liveCalls:gatewayConfig.enabled,liveCardPayments:false,liveTextChat:!!config.chat?.aiEnabled&&!!config.chat?.apiKey});});
  app.get('/api/auth/status',async(_req,res)=>res.json({setupRequired:!(await db.query('SELECT 1 FROM users LIMIT 1')).rows.length,mode:config.mode}));
  const credentials=z.object({email,password:z.string().min(12).max(128)});
  app.post('/api/auth/setup',async(req,res)=>{
    await auth.limit(`setup:${req.ip}`);
    const b=credentials.extend({name:text(),setupToken:text(200)}).parse(req.body); need(equal(b.setupToken,config.setupToken),403,'The setup key does not match the key in your Replit Secrets or Console.');
    const password=await hashPassword(b.password),userId=id();
    await db.transaction(async q=>{
      await q.query('SELECT pg_advisory_xact_lock(7011002)');need(!(await q.query('SELECT 1 FROM users LIMIT 1')).rows.length,409,'Initial setup is already complete.');
      await q.query("INSERT INTO users(id,email,name,password_hash,platform_role) VALUES($1,$2,$3,$4,'owner')",[userId,b.email,b.name,password]);
      await createOrg(q,'Nerix Global', 'general',userId,config.mode==='demo');
      if(config.mode==='demo') await createOrg(q,'Dentive AI · pilot','dental',userId,true);
      await audit(q,userId,null,'platform.initialized',{mode:config.mode});
    }); await auth.login(res,userId);res.json({ok:true});
  });
  app.post('/api/auth/login',async(req,res)=>{
    const b=z.object({email,password:z.string().max(128)}).parse(req.body);
    await auth.limit(`ip:${req.ip}`); await auth.limit(`email:${b.email}`);
    const u=(await db.query('SELECT * FROM users WHERE email=$1',[b.email])).rows[0];
    const valid=await verifyPassword(b.password,u?.password_hash||'missing:no-match'); need(u?.active&&valid,401,'Email or password is incorrect.');
    await auth.login(res,u.id);await audit(db,u.id,null,'auth.login');res.json({ok:true});
  });
  app.post('/api/auth/signup',async(req,res)=>{
    need(config.mode==='demo',409,'Ask Nerix for a workspace invitation.');await auth.limit(`signup:${req.ip}`);
    const b=credentials.extend({name:text(),business:text(),industry:text(40)}).parse(req.body),userId=id(),password=await hashPassword(b.password);
    await db.transaction(async q=>{need((await q.query("SELECT 1 FROM users WHERE platform_role='owner' LIMIT 1")).rows.length,409,'The owner must complete initial setup first.');await q.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[userId,b.email,b.name,password]);await createOrg(q,b.business,b.industry,userId,true);});await auth.login(res,userId);res.json({ok:true});
  });
  app.get('/api/me',async(req,res)=>{
    const u=await auth.user(req); let orgs;
    if(u.platform_role==='owner') orgs=(await db.query("SELECT *, 'owner' AS role, NULL AS company_id,NULL AS location_id FROM organizations ORDER BY created_at")).rows;
    else orgs=(await db.query('SELECT o.*,m.role,m.company_id,m.location_id FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE m.user_id=$1 AND m.active=true UNION SELECT o.*,$2::text AS role,NULL::uuid AS company_id,NULL::uuid AS location_id FROM organizations o JOIN support_assignments s ON s.org_id=o.id WHERE s.user_id=$1 AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=o.id AND m.user_id=$1 AND m.active=true)',[u.id,u.platform_role])).rows;
    res.json({user:u,orgs,csrf:auth.csrf(req),mode:config.mode});
  });
  app.post('/api/auth/logout',async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(auth.cookie(req))]);res.clearCookie('nerix_session',{path:'/'});res.json({ok:true});});
  app.post('/api/auth/password',async(req,res)=>{
    const u=await auth.user(req),b=z.object({current:text(128),password:z.string().min(12).max(128)}).parse(req.body);
    await auth.limit(`password:${u.id}`);const row=(await db.query('SELECT password_hash FROM users WHERE id=$1',[u.id])).rows[0];need(await verifyPassword(b.current,row.password_hash),403,'Current password does not match.');
    const h=await hashPassword(b.password);await db.transaction(async q=>{await q.query('UPDATE users SET password_hash=$1 WHERE id=$2',[h,u.id]);await q.query('DELETE FROM sessions WHERE user_id=$1',[u.id]);await audit(q,u.id,null,'auth.password_changed');});await auth.login(res,u.id);res.json({ok:true});
  });
  app.get('/api/industries',async(_req,res)=>res.json((await db.query('SELECT * FROM industries ORDER BY name')).rows));
  app.post('/api/workspaces',async(req,res)=>{
    const u=await auth.owner(req),b=z.object({name:text(),industry:text(40),internal:z.boolean().default(false)}).parse(req.body);
    const out=await db.transaction(q=>createOrg(q,b.name,b.industry,u.id,config.mode==='demo',b.internal));await audit(db,u.id,out.id,'workspace.created',{internal:b.internal});res.json(out);
  });
  const orgId=(req:Request)=>uuid.parse(req.params.org);
  app.get('/api/org/:org/meta',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'overview'),p:any[]=[org];
    const orgRow=(await db.query('SELECT * FROM organizations WHERE id=$1',[org])).rows[0];
    const locations=(await db.query('SELECT * FROM locations WHERE org_id=$1 AND ($2::uuid IS NULL OR company_id=$2) AND ($3::uuid IS NULL OR id=$3) ORDER BY name',[org,a.companyId,a.locationId])).rows;
    const companies=(await db.query('SELECT * FROM companies WHERE org_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY name',[org,a.companyId])).rows;
    const prices=Object.fromEntries(await Promise.all(Object.keys(SERVICES).map(async s=>[s,await rateFor(db,org,s as keyof typeof SERVICES)])));
    if(a.role!=='owner')orgRow.settings={connectionStatus:orgRow.settings?.connectionStatus||'Not requested',recordingsEnabled:false};
    res.json({services:await serviceProfile(db,a.user,org),org:orgRow,companies,locations,prices,role:a.role,scope:{companyId:a.companyId,locationId:a.locationId},internal:a.internal,integrations:INTEGRATIONS});
  });
  app.get('/api/org/:org/overview',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'overview'),p:any[]=[org],sc=scopeSQL(a,p,'l.');
    need((await serviceProfile(db,a.user,org)).voice,403,'Voice service access is not enabled for your account.');
    const calls=(await db.query(`SELECT c.id,c.charge,c.seconds,c.outcome,c.status,c.created_at,c.simulated,l.business FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1${sc} ORDER BY c.created_at DESC LIMIT 8`,p)).rows;
    const counts=(await db.query(`SELECT disposition,count(*)::int AS count FROM leads l WHERE l.org_id=$1${sc} GROUP BY disposition`,p)).rows;
    const usage=(await db.query(`SELECT COALESCE(sum(c.charge),0) AS spend,COALESCE(sum(c.seconds),0) AS seconds,count(*)::int AS calls FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1${sc} AND c.status='completed'`,p)).rows[0];
    const wallet=['owner','manager','viewer'].includes(a.role)&&!a.companyId&&!a.locationId?(await db.query('SELECT * FROM wallets WHERE org_id=$1',[org])).rows[0]:null;
    res.json({calls:['support','closer'].includes(a.role)?[]:calls,counts:['support','closer'].includes(a.role)?[]:counts,usage,wallet});
  });
  app.get('/api/org/:org/leads',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'leads'),p:any[]=[org];res.json((await db.query(`SELECT * FROM leads WHERE org_id=$1${scopeSQL(a,p)} ORDER BY created_at DESC LIMIT 5000`,p)).rows);
  });
  app.post('/api/org/:org/import/preview',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'leads',true);res.json(await previewImport(db,a,importSchema.parse(req.body)));});
  app.post('/api/org/:org/import/commit',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'leads',true);res.json(await saveImport(db,a,importSchema.parse(req.body)));});
  app.get('/api/org/:org/leads/:lead/history',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'leads'),p:any[]=[org,uuid.parse(req.params.lead)];need((await db.query(`SELECT 1 FROM leads WHERE org_id=$1 AND id=$2${scopeSQL(a,p)}`,p)).rows.length,404,'Lead not found.');
    res.json((await db.query('SELECT * FROM lead_history WHERE org_id=$1 AND lead_id=$2 ORDER BY created_at DESC',[org,req.params.lead])).rows);
  });
  app.patch('/api/org/:org/leads/:lead',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'leads',true),leadId=uuid.parse(req.params.lead),b=z.object({disposition:z.enum(DISPOSITIONS),note:z.string().max(5000).default(''),nextCallAt:z.iso.datetime({offset:true}).nullable().optional()}).parse(req.body);
    await db.transaction(async q=>{
      const p:any[]=[org,leadId],l=(await q.query(`SELECT * FROM leads WHERE org_id=$1 AND id=$2${scopeSQL(a,p)} FOR UPDATE`,p)).rows[0];need(l,404,'Lead not found.');
      need(l.disposition!=='Do not call'||b.disposition==='Do not call',409,'Do-not-call suppression is durable. It cannot be cleared by editing a lead.');
      await q.query('UPDATE leads SET disposition=$1,next_call_at=$2 WHERE id=$3 AND org_id=$4',[b.disposition,b.nextCallAt===undefined?l.next_call_at:b.nextCallAt,leadId,org]);
      if(b.disposition==='Do not call') for(const phone of [l.phone,l.followup_phone].filter(Boolean)) await q.query('INSERT INTO suppression(org_id,company_id,phone,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[org,l.company_id,phone,b.note||'Explicit opt-out']);
      await q.query("INSERT INTO lead_history(id,org_id,lead_id,kind,body) VALUES($1,$2,$3,'staff_note',$4)",[id(),org,leadId,JSON.stringify({...b,actor:a.user.name})]);await audit(q,a.user.id,org,'lead.updated',{leadId,disposition:b.disposition});
    });res.json({ok:true});
  });
  app.get('/api/org/:org/campaigns',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'campaigns'),p:any[]=[org];res.json((await db.query(`SELECT * FROM campaigns WHERE org_id=$1${scopeSQL(a,p)} ORDER BY created_at DESC`,p)).rows);
  });
  const campaignInput=z.object({name:text(),companyId:uuid,locationId:uuid,mode:z.enum(['leadgen','followup']),service,rules:rulesSchema,authorization:z.boolean(),status:z.enum(['draft','ready','paused'])});
  app.post('/api/org/:org/campaigns',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'campaigns',true),b=campaignInput.parse(req.body);checkScope(a,b.companyId,b.locationId);await validScope(db,org,b.companyId,b.locationId);
    const row=(await db.query('INSERT INTO campaigns(id,org_id,company_id,location_id,name,mode,service,rules,"authorization",status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[id(),org,b.companyId,b.locationId,b.name,b.mode,b.service,JSON.stringify(b.rules),b.authorization,b.status])).rows[0];await audit(db,a.user.id,org,'campaign.created',{id:row.id});res.json(row);
  });
  app.patch('/api/org/:org/campaigns/:campaign',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'campaigns',true),cid=uuid.parse(req.params.campaign),b=campaignInput.parse(req.body);checkScope(a,b.companyId,b.locationId);await validScope(db,org,b.companyId,b.locationId);
    const p:any[]=[org,cid];need((await db.query(`SELECT 1 FROM campaigns WHERE org_id=$1 AND id=$2${scopeSQL(a,p)}`,p)).rows.length,404,'Campaign not found.');
    await db.query('UPDATE campaigns SET name=$1,company_id=$2,location_id=$3,mode=$4,service=$5,rules=$6,"authorization"=$7,status=$8 WHERE org_id=$9 AND id=$10',[b.name,b.companyId,b.locationId,b.mode,b.service,JSON.stringify(b.rules),b.authorization,b.status,org,cid]);await audit(db,a.user.id,org,'campaign.updated',{cid});res.json({ok:true});
  });
  app.post('/api/org/:org/campaigns/:campaign/pause',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'pause',true),p:any[]=[org,uuid.parse(req.params.campaign)];need((await db.query(`UPDATE campaigns SET status='paused' WHERE org_id=$1 AND id=$2${scopeSQL(a,p)} RETURNING id`,p)).rows.length,404,'Campaign not found.');await audit(db,a.user.id,org,'campaign.paused',{id:req.params.campaign});res.json({ok:true});
  });
  app.get('/api/org/:org/campaigns/:campaign/queue',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'campaigns'),p:any[]=[org,uuid.parse(req.params.campaign)],c=(await db.query(`SELECT * FROM campaigns WHERE org_id=$1 AND id=$2${scopeSQL(a,p)}`,p)).rows[0];need(c,404,'Campaign not found.');
    const rows=(await db.query('SELECT l.*,EXISTS(SELECT 1 FROM suppression s WHERE s.org_id=l.org_id AND s.company_id=l.company_id AND (s.phone=l.phone OR s.phone=l.followup_phone)) AS suppressed FROM leads l WHERE l.org_id=$1 AND l.company_id=$2 AND l.location_id=$3 ORDER BY l.next_call_at NULLS LAST,l.created_at',[org,c.company_id,c.location_id])).rows;
    const at=req.query.at?new Date(z.iso.datetime({offset:true}).parse(req.query.at)):new Date();
    res.json(rows.map(l=>({...l,blocked:eligibility(l,c,l.suppressed,at),nextWindow:nextWindow(l.timezone,c.rules)})));
  });
  app.post('/api/org/:org/simulations',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'campaigns',true),b=z.object({campaignId:uuid,leadId:uuid,seconds:z.number().int().min(0).max(1800),requestKey:uuid,at:z.iso.datetime({offset:true})}).parse(req.body);res.json(await startCall(db,a,b));
  });
  app.post('/api/org/:org/simulations/:call/finish',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'campaigns',true),b=z.object({outcome:z.enum(['No answer','Busy','IVR reached','Email provided','Decision maker unavailable','Callback requested','Interested','Not interested','Do not call','Failed']),answered:z.boolean()}).parse(req.body);
    need(b.answered?!['No answer','Busy','Failed'].includes(b.outcome):['No answer','Busy','Failed'].includes(b.outcome),400,'Outcome does not match answer status.');res.json(await finishCall(db,a,uuid.parse(req.params.call),b.outcome,b.answered));
  });
  app.get('/api/org/:org/calls',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'calls'),p:any[]=[org];res.json((await db.query(`SELECT c.*,l.business,l.phone FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.org_id=$1${scopeSQL(a,p,'l.')} ORDER BY c.created_at DESC LIMIT 500`,p)).rows);
  });
  app.get('/api/org/:org/agents',async(req,res)=>{
    const org=orgId(req);await auth.access(req,org,'agents');const o=(await db.query('SELECT name FROM organizations WHERE id=$1',[org])).rows[0];res.json((await db.query('SELECT * FROM agents WHERE org_id=$1 ORDER BY service',[org])).rows.map(a=>({...a,prompt:buildPrompt(a,o.name)})));
  });
  app.put('/api/org/:org/agents/:service',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'agents',true),s=service.parse(req.params.service),b=z.object({name:text(80),tone:z.enum(['alex','sarah']),language:text(40),model:text(100).default('gpt-realtime-2.1-mini'),voice:z.enum(['marin','cedar','coral','alloy','ash','sage','verse']),knowledge:z.string().max(16000),instructions:z.string().max(8000)}).parse(req.body);
    need(!a.companyId&&!a.locationId,403,'Agent profiles apply to the whole workspace; an unscoped manager or owner must change them.');
    await db.query('UPDATE agents SET name=$1,tone=$2,language=$3,voice=$4,knowledge=$5,instructions=$6,model=$7 WHERE org_id=$8 AND service=$9',[b.name,b.tone,b.language,b.voice,b.knowledge,b.instructions,b.model,org,s]);await audit(db,a.user.id,org,'agent.updated',{service:s});res.json({ok:true});
  });
  app.get('/api/org/:org/wallet',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'wallet');need(!a.companyId&&!a.locationId,403,'The organization wallet requires whole-workspace access.');const [wallet,ledger,payments,refunds,orgRow]=await Promise.all([db.query('SELECT * FROM wallets WHERE org_id=$1',[org]),db.query('SELECT * FROM ledger WHERE org_id=$1 ORDER BY created_at DESC LIMIT 200',[org]),db.query('SELECT * FROM payments WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100',[org]),db.query('SELECT * FROM refunds WHERE org_id=$1 ORDER BY created_at DESC',[org]),db.query('SELECT settings FROM organizations WHERE id=$1',[org])]);res.json({wallet:wallet.rows[0],ledger:ledger.rows,payments:payments.rows,refunds:refunds.rows,autoRecharge:orgRow.rows[0].settings.autoRecharge||null});
  });
  const currency=z.enum(CURRENCIES.map(c=>c[0]) as [string,...string[]]);
  app.post('/api/org/:org/quotes',async(req,res)=>{
    const org=orgId(req);await auth.access(req,org,'billing',true);const b=z.object({usd:dollars,currency,exceptionId:uuid.optional()}).parse(req.body);res.json(await createQuote(db,org,toMicros(b.usd),b.currency,b.exceptionId));
  });
  app.post('/api/org/:org/quotes/:quote/confirm-test',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'billing',true);res.json(await confirmTestQuote(db,org,uuid.parse(req.params.quote),a.user.id));});
  app.put('/api/org/:org/auto-recharge',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'billing',true),b=z.object({threshold:dollars,amount:dollars,monthlyCap:dollars,currency,consent:z.boolean()}).parse(req.body);
    need((await db.query('SELECT billing_mode FROM organizations WHERE id=$1',[org])).rows[0]?.billing_mode!=='internal',409,'Internal companies do not need automatic recharge.');
    need(toMicros(b.amount)>=100000000&&toMicros(b.monthlyCap)>=toMicros(b.amount),400,'Recharge amount must be at least USD100 and fit the monthly cap.');
    await db.query("UPDATE organizations SET settings=jsonb_set(settings,'{autoRecharge}',$1::jsonb) WHERE id=$2",[JSON.stringify({...b,enabled:false,status:b.consent?'awaiting_provider_authorization':'disabled',requestedAt:new Date().toISOString(),policyVersion:'draft-2026-10-11'}),org]);await audit(db,a.user.id,org,'recharge.preferences_saved',{...b,enabled:false});res.json({ok:true,message:'Preferences saved. Automatic charging remains disabled.'});
  });
  app.post('/api/org/:org/refunds',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'billing',true),b=z.object({usd:z.string().regex(/^\d{1,6}(\.\d{1,6})?$/,'Use a USD amount with up to six decimal places.'),reason:text(2000)}).parse(req.body);res.json(await requestRefund(db,org,toMicros(b.usd),b.reason,a.user.id));});
  app.get('/api/org/:org/team',async(req,res)=>{const org=orgId(req);await auth.access(req,org,'team');res.json({members:(await db.query('SELECT m.*,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE org_id=$1 ORDER BY u.name',[org])).rows,invitations:(await db.query('SELECT id,email,role,company_id,location_id,service_access,expires_at,used_at FROM invitations WHERE org_id=$1 ORDER BY expires_at DESC',[org])).rows});});
  app.post('/api/org/:org/invitations',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'team',true),b=z.object({email,role:z.enum(ROLES),companyId:uuid.nullable(),locationId:uuid.nullable(),serviceAccess:serviceAccessInput.default({voice:true,chat:true,software:'none'})}).parse(req.body);
    need(b.role!=='owner'||(!b.companyId&&!b.locationId),400,'Workspace owners cannot be location-scoped.');await validScope(db,org,b.companyId,b.locationId);
    const token=randomToken();await db.query("INSERT INTO invitations(id,token_hash,email,org_id,role,company_id,location_id,expires_at,created_by,service_access) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '48 hours',$8,$9)",[id(),hash(token),b.email,org,b.role,b.companyId,b.locationId,a.user.id,JSON.stringify(b.serviceAccess)]);await audit(db,a.user.id,org,'team.invited',{email:b.email,role:b.role});
    const orgName=(await db.query('SELECT name FROM organizations WHERE id=$1',[org])).rows[0]?.name||'your workspace';
    await queueEmail(db,{orgId:org,kind:'invite',to:b.email,...inviteEmail(`${config.origin||`${req.protocol}://${req.get('host')}`}/#join?token=${token}`,orgName,b.role)});
    res.json({token,email:b.email});
  });
  app.post('/api/auth/join',async(req,res)=>{
    await auth.limit(`invite:${req.ip}`);const b=credentials.extend({name:text(),token:text(200)}).parse(req.body),newHash=await hashPassword(b.password);
    const userId=await db.transaction(async q=>{
      const invite=(await q.query('SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE',[hash(b.token)])).rows[0];need(invite&&!invite.used_at&&new Date(invite.expires_at)>new Date()&&invite.email===b.email,400,'Invitation is invalid, expired or addressed to another email.');
      let u=(await q.query('SELECT * FROM users WHERE email=$1',[b.email])).rows[0];
      if(u) need(u.active&&await verifyPassword(b.password,u.password_hash),403,'Use this existing account’s current password to accept the invitation.');
      else {u={id:id()};await q.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[u.id,b.email,b.name,newHash]);}
      if(invite.org_id) {await q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[invite.org_id]);const current=(await q.query('SELECT role,active FROM memberships WHERE org_id=$1 AND user_id=$2',[invite.org_id,u.id])).rows[0];if(current?.active&&current.role==='owner'&&invite.role!=='owner')need((await q.query("SELECT id FROM memberships WHERE org_id=$1 AND role='owner' AND active=true",[invite.org_id])).rows.length>1,409,'Keep at least one active workspace owner.');await validScope(q,invite.org_id,invite.company_id,invite.location_id);await q.query('INSERT INTO memberships(id,org_id,user_id,role,company_id,location_id,service_access) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(org_id,user_id) DO UPDATE SET role=excluded.role,company_id=excluded.company_id,location_id=excluded.location_id,service_access=excluded.service_access,active=true',[id(),invite.org_id,u.id,invite.role,invite.company_id,invite.location_id,JSON.stringify(invite.service_access)]);}
      else {need(!u.platform_role,409,'Existing internal users must be managed by the owner.');await q.query('UPDATE users SET platform_role=$1 WHERE id=$2',[invite.role,u.id]);}
      await q.query('UPDATE invitations SET used_at=now() WHERE id=$1',[invite.id]);await audit(q,u.id,invite.org_id,'invitation.accepted',{inviteId:invite.id});return u.id;
    });await auth.login(res,userId);res.json({ok:true});
  });
  app.delete('/api/org/:org/invitations/:invite',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'team',true);await db.query('DELETE FROM invitations WHERE id=$1 AND org_id=$2',[uuid.parse(req.params.invite),org]);await audit(db,a.user.id,org,'invitation.revoked');res.json({ok:true});});
  app.patch('/api/org/:org/team/:member',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'team',true),b=z.object({active:z.boolean(),role:z.enum(ROLES),companyId:uuid.nullable(),locationId:uuid.nullable()}).parse(req.body);
    need(b.role!=='owner'||(!b.companyId&&!b.locationId),400,'Owners cannot be scoped.');await validScope(db,org,b.companyId,b.locationId);
    await db.transaction(async q=>{await q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[org]);const m=(await q.query('SELECT * FROM memberships WHERE id=$1 AND org_id=$2',[uuid.parse(req.params.member),org])).rows[0];need(m,404,'Member not found.');
      if(m.role==='owner'&&m.active&&(!b.active||b.role!=='owner')) need((await q.query("SELECT id FROM memberships WHERE org_id=$1 AND role='owner' AND active=true",[org])).rows.length>1,409,'Keep at least one active workspace owner.');
      await q.query('UPDATE memberships SET active=$1,role=$2,company_id=$3,location_id=$4 WHERE id=$5 AND org_id=$6',[b.active,b.role,b.companyId,b.locationId,m.id,org]);await q.query('DELETE FROM sessions WHERE user_id=$1',[m.user_id]);await audit(q,a.user.id,org,'team.access_changed',{memberId:m.id,...b});});res.json({ok:true});
  });
  app.post('/api/org/:org/companies',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'settings',true),b=z.object({name:text(),monthlyCap:dollars.nullable()}).parse(req.body);res.json((await db.query('INSERT INTO companies(id,org_id,name,monthly_cap) VALUES($1,$2,$3,$4) RETURNING *',[id(),org,b.name,b.monthlyCap===null?null:toMicros(b.monthlyCap)])).rows[0]);await audit(db,a.user.id,org,'company.created');});
  app.post('/api/org/:org/locations',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'settings',true),b=z.object({name:text(),companyId:uuid,timezone,monthlyCap:dollars.nullable()}).parse(req.body);await validScope(db,org,b.companyId,null);res.json((await db.query('INSERT INTO locations(id,org_id,company_id,name,timezone,monthly_cap) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id(),org,b.companyId,b.name,b.timezone,b.monthlyCap===null?null:toMicros(b.monthlyCap)])).rows[0]);await audit(db,a.user.id,org,'location.created');});
  app.put('/api/org/:org/settings',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'settings',true),b=z.object({name:text(),connectionMode:z.enum(['customer_sip','existing_crm','complete_setup']),identity:text(500),targetCountries:z.string().max(500),callerId:z.string().max(40),authorizationNotes:z.string().max(3000)}).parse(req.body);
    await db.query('UPDATE organizations SET name=$1,settings=settings||$2::jsonb WHERE id=$3',[b.name,JSON.stringify({onboarding:b,connectionStatus:'Requested',recordingsEnabled:false}),org]);await audit(db,a.user.id,org,'workspace.settings_saved');res.json({ok:true});
  });
  app.get('/api/org/:org/tasks',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'tasks'),p:any[]=[org];res.json((await db.query(`SELECT t.*,l.business FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id WHERE t.org_id=$1${scopeSQL(a,p,'t.')} ORDER BY t.due_at NULLS LAST,t.created_at DESC`,p)).rows);});
  app.post('/api/org/:org/tasks',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'tasks',true),b=z.object({title:text(),notes:z.string().max(4000),companyId:uuid,locationId:uuid,dueAt:z.iso.datetime({offset:true}).nullable(),kind:z.enum(['callback','meeting_request','support'])}).parse(req.body);checkScope(a,b.companyId,b.locationId);await validScope(db,org,b.companyId,b.locationId);
    res.json((await db.query('INSERT INTO tasks(id,org_id,company_id,location_id,kind,title,notes,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id(),org,b.companyId,b.locationId,b.kind,b.title,b.notes,b.dueAt])).rows[0]);
  });
  app.patch('/api/org/:org/tasks/:task',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'tasks',true),b=z.object({status:z.enum(['open','done'])}).parse(req.body),p:any[]=[org,uuid.parse(req.params.task),b.status];need((await db.query(`UPDATE tasks SET status=$3 WHERE org_id=$1 AND id=$2${scopeSQL(a,p)} RETURNING id`,p)).rows.length,404,'Task not found.');
    await db.query("UPDATE callback_requests SET status=CASE WHEN $3='done' THEN 'done' ELSE 'pending' END,completed_at=CASE WHEN $3='done' THEN now() ELSE NULL END,updated_at=now() WHERE org_id=$1 AND task_id=$2",[org,p[1],b.status]);
    res.json({ok:true});});
  app.get('/api/org/:org/tickets',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'tickets');res.json((await db.query(`SELECT t.*,u.name FROM tickets t JOIN users u ON u.id=t.created_by WHERE org_id=$1${a.companyId||a.locationId?' AND created_by=$2':''} ORDER BY created_at DESC`,a.companyId||a.locationId?[org,a.user.id]:[org])).rows);});
  app.post('/api/org/:org/tickets',async(req,res)=>{const org=orgId(req),a=await auth.access(req,org,'tickets',true),b=z.object({subject:text(),message:text(8000)}).parse(req.body);res.json((await db.query('INSERT INTO tickets(id,org_id,created_by,subject,message) VALUES($1,$2,$3,$4,$5) RETURNING *',[id(),org,a.user.id,b.subject,b.message])).rows[0]);});
  app.patch('/api/org/:org/tickets/:ticket',async(req,res)=>{
    const org=orgId(req),a=await auth.access(req,org,'tickets',true),b=z.object({reply:z.string().max(8000),status:z.enum(['open','in_progress','resolved'])}).parse(req.body);
    const p:any[]=[org,uuid.parse(req.params.ticket)],condition=a.companyId||a.locationId?' AND created_by=$3':'';if(condition)p.push(a.user.id);
    await db.transaction(async q=>{const t=(await q.query(`SELECT * FROM tickets WHERE org_id=$1 AND id=$2${condition} FOR UPDATE`,p)).rows[0];need(t,404,'Ticket not found.');const replies=b.reply.trim()?[...t.replies,{by:a.user.name,text:b.reply,at:new Date().toISOString()}]:t.replies;await q.query('UPDATE tickets SET status=$1,replies=$2 WHERE id=$3 AND org_id=$4',[b.status,JSON.stringify(replies),t.id,org]);await audit(q,a.user.id,org,'ticket.updated',{ticketId:t.id,status:b.status});});res.json({ok:true});
  });
  app.get('/api/org/:org/audit',async(req,res)=>{const org=orgId(req);await auth.access(req,org,'audit');res.json((await db.query('SELECT a.*,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE org_id=$1 ORDER BY created_at DESC LIMIT 200',[org])).rows);});
  app.get('/api/admin',async(req,res)=>{
    await auth.owner(req);const [users,orgs,referrals,refunds,auditRows]=await Promise.all([db.query('SELECT id,name,email,platform_role,active FROM users ORDER BY created_at'),db.query('SELECT o.*,w.paid,w.bonus,w.reserved FROM organizations o JOIN wallets w ON w.org_id=o.id ORDER BY o.created_at'),db.query('SELECT r.*,u.name AS partner FROM referrals r JOIN users u ON u.id=r.partner_id ORDER BY r.created_at DESC'),db.query("SELECT r.*,o.name FROM refunds r JOIN organizations o ON o.id=r.org_id ORDER BY r.created_at DESC"),db.query('SELECT a.*,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY created_at DESC LIMIT 100')]);res.json({users:users.rows,orgs:orgs.rows,referrals:referrals.rows,refunds:refunds.rows,audit:auditRows.rows,assignments:(await db.query('SELECT * FROM support_assignments')).rows,invitations:(await db.query('SELECT id,email,role,expires_at,used_at FROM invitations WHERE org_id IS NULL')).rows});
  });
  app.post('/api/admin/invitations',async(req,res)=>{
    const u=await auth.owner(req),b=z.object({email,role:z.enum(INTERNAL_ROLES)}).parse(req.body),token=randomToken();await db.query("INSERT INTO invitations(id,token_hash,email,role,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '48 hours',$5)",[id(),hash(token),b.email,b.role,u.id]);await audit(db,u.id,null,'internal.invited',{email:b.email,role:b.role});res.json({token,email:b.email});
  });
  app.delete('/api/admin/invitations/:invite',async(req,res)=>{const u=await auth.owner(req);await db.query('DELETE FROM invitations WHERE id=$1 AND org_id IS NULL',[uuid.parse(req.params.invite)]);await audit(db,u.id,null,'internal.invitation_revoked',{id:req.params.invite});res.json({ok:true});});
  app.patch('/api/admin/users/:user',async(req,res)=>{
    const u=await auth.owner(req),uid=uuid.parse(req.params.user),b=z.object({active:z.boolean(),role:z.enum(INTERNAL_ROLES).nullable(),orgIds:z.array(uuid).max(100)}).parse(req.body);need(uid!==u.id,400,'You cannot suspend or change your own owner role.');
    await db.transaction(async q=>{const target=(await q.query('SELECT * FROM users WHERE id=$1',[uid])).rows[0];need(target&&target.platform_role!=='owner',403,'Owner access cannot be changed here.');await q.query('UPDATE users SET active=$1,platform_role=$2 WHERE id=$3',[b.active,b.role,uid]);await q.query('DELETE FROM support_assignments WHERE user_id=$1',[uid]);if(b.role&&b.role!=='partner')for(const org of new Set(b.orgIds))await q.query('INSERT INTO support_assignments(user_id,org_id) VALUES($1,$2)',[uid,org]);await q.query('DELETE FROM sessions WHERE user_id=$1',[uid]);await audit(q,u.id,null,'internal.access_changed',{uid,...b});});res.json({ok:true});
  });
  app.patch('/api/admin/org/:org',async(req,res)=>{
    const u=await auth.owner(req),org=orgId(req),b=z.object({paused:z.boolean(),rates:z.object({outbound:z.number().int().min(1000).max(100000000),basic:z.number().int().min(1000).max(100000000),advanced:z.number().int().min(1000).max(100000000)})}).parse(req.body);
    if(!b.paused)need(!(await db.query("SELECT 1 FROM refunds WHERE org_id=$1 AND status IN ('requested','approved')",[org])).rows.length,409,'Resolve the pending refund before resuming service.');
    await db.query('UPDATE organizations SET paused=$1,rates=$2 WHERE id=$3',[b.paused,JSON.stringify(b.rates),org]);await audit(db,u.id,org,'commercial.settings_changed',b);res.json({ok:true});
  });
  app.post('/api/admin/org/:org/internal-company',async(req,res)=>{
    const u=await auth.owner(req),org=orgId(req),b=z.object({name:text(),ownedCompany:z.literal(true)}).parse(req.body);
    res.json(await convertInternalCompany(db,org,b.name,u.id));
  });
  app.post('/api/admin/industries',async(req,res)=>{
    const u=await auth.owner(req),b=z.object({id:z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),name:text(80),rates:z.object({outbound:z.number().int().min(1000).max(100000000),basic:z.number().int().min(1000).max(100000000),advanced:z.number().int().min(1000).max(100000000)})}).parse(req.body);await db.query('INSERT INTO industries(id,name,rates) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,rates=excluded.rates',[b.id,b.name,JSON.stringify(b.rates)]);await audit(db,u.id,null,'industry.updated',{id:b.id});res.json({ok:true});
  });
  app.post('/api/admin/org/:org/credit',async(req,res)=>{
    const u=await auth.owner(req),org=orgId(req),b=z.object({usd:dollars,reference:text(150),reason:text(2000),kind:z.enum(['promotional_credit','test_credit'])}).parse(req.body),o=(await db.query('SELECT is_demo FROM organizations WHERE id=$1',[org])).rows[0];need(o&&(o.is_demo?b.kind==='test_credit':b.kind==='promotional_credit'),400,'Use test credit only in demonstration workspaces.');
    await db.transaction(async q=>{await credit(q,org,toMicros(b.usd),`adjust:${b.reference}`,b.kind,{reason:b.reason,actor:u.id});await audit(q,u.id,org,'wallet.adjustment',{...b});});res.json({ok:true});
  });
  app.post('/api/admin/org/:org/manual-payment',async(req,res)=>{
    const u=await auth.owner(req),org=orgId(req),b=z.object({usd:dollars,currency,originalMinor:z.number().int().positive().max(1000000000000),reference:text(150),reason:text(2000),verified:z.boolean(),exceptionId:uuid.optional()}).parse(req.body);
    res.json(await db.transaction(q=>manualPayment(q,org,{...b,amount:toMicros(b.usd)},u.id)));
  });
  app.post('/api/admin/org/:org/exceptions',async(req,res)=>{
    const u=await auth.owner(req),org=orgId(req),b=z.object({usd:dollars,currency,reason:text(2000)}).parse(req.body);need(toMicros(b.usd)>0&&toMicros(b.usd)<100000000,400,'Use this only for a smaller later deposit.');need((await db.query('SELECT billing_mode FROM organizations WHERE id=$1',[org])).rows[0]?.billing_mode!=='internal',409,'Internal companies do not need private deposits.');need((await db.query("SELECT 1 FROM payments WHERE org_id=$1 AND status='settled'",[org])).rows.length,400,'The first deposit cannot use an exception.');const eid=id();await db.query("INSERT INTO deposit_exceptions(id,org_id,usd,currency,reason,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours')",[eid,org,toMicros(b.usd),b.currency,b.reason]);await audit(db,u.id,org,'deposit.exception_approved',{id:eid,...b});res.json({id:eid});
  });
  app.patch('/api/admin/org/:org/refunds/:refund',async(req,res)=>{const u=await auth.owner(req),org=orgId(req),b=z.object({status:z.enum(['approved','completed','rejected']),reference:z.string().max(200).default('')}).parse(req.body);res.json(await updateRefund(db,org,uuid.parse(req.params.refund),b.status,b.reference,u.id));});
  app.get('/api/referrals',async(req,res)=>{const u=await auth.user(req);need(u.platform_role==='partner'||u.platform_role==='owner',403,'Referral partner access is required.');res.json((await db.query('SELECT id,business,email,status,note,created_at FROM referrals WHERE partner_id=$1 ORDER BY created_at DESC',[u.id])).rows);});
  app.post('/api/referrals',async(req,res)=>{
    const u=await auth.user(req);need(u.platform_role==='partner'||u.platform_role==='owner',403,'Referral partner access is required.');const b=z.object({business:text(),email,note:z.string().max(3000)}).parse(req.body);need(b.email!==u.email,400,'Self-referrals are not eligible.');need(!(await db.query('SELECT 1 FROM users WHERE email=$1',[b.email])).rows.length,409,'This contact already has an account.');res.json((await db.query('INSERT INTO referrals(id,partner_id,business,email,normalized_email,note) VALUES($1,$2,$3,$4,$4,$5) RETURNING id',[id(),u.id,b.business,b.email,b.note])).rows[0]);
  });
  app.patch('/api/admin/referrals/:referral',async(req,res)=>{
    const u=await auth.owner(req),b=z.object({status:z.enum(['pending','qualified','paid','cancelled','reversed']),orgId:uuid.nullable(),verified:z.boolean(),contributionPkr:z.number().int().min(0),note:text(3000),payoutReference:z.string().max(200).default('')}).parse(req.body);
    await db.transaction(async q=>{
      const r=(await q.query('SELECT * FROM referrals WHERE id=$1 FOR UPDATE',[uuid.parse(req.params.referral)])).rows[0];need(r,404,'Referral not found.');
      const transitions:Record<string,string[]>={pending:['pending','qualified','cancelled'],qualified:['pending','qualified','paid','cancelled'],paid:['paid','reversed'],cancelled:['cancelled'],reversed:['reversed']};need(transitions[r.status].includes(b.status),409,'Invalid commission transition.');
      if(['qualified','paid'].includes(b.status)) {
        need(b.orgId&&b.verified&&b.contributionPkr>=10000,400,'Verify identity and at least PKR10,000 earned contribution under the draft pilot policy.');
        const o=(await q.query('SELECT * FROM organizations WHERE id=$1',[b.orgId])).rows[0];need(o&&!o.is_demo&&o.billing_mode!=='internal',400,'Demo and internal companies do not qualify.');need(!(await q.query('SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2',[b.orgId,r.partner_id])).rows.length,400,'A partner-controlled customer cannot qualify.');
        const p=(await q.query("SELECT min(created_at) AS first FROM payments WHERE org_id=$1 AND test_mode=false AND status='settled'",[b.orgId])).rows[0];need(p.first&&Date.now()-+new Date(p.first)>=30*86400000,400,'At least 30 days must pass after a settled payment.');
        need((await q.query("SELECT 1 FROM ledger WHERE org_id=$1 AND kind='usage' AND (details->>'paid')::bigint>0",[b.orgId])).rows.length,400,'Actual paid service usage is required.');
        need(!(await q.query("SELECT 1 FROM refunds WHERE org_id=$1 AND status IN ('requested','approved')",[b.orgId])).rows.length,400,'Resolve the pending refund first.');
        if(b.status==='paid')need(r.status==='qualified'&&b.payoutReference.length>=6,400,'Qualify first, then record a verified PKR5,000 payout reference.');
      }
      await q.query('UPDATE referrals SET status=$1,org_id=$2,verified=$3,contribution_pkr=$4,note=$5,payout_reference=$6 WHERE id=$7',[b.status,b.orgId,b.verified,b.contributionPkr,b.note,b.payoutReference||null,r.id]);await audit(q,u.id,b.orgId,'referral.reviewed',{referral:r.id,...b});
    });res.json({ok:true});
  });
  registerVoice(app,db,auth,gatewayConfig);
  registerPasswordReset(app,db,auth,config.origin);
  registerBusiness(app,db,auth);
  registerStaffChat(app,db,auth,chatConfig);
  app.use('/chat-api',(_req,res)=>res.status(404).json({error:'Chat endpoint not found.'}));
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(err instanceof ZodError) return res.status(400).json({error:err.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join(' · ')});
    if(err instanceof AppError) return res.status(err.status).json({error:err.message});
    if(err.code==='23505') return res.status(409).json({error:'This email, number or reference is already in use.'});
    if(err.code==='23503') return res.status(400).json({error:'The selected related record is not available.'});
    if(err.type==='entity.too.large')return res.status(413).json({error:'Upload is too large. Use at most 1,000 rows and 5 MB.'});
    console.error('Request failed',err.name,err.code||'',process.env.NODE_ENV==='test'?err.message:'');res.status(500).json({error:'The request could not be completed. No uncommitted changes were saved.'});
  });
  return app;
}
