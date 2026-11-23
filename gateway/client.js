import {createHmac,randomUUID,createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class GatewayClient {
  constructor(config,{fetchImpl=fetch}={}){this.config=config;this.fetch=fetchImpl;this.key=createHash('sha256').update(config.secret).digest();this.serial=Promise.resolve();this.lastSequence=0;}
  async init(){await fs.mkdir(this.config.spool,{recursive:true,mode:0o700});this.lastSequence=Math.max(0,...(await fs.readdir(this.config.spool)).filter(n=>n.startsWith('event-')).map(n=>Number(n.split('-')[1])||0));}
  async store(name,body){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv),bytes=Buffer.concat([cipher.update(JSON.stringify(body)),cipher.final()]);const file=path.join(this.config.spool,name+'.enc'),temp=file+'.tmp';await fs.writeFile(temp,Buffer.concat([iv,cipher.getAuthTag(),bytes]),{mode:0o600});await fs.rename(temp,file);}
  async read(name){const data=await fs.readFile(path.join(this.config.spool,name)),dec=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));dec.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(data.subarray(28)),dec.final()]).toString());}
  async remove(name){await fs.rm(path.join(this.config.spool,name+'.enc'),{force:true});}
  async request(body){
    const raw=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',this.config.secret).update(timestamp+'.').update(raw).digest('hex');
    const r=await this.fetch(this.config.appUrl+'/api/gateway/events',{method:'POST',headers:{'Content-Type':'application/json','X-Nerix-Timestamp':timestamp,'X-Nerix-Signature':signature},body:raw,signal:AbortSignal.timeout(['patient_action','outreach_claim'].includes(body.type)?45000:8000)});
    const result=await r.json();if(!r.ok){const error=new Error(result.reason||'gateway_request_failed');error.status=r.status;throw error;}return result;
  }
  async event(body){const payload={eventId:randomUUID(),...body};return this.retry(payload);}
  async retry(payload){let last;for(let i=0;i<3;i++){try{return await this.request(payload);}catch(e){last=e;if(e.status&&e.status<500)throw e;if(i<2)await new Promise(r=>setTimeout(r,150*(i+1)));}}throw last;}
  async track(call){await this.store('active-'+call.callId,{callId:call.callId,providerCallId:call.providerCallId});}
  async untrack(callId){await this.remove('active-'+callId);}
  durable(body){
    const payload={eventId:randomUUID(),...body};
    // Serialize durable file creation as well as delivery. A fast later write must not overtake an earlier event.
    const task=(this.writeSerial||Promise.resolve()).then(async()=>{
      const name='event-'+String(this.lastSequence=Math.max(Date.now(),this.lastSequence+1)).padStart(13,'0')+'-'+payload.eventId;
      await this.store(name,payload);await this.flush();return payload;
    });
    this.writeSerial=task.catch(()=>{});return task;
  }
  flush(){const task=this.serial.then(async()=>{
    for(const file of (await fs.readdir(this.config.spool)).filter(n=>n.startsWith('event-')&&n.endsWith('.enc')).sort()){
      const body=await this.read(file);
      try{await this.retry(body);await this.remove(file.slice(0,-4));}
      catch(e){if(e.message==='call_already_ended'){await this.remove(file.slice(0,-4));continue;}throw e;}
    }
  });this.serial=task.catch(()=>{});return task;}
  async recover(){
    await this.flush();
    for(const file of (await fs.readdir(this.config.spool)).filter(n=>n.startsWith('active-')&&n.endsWith('.enc'))){
      const body=await this.read(file);
      // No trustworthy hangup time survives an abrupt process failure: classify as
      // failed (zero Sarah charge), rather than estimate a customer charge.
      await this.durable({...body,type:'ended',outcome:'failed',reason:'gateway_restarted'});
      await this.untrack(body.callId);
    }
  }
}
