import {access} from 'node:fs/promises';
import {loadConfig} from './config.js';
import {asteriskConfiguration} from './configure.js';
import {AriClient} from './ari.js';
try {
  const config=loadConfig();asteriskConfiguration(process.env);
  for(const key of ['SIP_TLS_CERT_FILE','SIP_TLS_KEY_FILE','SIP_TLS_CA_FILE'])if(process.env[key])await access(process.env[key]);
  console.log(JSON.stringify({configurationValid:true,mode:config.routing?'multiple_dids':'legacy_single_did',trunks:config.routing?.trunks.length||1,locations:config.routing?.routes.length||1,maxCalls:config.maxCalls}));
  if(process.argv.includes('--live')) {
    const response=await fetch(config.appUrl+'/ready',{signal:AbortSignal.timeout(10000)});
    if(!response.ok||(await response.json()).ok!==true)throw new Error('Portal database or migration readiness failed');
    const ari=new AriClient(config),endpoints=await ari.request('GET','/endpoints');
    const required=config.routing?.trunks.map(t=>t.endpoint)||[config.sipEndpoint];
    const missing=required.filter(id=>!endpoints.some(e=>e.technology==='PJSIP'&&e.resource===id));
    if(missing.length)throw new Error('Asterisk is missing '+missing.length+' configured endpoints');
    console.log('Portal database and local Asterisk endpoints respond. Registration, OpenAI audio, DTMF and forwarding still require live call tests.');
  }
} catch(error) {console.error('Gateway check failed: '+error.message);process.exitCode=1;}
