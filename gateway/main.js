import {loadConfig} from './config.js';
import {AriClient} from './ari.js';
import {GatewayClient} from './client.js';
import {CallController} from './controller.js';

let ari,controller,flushTimer,outreachTimer,stopping=false;
async function stop(code=0){if(stopping)return;stopping=true;clearInterval(flushTimer);clearInterval(outreachTimer);await controller?.shutdown();ari?.close();process.exitCode=code;}
try{
  const config=loadConfig();const api=new GatewayClient(config);await api.init();await api.recover();
  ari=new AriClient(config);controller=new CallController(config,ari,api);
  ari.on('event',e=>controller.onEvent(e).catch(()=>stop(1)));
  ari.on('fault',()=>stop(1));ari.on('disconnect',()=>stop(1));
  await ari.connect();
  flushTimer=setInterval(()=>api.flush().catch(()=>console.error('Gateway has pending call events; check portal connectivity.')),15000);
  if(config.outreachEnabled)outreachTimer=setInterval(()=>controller.pollOutreach().catch(()=>console.error('Patient outreach requires attention.')),15000);
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>stop());
  console.log('Nerix SIP gateway ready for configured inbound routes.');
}catch(error){console.error('Gateway stopped: '+error.message);await stop(1);}
