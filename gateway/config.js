import {readRouting} from './routing.js';
const integer=(value,fallback,min,max)=>{const n=Number(value??fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error('Invalid gateway numeric setting');return n;};
export function loadConfig(env=process.env) {
  const ari=new URL(env.ARI_URL||'http://127.0.0.1:8088/ari');
  if(!['127.0.0.1','localhost'].includes(ari.hostname)||ari.protocol!=='http:'||ari.username||ari.password)throw new Error('ARI must use the local loopback HTTP interface');
  const app=new URL(env.NERIX_APP_URL||'http://127.0.0.1:3000');
  if(app.protocol!=='https:'&&!(app.protocol==='http:'&&['127.0.0.1','localhost'].includes(app.hostname)))throw new Error('NERIX_APP_URL must use HTTPS or loopback');
  if(app.username||app.password||app.pathname!=='/'||app.search||app.hash)throw new Error('NERIX_APP_URL must be an origin');
  if(env.ENABLE_SIP_GATEWAY!=='true')throw new Error('Set ENABLE_SIP_GATEWAY=true after completing the connection settings');
  for(const k of ['ARI_USERNAME','ARI_PASSWORD','OPENAI_API_KEY','NERIX_GATEWAY_SECRET'])if(!env[k])throw new Error('Missing gateway setting: '+k);
  if(env.NERIX_GATEWAY_SECRET.length<32)throw new Error('NERIX_GATEWAY_SECRET must have at least 32 characters');
  const endpoint=env.SIP_ENDPOINT||'nerix-carrier';if(!/^[a-zA-Z0-9_-]{1,64}$/.test(endpoint))throw new Error('Invalid SIP endpoint');
  const outreachDids=String(env.GATEWAY_OUTREACH_DIDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  return {outreachEnabled:false,outreachDids,ariUrl:ari.href.replace(/\/$/,''),ariUser:env.ARI_USERNAME,ariPassword:env.ARI_PASSWORD,
    appUrl:app.origin,secret:env.NERIX_GATEWAY_SECRET,apiKey:env.OPENAI_API_KEY,
    model:env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1-mini',sipEndpoint:endpoint,routing:readRouting(env),appName:'nerix-reception',
    spool:env.GATEWAY_STATE_DIR||'data/gateway-state',maxCalls:integer(env.GATEWAY_MAX_CALLS,5,1,100),
    maxOutboundCalls:integer(env.GATEWAY_MAX_OUTBOUND_CALLS,5,1,100),ringSeconds:integer(env.GATEWAY_RING_SECONDS,25,5,60),acceptSeconds:integer(env.GATEWAY_ACCEPT_SECONDS,20,5,60),
    maxCallSeconds:integer(env.GATEWAY_MAX_CALL_SECONDS,3300,60,3500)};
}
export const e164=value=>/^\+[1-9]\d{6,14}$/.test(String(value||''))?String(value):null;
