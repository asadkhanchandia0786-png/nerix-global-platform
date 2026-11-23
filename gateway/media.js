import dgram from 'node:dgram';
import {EventEmitter} from 'node:events';
import {randomBytes} from 'node:crypto';
export function rtpPayload(packet){
  if(packet.length<12||packet[0]>>6!==2||(packet[1]&127)!==0)return null;
  let offset=12+(packet[0]&15)*4;
  if(packet[0]&16){if(packet.length<offset+4)return null;offset+=4+packet.readUInt16BE(offset+2)*4;}
  let end=packet.length;if(packet[0]&32){const padding=packet.at(-1);if(!padding||padding>end-offset)return null;end-=padding;}
  if(offset>=end||end-offset>4096)return null;
  return {audio:packet.subarray(offset,end),sequence:packet.readUInt16BE(2)};
}
export class RtpMedia extends EventEmitter {
  constructor(){super();this.queue=[];this.queued=0;this.sequence=randomBytes(2).readUInt16BE();this.timestamp=randomBytes(4).readUInt32BE();this.ssrc=randomBytes(4).readUInt32BE();this.closed=false;}
  async start(){
    this.socket=dgram.createSocket('udp4');this.socket.on('error',e=>this.emit('fault',e));
    this.socket.on('message',(packet,from)=>{
      if(!this.peer||from.address!==this.peer.address||from.port!==this.peer.port)return;
      const parsed=rtpPayload(packet);if(!parsed)return;
      if(this.inSeq!==undefined){const delta=(parsed.sequence-this.inSeq+65536)%65536;if(delta===0||delta>32768)return;}
      this.inSeq=parsed.sequence;this.emit('audio',parsed.audio);
    });
    await new Promise((resolve,reject)=>{this.socket.once('error',reject);this.socket.bind(0,'127.0.0.1',()=>{this.socket.off('error',reject);resolve();});});
    this.timer=setInterval(()=>this.tick(),20);return this.socket.address().port;
  }
  setPeer(address,port){if(address!=='127.0.0.1'||!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535)throw new Error('External media must be on loopback');this.peer={address,port:Number(port)};}
  enqueue(audio,item={}){if(this.closed)return;if(this.queued+audio.length>240000)throw new Error('Voice output buffer exceeded 30 seconds');this.queue.push({audio:Buffer.from(audio),item});this.queued+=audio.length;}
  tick(){
    if(!this.peer||this.closed)return;
    const packet=Buffer.alloc(172,255);packet[0]=0x80;packet[1]=0;packet.writeUInt16BE(this.sequence,2);packet.writeUInt32BE(this.timestamp,4);packet.writeUInt32BE(this.ssrc,8);
    let used=0;while(used<160&&this.queue.length){const chunk=this.queue[0],n=Math.min(160-used,chunk.audio.length);chunk.audio.copy(packet,12+used,0,n);chunk.audio=chunk.audio.subarray(n);used+=n;this.queued-=n;this.emit('played',chunk.item,n);if(!chunk.audio.length)this.queue.shift();}
    this.socket.send(packet,this.peer.port,this.peer.address);this.sequence=(this.sequence+1)%65536;this.timestamp=(this.timestamp+160)>>>0;
    if(!this.queued)this.emit('drained');
  }
  flush(){this.queue=[];this.queued=0;this.emit('drained');}
  async drained(){if(!this.queued)return;await new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{this.off('drained',done);reject(new Error('Audio drain timeout'));},35000);this.once('drained',done);});}
  close(){if(this.closed)return;this.closed=true;clearInterval(this.timer);this.flush();this.socket?.close();}
}
