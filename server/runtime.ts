// Validate hosting inputs before opening a database or generating a setup key.
export function runtimeSettings(env:NodeJS.ProcessEnv){
  const production=env.NODE_ENV==='production',mode=env.APP_MODE||(production?'pilot':'demo');
  if(!['demo','pilot'].includes(mode))throw new Error('APP_MODE must be demo or pilot.');
  if(env.LIVE_PAYMENTS_ENABLED==='true')throw new Error('Live card payments are not included in this release. Record payments manually.');
  if(env.LIVE_CALLS_ENABLED==='true')throw new Error('LIVE_CALLS_ENABLED is retired. Set ENABLE_GATEWAY_API=true and NERIX_GATEWAY_SECRET to accept inbound calls from the Nerix gateway.');
  let origin:string|undefined;
  const raw=env.APP_ORIGIN||(env.REPLIT_DEV_DOMAIN?`https://${env.REPLIT_DEV_DOMAIN}`:undefined);
  if(raw){
    let u:URL;try{u=new URL(raw);}catch{throw new Error('APP_ORIGIN must be an exact HTTPS origin, for example https://app.example.com.');}
    if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(!production&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw new Error('APP_ORIGIN must be an exact HTTPS origin without a path, query or credentials.');
    origin=u.origin;
  }
  if(production&&(!env.DATABASE_URL||!env.APP_ORIGIN||!origin?.startsWith('https://')||!env.SETUP_TOKEN))throw new Error('Production requires DATABASE_URL, HTTPS APP_ORIGIN and SETUP_TOKEN.');
  if(env.SETUP_TOKEN&&env.SETUP_TOKEN.length<24)throw new Error('SETUP_TOKEN must contain at least 24 characters.');
  if(mode==='pilot'&&!env.DATABASE_URL)throw new Error('Pilot mode requires a dedicated PostgreSQL DATABASE_URL.');
  const dailyLimit=Number(env.CHAT_AI_DAILY_LIMIT||200),port=Number(env.PORT||3000);
  if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>10000)throw new Error('CHAT_AI_DAILY_LIMIT must be between 1 and 10000.');
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
  const gatewayEnabled=env.ENABLE_GATEWAY_API==='true',gatewaySecret=env.NERIX_GATEWAY_SECRET||'',maxTransfers=Number(env.GATEWAY_MAX_OUTBOUND_CALLS||5);
  if(gatewayEnabled&&gatewaySecret.length<32)throw new Error('NERIX_GATEWAY_SECRET must contain at least 32 characters when ENABLE_GATEWAY_API=true.');
  if(!Number.isInteger(maxTransfers)||maxTransfers<1||maxTransfers>100)throw new Error('GATEWAY_MAX_OUTBOUND_CALLS must be between 1 and 100.');
  if(env.RESEND_API_KEY&&!env.EMAIL_FROM)throw new Error('EMAIL_FROM is required with RESEND_API_KEY, for example Nerix Global <hello@nerixglobal.com>.');
  return {mode:mode as 'demo'|'pilot',origin,dailyLimit,port,production,gateway:{enabled:gatewayEnabled,secret:gatewaySecret,maxTransfers,appOrigin:origin},email:{apiKey:env.RESEND_API_KEY||undefined,from:env.EMAIL_FROM||undefined,appOrigin:origin}};
}
