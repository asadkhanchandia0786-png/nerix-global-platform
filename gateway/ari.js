import WebSocket from 'ws';
import {EventEmitter} from 'node:events';
export class AriClient extends EventEmitter {
  constructor(config,{fetchImpl=fetch,WebSocketImpl=WebSocket}={}){super();this.config=config;this.fetch=fetchImpl;this.WebSocket=WebSocketImpl;this.auth='Basic '+Buffer.from(config.ariUser+':'+config.ariPassword).toString('base64');}
  async request(method,resource,query={},body){
    const url=new URL(this.config.ariUrl+resource);for(const [k,v]of Object.entries(query))if(v!==undefined)url.searchParams.set(k,String(v));
    const r=await this.fetch(url,{method,headers:{Authorization:this.auth,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
    if(!r.ok){const error=new Error('ARI '+method+' failed ('+r.status+')');error.status=r.status;throw error;}
    const text=await r.text();return text?JSON.parse(text):null;
  }
  async connect(){
    const url=new URL(this.config.ariUrl+'/events');url.protocol='ws:';url.searchParams.set('app',this.config.appName);
    this.ws=new this.WebSocket(url,{headers:{Authorization:this.auth},maxPayload:1024*1024});
    this.ws.on('message',raw=>{try{this.emit('event',JSON.parse(raw.toString()));}catch{this.emit('fault',new Error('Invalid ARI event'));}});
    this.ws.on('error',e=>this.emit('fault',e));this.ws.on('close',()=>this.emit('disconnect'));
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('ARI connection timeout')),10000);this.ws.once('open',()=>{clearTimeout(timer);resolve();});this.ws.once('error',e=>{clearTimeout(timer);reject(e);});});
    this.alive=true;this.ws.on('pong',()=>{this.alive=true;});
    this.ping=setInterval(()=>{if(!this.alive){this.ws.terminate();return;}this.alive=false;if(this.ws.readyState===WebSocket.OPEN)this.ws.ping();},15000);
  }
  channel(id,suffix='',method='POST',query={}){return this.request(method,'/channels/'+encodeURIComponent(id)+suffix,query);}
  bridge(id,suffix='',method='POST',query={}){return this.request(method,'/bridges/'+encodeURIComponent(id)+suffix,query);}
  async safeDeleteChannel(id){if(!id)return;try{await this.channel(id,'','DELETE');}catch(e){if(e.status!==404)throw e;}}
  async safeDeleteBridge(id){if(!id)return;try{await this.bridge(id,'','DELETE');}catch(e){if(e.status!==404)throw e;}}
  close(){clearInterval(this.ping);this.ws?.close();}
}
