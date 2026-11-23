// Simulates the Oracle gateway for ONE short call against a running portal, so you can prove the
// portal side works before Asterisk is involved.
//   PORTAL_URL=https://app.nerixglobal.com NERIX_GATEWAY_SECRET=... DID=+442079460100 npm run gateway:smoke
// Use a number assigned to an internal (test) company so no customer credit is used.
import {randomUUID} from 'node:crypto';
import {signGatewayBody} from '../shared/gateway-signature.js';
const base=(process.env.PORTAL_URL||'http://localhost:3000').replace(/\/$/,''),secret=process.env.NERIX_GATEWAY_SECRET||'',did=process.env.DID||'';
if(secret.length<32||!/^\+[1-9]\d{6,14}$/.test(did)){console.error('Set NERIX_GATEWAY_SECRET (32+ characters) and DID (e.g. +442079460100).');process.exit(2);}
async function send(body:Record<string,unknown>){
  const raw=JSON.stringify({eventId:randomUUID(),...body}),ts=String(Math.floor(Date.now()/1000));
  const r=await fetch(`${base}/api/gateway/events`,{method:'POST',headers:{'Content-Type':'application/json','X-Nerix-Timestamp':ts,'X-Nerix-Signature':signGatewayBody(secret,ts,raw)},body:raw});
  const data:any=await r.json().catch(()=>({}));console.log(`${String(body.type).padEnd(10)} -> HTTP ${r.status} ${data.reason?'('+data.reason+')':''}`);return {status:r.status,data};
}
const providerCallId='smoke-'+randomUUID();
const a=await send({type:'authorize',providerCallId,calledNumber:did,callerPhone:'+14155550123',billingProtocol:4});
if(!a.data.allowed){console.error('Call refused:',a.data.reason||'check the number, secret and settings');process.exit(1);}
console.log(`  assistant: ${a.data.assistantName} · location: ${a.data.locationName} · prepaid: ${JSON.stringify(a.data.prepaid)}`);
console.log(`  instructions length: ${a.data.instructions.length} characters · transfer targets: ${a.data.transferTargets.length}`);
const ids={callId:a.data.callId,providerCallId};
await send({type:'connected',...ids});await send({type:'heartbeat',...ids});
await send({type:'save_callback',...ids,callerName:'Smoke Test',reason:'Checking the Nerix callback flow',callbackDetailsConfirmed:true,callerType:'customer'});
const e=await send({type:'ended',...ids,outcome:'callback_required',reason:'smoke_test'});
console.log(e.status===200?'\nPASS: the portal handled a complete call. Check Calls & callbacks in the dashboard.':'\nFAIL: see the messages above.');process.exit(e.status===200?0:1);
