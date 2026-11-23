import {normalizeRealtimeUsage} from '../shared/usage-normalize.js';
import {randomUUID} from 'node:crypto';
import {RtpMedia} from './media.js';
import {patientTools} from './patient-tools.js';
import {RealtimeVoice,voiceTools} from './voice.js';
import {e164} from './config.js';
import {inboundCallerNumber,callbackNumber} from '../shared/callback-number.js';
import {inboundRoute,dialDestination} from './routing.js';
import {findTransferTarget,transferIntake,staffRole,requestedStaffRole,roleOnlyRequest,callbackPolicy,CALLBACK_INSTRUCTIONS} from '../shared/reception-rules.js';

// The complete staff directory remains in gateway memory for routing. The
// caller-facing model sees only a one-call handle and the requested role.
function privateLookupResult(result,handle){
  if(result.found)return {found:true,target:{id:handle,role:result.target.role},
    ...(result.requestedTarget?{requestedTarget:{role:result.requestedTarget.role}}:{}),
    ...(result.fallback?{fallback:true,requiresFallbackConfirmation:true}:{}),
    instruction:result.fallback?'A direct destination could not be resolved. Explain briefly that the front desk can help and confirm that destination before transferring (fallbackConfirmed:true). Do not say the requested person is absent, that their phone was tried, or reveal staff names.':'Ask only for missing caller name and short reason. Confirm the requested role or caller-supplied name once, then check whether staff can take the call. Never say a name obtained from the directory.'};
  const guidance={
    staff_name_ambiguous:'Ask the caller for the full name or spelling without suggesting any staff names.',
    role_default_missing:'No single default is configured for this role. Offer an agreed callback for the role; do not list staff.',
    staff_number_unavailable:'A direct connection is unavailable. Offer an agreed callback without revealing directory details.',
    staff_not_found:'Ask for clarification if helpful, or offer an agreed callback for the requested role. Do not list staff names.',
    staff_name_required:'Ask which role the caller needs, or ask for the name if they requested a specific person.'
  };
  return {found:false,reason:result.reason,instruction:guidance[result.reason]||'Offer an agreed callback without revealing staff directory details.'};
}

// One serialized control queue per call. Media continues independently.
export class CallController {
  constructor(config,ari,api,{mediaFactory=()=>new RtpMedia(),voiceFactory=(media,options)=>new RealtimeVoice(config,media,options),log=console.log}={}){
    this.config=config;this.ari=ari;this.api=api;this.mediaFactory=mediaFactory;this.voiceFactory=voiceFactory;this.log=log;this.calls=new Map();this.channels=new Map();this.pending=new Set();this.stopping=false;
  }
  enqueue(call,fn){const task=(call.queue||Promise.resolve()).then(()=>call.ended?undefined:fn());call.queue=task.catch(()=>{});return task;}
  report(call,message,details={}){this.log(JSON.stringify({event:message,callId:call.callId||call.providerCallId,...details}));}
  async onEvent(e){
    const id=e.channel?.id,call=this.channels.get(id);
    if(e.type==='StasisStart'&&e.args?.[0]==='outreach'&&call?.outbound&&call.phase==='outbound_ringing')return this.enqueue(call,()=>this.answerOutreach(call));
    if(e.type==='StasisStart'&&e.args?.[0]==='inbound'&&!call&&!this.pending.has(id)){
      this.pending.add(id);try{await this.inbound(e);}finally{this.pending.delete(id);}return;
    }
    if(!call)return;
    if(e.type==='StasisEnd'||e.type==='ChannelDestroyed'){
      if(id===call.callerId||call.phase==='connected'&&id===call.staffId)call.disconnectedAt ||= new Date().toISOString();
      // Mark synchronously so a pending dial/bridge request cannot reconnect a
      // caller that has already hung up.
      if(id===call.callerId){call.callerGone=true;call.ending=true;call.voice?.close();call.consultVoice?.close();}
      if(id===call.staffId){call.staffGone=true;call.consultVoice?.close();}
      return this.enqueue(call,async()=>{
        if(id===call.callerId||call.phase==='connected'&&id===call.staffId)return this.finish(call,call.phase==='connected'?'transferred':'disconnected','party_hangup');
        if(id===call.staffId)return this.failTransfer(call,call.staffDeclined?'declined':'no_answer');
        if(id===call.mediaId&&call.phase==='talking')return this.finish(call,'failed','media_disconnected');
      });
    }
    if(e.type==='StasisStart'&&id===call.staffId){call.staffAnswered=true;return this.enqueue(call,()=>this.staffAnswered(call));}
    if(e.type==='ChannelDtmfReceived'&&id===call.staffId){
      if(e.digit==='2'&&['ringing','consulting'].includes(call.phase)){call.staffDeclined=true;call.consultVoice?.close();return this.enqueue(call,()=>this.failTransfer(call,'declined'));}
      if(e.digit==='1'&&call.acceptReady)return this.enqueue(call,()=>this.accept(call));
    }
  }
  assertPresent(call){if(call.ending||call.callerGone||call.ended)throw new Error('Caller is no longer connected');}
  async pollOutreach(){
    if(this.stopping||this.outreachBusy||!this.config.outreachEnabled||this.calls.size>=this.config.maxCalls)return;
    this.outreachBusy=true;let call;
    try{
      const callerId='outreach-'+randomUUID();
      const offer=await this.api.event({type:'outreach_claim',providerCallId:callerId,allowedDids:this.config.outreachDids});
      if(!offer.available)return;
      call={callerId,providerCallId:callerId,callId:offer.runtime.callId,runtime:offer.runtime,calledNumber:offer.calledNumber,outbound:true,phase:'outbound_ringing',queue:Promise.resolve(),callbackContext:{callerPhone:offer.destination,defaultCountry:offer.runtime.callbackContext?.defaultCountry}};
      this.calls.set(callerId,call);this.channels.set(callerId,call);await this.api.track(call);
      if(this.stopping||this.calls.size>this.config.maxCalls)throw new Error('Call capacity changed');
      const route=this.config.routing?.routes.find(r=>r.did===offer.calledNumber);call.route=route||null;
      if(this.config.routing&&(!route||route.workspaceKey!==offer.runtime.workspaceKey||route.locationKey!==offer.runtime.locationKey))throw new Error('Outreach scope mismatch');
      if(!this.config.outreachDids.includes(offer.calledNumber)||!e164(offer.destination))throw new Error('Outreach route not allowed');
      const blocked=[offer.calledNumber,...(this.config.routing?.routes.flatMap(r=>[r.did,...r.publicNumbers])||[])];
      if(blocked.includes(offer.destination))throw new Error('Outreach loop blocked');
      if(!this.reserveOutboundSlot(call))throw new Error('Outbound capacity unavailable');
      if(route?.outboundTrunk!==route?.trunk&&route?.callerIdVerified!==true)throw new Error('Outbound caller ID needs carrier confirmation');
      const endpoint=route?this.config.routing.trunks.find(t=>t.id===(route.outboundTrunk||route.trunk))?.endpoint:this.config.sipEndpoint;
      if(!endpoint||!/^[a-zA-Z0-9_-]{1,64}$/.test(endpoint))throw new Error('Invalid endpoint');
      await this.ari.request('POST','/channels',{endpoint:'PJSIP/'+offer.destination+'@'+endpoint,app:this.config.appName,appArgs:'outreach',channelId:callerId,callerId:route?.outboundCallerId||offer.calledNumber,timeout:this.config.ringSeconds});
      call.outboundRingTimer=setTimeout(()=>{if(call.phase==='outbound_ringing')this.enqueue(call,()=>this.finish(call,'disconnected','outreach_no_answer')).catch(()=>{});},(this.config.ringSeconds+5)*1000);
    }catch{if(call)await this.finish(call,'failed','outreach_connection_failed');}
    finally{this.outreachBusy=false;}
  }
  async answerOutreach(call){
    clearTimeout(call.outboundRingTimer);
    try{
      this.assertPresent(call);const runtime=call.runtime;
      call.bridgeId='dai-'+randomUUID();await this.ari.bridge(call.bridgeId,'','POST',{type:'mixing,proxy_media'});
      call.media=await this.attachMedia(call,call.bridgeId,'caller');this.assertPresent(call);
      call.voice=this.voiceFactory(call.media,{instructions:runtime.instructions,voice:runtime.voice,tools:voiceTools([],runtime.patientFeatures),identity:call.callId});
      this.trackUsage(call,call.voice,'caller');
      call.voice.on('fault',()=>this.enqueue(call,()=>this.finish(call,'failed','voice_unavailable')).catch(()=>{}));
      call.voice.on('tool',tool=>this.enqueue(call,()=>this.tool(call,tool)).catch(()=>{}));
      await call.voice.connect();this.assertPresent(call);
      call.billingStartedAt=Date.now();this.applyCreditBudget(call,runtime.prepaid);
      await this.ari.bridge(call.bridgeId,'/addChannel','POST',{channel:call.callerId});
      await this.api.event(this.body(call,'connected'));this.assertPresent(call);call.phase='talking';
      call.deadline=setTimeout(()=>this.enqueue(call,()=>this.finish(call,'information_only','outreach_duration_limit')).catch(()=>{}),180000);
      call.lastHeartbeat=Date.now();call.heartbeat=setInterval(()=>this.heartbeat(call),10000);
      call.voice.respond({instructions:runtime.instructions+'\nSay exactly this opening once, then wait silently: '+JSON.stringify(runtime.greeting),tool_choice:'none'});
    }catch{await this.finish(call,'failed','outreach_connection_failed');}
  }
  async inbound(e){
    const callerId=e.channel.id,calledNumber=e164(e.args[1]);
    if(this.stopping||!calledNumber||this.calls.size>=this.config.maxCalls){await this.ari.safeDeleteChannel(callerId);return;}
    const call={callerId,providerCallId:callerId,phase:'starting',queue:Promise.resolve()};this.calls.set(callerId,call);this.channels.set(callerId,call);
    return this.enqueue(call,()=>this.startInbound(call,e));
  }
  async startInbound(call,e){
    const callerId=call.callerId,calledNumber=e164(e.args[1]);
    try{
      call.route=inboundRoute(this.config,calledNumber,e.args[2]);
      const ingress=this.config.routing?.trunks.find(t=>t.id===call.route?.trunk);
      if(ingress&&this.userSlots(ingress.id,call)>=ingress.maxForwardingCalls)return this.finish(call,'failed','forwarding_capacity_unavailable');
      const callerPhone=inboundCallerNumber(e.channel.caller?.number);
      call.callbackContext={callerPhone};
      const config=await this.api.event({type:'authorize',billingProtocol:4,providerCallId:callerId,calledNumber,callerPhone});
      if(!config.allowed){this.report(call,'call_rejected');return this.finish(call,'failed','admission_denied');}
      call.callId=config.callId;
      if(config.protocolVersion!==4)throw new Error('Portal and gateway must both use billing protocol 4');
      call.runtime=config;call.calledNumber=calledNumber;call.callbackContext={defaultCountry:config.callbackContext?.defaultCountry||null,callerPhone};await this.api.track(call);this.assertPresent(call);
      if(call.route&&(config.workspaceKey!==call.route.workspaceKey||config.locationKey!==call.route.locationKey))throw new Error('DID assignment changed; gateway route must be updated');
      call.bridgeId='dai-'+randomUUID();await this.ari.bridge(call.bridgeId,'','POST',{type:'mixing,proxy_media'});this.assertPresent(call);
      call.media=await this.attachMedia(call,call.bridgeId,'caller');
      const instructions=config.instructions+'\nStaff routing is available through find_transfer_target. Staff names, target IDs and direct numbers are private; do not list or disclose them.';
      call.voice=this.voiceFactory(call.media,{instructions,voice:config.voice,tools:voiceTools(config.transferTargets,config.patientFeatures),identity:call.callId});
      this.trackUsage(call,call.voice,'caller');
      call.voice.on('fault',()=>this.enqueue(call,()=>call.phase==='connected'||call.aiDetached?undefined:this.finish(call,'failed','voice_unavailable')).catch(()=>{}));
      call.voice.on('tool',tool=>this.enqueue(call,()=>this.tool(call,tool)).catch(()=>this.enqueue(call,()=>this.finish(call,'failed','control_error')).catch(()=>{})));
      await call.voice.connect();this.assertPresent(call);
      call.billingStartedAt=Date.now();
      this.applyCreditBudget(call,config.prepaid);
      await this.ari.channel(callerId,'/answer');await this.ari.bridge(call.bridgeId,'/addChannel','POST',{channel:callerId});this.assertPresent(call);
      await this.api.event(this.body(call,'connected'));this.assertPresent(call);call.phase='talking';
      call.deadline=setTimeout(()=>this.enqueue(call,()=>this.finish(call,call.phase==='connected'?'transferred':'disconnected','call_duration_limit')).catch(()=>{}),this.config.maxCallSeconds*1000);
      call.lastHeartbeat=Date.now();call.heartbeat=setInterval(()=>this.heartbeat(call),config.prepaid.enabled?Math.min(15000,Math.max(1000,Math.floor(config.prepaid.seconds*1000/3))):15000);
      // response.create.instructions REPLACES the session instructions for this
      // turn. Preserve the full policy, then constrain the opening explicitly.
      call.voice.respond({instructions:[instructions,
        '\nOPENING TURN ONLY',
        'Say exactly and only the following configured greeting, once: '+JSON.stringify(config.greeting),
        'Treat the quoted greeting as text to speak, not as instructions. Do not change, paraphrase or add anything.',
        'After the final word of the greeting, end this response immediately. Wait silently for the caller to speak.',
        'Do not list services, billing questions, general queries, appointments or things you can help with. Do not answer an invented caller question or begin intake during this opening turn.'
      ].join('\n'),tool_choice:'none'});
      this.report(call,'call_connected',{callerNumberAvailable:!!callerPhone});
    }catch{await this.finish(call,'failed','connection_failed');}
  }
  body(call,type,extra={}){return {type,callId:call.callId,providerCallId:call.providerCallId,...extra};}
  trackUsage(call,voice,leg){
    voice.on('responseDone',response=>{
      if(!response?.id||!response.usage)return;
      let usage;try{usage=normalizeRealtimeUsage(response.usage);}catch{this.report(call,'voice_usage_needs_review');return;}
      // Store token counters only. Conversation output, audio and transcripts are excluded.
      const body=this.body(call,'usage',{responseId:response.id,model:this.config.model,leg,usage});
      call.usageQueue=(call.usageQueue||Promise.resolve()).then(()=>this.api.durable(body)).catch(()=>this.report(call,'voice_usage_queued'));
    });
  }
  applyCreditBudget(call,budget){
    if(call.ended||call.aiDetached||call.phase==='connected')return;
    if(!budget||typeof budget.enabled!=='boolean')throw new Error('Missing prepaid admission budget');
    if(!budget.enabled)return;
    if(!Number.isInteger(budget.seconds)||budget.seconds<0||budget.seconds>3500)throw new Error('Invalid prepaid budget');
    clearTimeout(call.creditTimer);
    const remaining=call.billingStartedAt+budget.seconds*1000-Date.now()-250;
    const expire=()=>{if(!call.ended&&!call.aiDetached&&call.phase!=='connected')this.finish(call,call.outcome||'disconnected','prepaid_credit_exhausted').catch(()=>{});};
    // This deadline bypasses the control queue: a slow API/tool cannot prolong unfunded audio.
    if(budget.stop||remaining<=0)expire();else call.creditTimer=setTimeout(expire,remaining);
  }
  async heartbeat(call){
    if(call.ended||call.heartbeatBusy)return;call.heartbeatBusy=true;
    try{
      const response=await this.api.event(this.body(call,'heartbeat'));
      if(call.runtime.prepaid?.enabled)this.applyCreditBudget(call,response.prepaid);
      call.lastHeartbeat=Date.now();await this.api.flush();
    }catch{
      if(Date.now()-call.lastHeartbeat>45000)this.finish(call,'failed','control_connection_lost').catch(()=>{});
    }finally{call.heartbeatBusy=false;}
  }
  async attachMedia(call,bridgeId,role){
    const media=this.mediaFactory();media.on('fault',()=>this.enqueue(call,()=>call.phase==='connected'||call.aiDetached?undefined:role==='staff'?this.failTransfer(call,call.staffDeclined?'declined':'failed'):this.finish(call,'failed','audio_failed')).catch(()=>{}));
    const id='media-'+randomUUID();if(role==='caller'){call.mediaId=id;call.media=media;}else{call.consultMediaId=id;call.consultMedia=media;}
    this.channels.set(id,call);const port=await media.start();
    await this.ari.request('POST','/channels/externalMedia',{channelId:id,app:this.config.appName,external_host:'127.0.0.1:'+port,format:'ulaw',encapsulation:'rtp',transport:'udp',connection_type:'client',direction:'both'});
    const address=await this.ari.channel(id,'/variable','GET',{variable:'UNICASTRTP_LOCAL_ADDRESS'}),peerPort=await this.ari.channel(id,'/variable','GET',{variable:'UNICASTRTP_LOCAL_PORT'});
    media.setPeer(address.value,Number(peerPort.value));await this.ari.bridge(bridgeId,'/addChannel','POST',{channel:id});return media;
  }
  async tool(call,tool){
    if(call.phase!=='talking'||!call.voice)return;
    try{
      if(!tool.args||!voiceTools(call.runtime.transferTargets,call.runtime.patientFeatures).some(t=>t.name===tool.name))return call.voice.result(tool.id,{ok:false,reason:'tool_not_available'});
      if(tool.name==='wait_for_user'){
        call.voice.result(tool.id,{ok:true},false);
      }else if(tool.name==='find_transfer_target'){
        const result=findTransferTarget(call.runtime.transferTargets||[],tool.args.requestedName,tool.args.requestedRole);
        call.matchedTarget=result.found?result.target:null;call.requestedTarget=result.found?result.requestedTarget||null:null;
        call.matchedHandle=result.found?'transfer-'+randomUUID():null;
        call.roleOnlyRequest=roleOnlyRequest(tool.args);call.frontDeskFallback=result.found&&result.fallback===true;
        call.requestedRole=result.requestedTarget?.role||result.requestedRole||result.target?.role||requestedStaffRole(tool.args.requestedRole)||requestedStaffRole(tool.args.requestedName)||'';
        call.requestedRecipient=call.roleOnlyRequest?call.requestedRole:String(tool.args.requestedName||'').trim();
        this.report(call,'staff_lookup',{found:result.found,fallback:result.fallback===true,reason:result.fallbackReason||result.reason||'matched'});
        call.voice.result(tool.id,privateLookupResult(result,call.matchedHandle));
      }else if(tool.name==='get_callback_number'){
        const prepared=callbackNumber(tool.args,call.callbackContext);
        call.preparedCallbackPhone=prepared.ok?prepared.callbackPhone:null;
        call.voice.result(tool.id,prepared);
      }else if(tool.name==='save_callback'){
        const b=tool.args,intake=transferIntake({...b,callerDetailsConfirmed:b.callbackDetailsConfirmed},{maxReason:1200});
        if(!intake.ok)return call.voice.result(tool.id,{...intake,instruction:CALLBACK_INSTRUCTIONS});
        const prepared=callbackNumber(b,call.callbackContext);
        if(!prepared.ok){call.preparedCallbackPhone=null;this.report(call,'callback_number_needs_correction',{reason:prepared.reason});return call.voice.result(tool.id,prepared);}
        if(call.preparedCallbackPhone!==prepared.callbackPhone){
          call.preparedCallbackPhone=prepared.callbackPhone;
          return call.voice.result(tool.id,{...prepared,ok:false,reason:'callback_number_confirmation_required',instruction:'Read this prepared number back and get agreement before calling save_callback again. Keep the other confirmed details.'});
        }
        const r=await this.api.event(this.body(call,'save_callback',{callerName:intake.callerName,callbackPhone:prepared.callbackPhone,reason:intake.reason,callerType:intake.callerType,companyName:intake.companyName,requestedRecipient:call.callbackRecipient||call.requestedRecipient||b.requestedRecipient||'',requestedRole:call.callbackRole||call.requestedRole||b.requestedRole||'',callbackDetailsConfirmed:true}));
        if(r.ok){call.outcome='callback_required';this.report(call,'callback_saved');}
        call.voice.result(tool.id,r);
      }else if(patientTools(call.runtime.patientFeatures).some(t=>t.name===tool.name)){
        const result=await this.api.event(this.body(call,'patient_action',{toolId:tool.id,name:tool.name,arguments:tool.args}));
        if(!call.ending)call.voice.result(tool.id,result);
      }else if(tool.name==='request_warm_transfer')await this.startTransfer(call,tool);
      else {call.voice.result(tool.id,{ok:true,ending:true},false);call.voice.pause();await call.voice.say('Thank you for calling. Goodbye.');await this.finish(call,call.outcome||'information_only','assistant_ended');}
    }catch(error){
      this.report(call,'tool_action_failed',{tool:tool.name,status:Number.isInteger(error.status)?error.status:null,reason:['invalid_phone','caller_details_required','invalid_staff_role','call_already_ended'].includes(error.message)?error.message:'action_unavailable'});
      if(!call.ending&&call.phase==='talking')call.voice.result(tool.id,{ok:false,reason:error.message==='invalid_phone'?'invalid_phone':'action_unavailable',instruction:error.message==='invalid_phone'?'Ask the caller to correct the callback number and use get_callback_number before confirming and saving it.':'Apologise briefly. Do not claim the action succeeded or end the call unless the caller is finished.'});else await this.failTransfer(call,'failed');
    }
  }
  userSlots(trunkId,excludeInbound=null){
    const trunk=this.config.routing?.trunks.find(t=>t.id===trunkId);
    let count=0;
    for(const other of this.calls.values()){
      if(other.ended)continue;
      if(other!==excludeInbound&&!other.outbound&&other.route?.trunk===trunkId)count++;
      if(trunk?.direction==='both'&&other.outboundSlot===trunkId)count++;
    }
    return count;
  }
  reserveOutboundSlot(call){
    const key=call.route?.outboundTrunk||call.route?.trunk||'legacy';
    const trunk=this.config.routing?.trunks.find(t=>t.id===key);
    const busy=[...this.calls.values()].filter(c=>!c.ended&&c.outboundSlot===key).length;
    if(busy>=(trunk?.maxOutboundCalls||this.config.maxOutboundCalls||5))return false;
    if(trunk?.direction==='both'&&this.userSlots(key)>=trunk.maxForwardingCalls)return false;
    call.outboundSlot=key;return true;
  }
  async startTransfer(call,tool){
    const b=tool.args;
    if(!call.matchedTarget||call.matchedHandle!==b.targetId)return call.voice.result(tool.id,{ok:false,reason:'staff_lookup_required',instruction:'First find the caller-requested role or person with find_transfer_target and use only the returned routing handle.'});
    if(!call.runtime.transferTargets?.some(t=>t.id===call.matchedTarget.id))return call.voice.result(tool.id,{ok:false,reason:'target_not_configured'});
    const intake=transferIntake(b);if(!intake.ok)return call.voice.result(tool.id,intake);
    if(call.frontDeskFallback&&b.fallbackConfirmed!==true)return call.voice.result(tool.id,{ok:false,reason:'front_desk_confirmation_required',instruction:'Explain briefly that reception can help with this request and confirm that destination. Set fallbackConfirmed:true only after the caller agrees.'});
    const policy=callbackPolicy(call.transferFailures);
    if(policy.callbackOnly||policy.afterFailure&&(staffRole(call.matchedTarget)!=='receptionist'||b.alternativeRequested!==true))return call.voice.result(tool.id,{ok:false,reason:'callback_required_after_transfer',instruction:CALLBACK_INSTRUCTIONS});
    if(!this.reserveOutboundSlot(call))return call.voice.result(tool.id,{ok:false,reason:'transfer_capacity_unavailable',instruction:CALLBACK_INSTRUCTIONS});
    let r;try{r=await this.api.event(this.body(call,'transfer_request',{targetId:call.matchedTarget.id,targetName:call.matchedTarget.name,requestedTargetId:call.requestedTarget?.id,requestedTargetName:call.requestedTarget?.name,frontDeskFallback:call.frontDeskFallback===true,fallbackConfirmed:b.fallbackConfirmed===true,requestedRecipient:call.requestedRecipient,requestedRole:call.requestedRole,callerName:intake.callerName,reason:intake.reason,callerType:intake.callerType,companyName:intake.companyName,callerDetailsConfirmed:true,alternativeRequested:b.alternativeRequested===true}));}catch(error){delete call.outboundSlot;throw error;}
    if(!r.available){
      delete call.outboundSlot;
      (call.transferFailures||=[]).push({status:'failed',caller_type:intake.callerType});
      call.callbackRecipient=call.roleOnlyRequest?call.requestedRole:call.requestedRecipient;call.callbackRole=call.requestedTarget?.role||(call.frontDeskFallback?call.requestedRole:staffRole(call.matchedTarget));
      return call.voice.result(tool.id,{ok:false,reason:r.reason,instruction:CALLBACK_INSTRUCTIONS});
    }
    call.transferId=r.transferId;call.transferTool=tool;
    call.targetPhone=r.targetPhone;call.targetName=r.targetName;call.transferRole=r.targetRole||staffRole(call.matchedTarget);call.introduction={name:intake.callerName,reason:intake.reason,company:intake.companyName,requestedRecipient:call.roleOnlyRequest?call.requestedRole:(r.requestedTargetName||call.requestedRecipient)};call.transferCallerType=intake.callerType;
    let dial;
    try{dial=dialDestination(this.config,call,r);}catch{return this.failTransfer(call,'failed');}
    call.phase='holding';call.voice.pause();
    await call.voice.say(call.frontDeskFallback?'Please hold while I check whether the front desk can help.':'Please hold while I check whether someone can take your call.');this.assertPresent(call);
    await this.ari.bridge(call.bridgeId,'/removeChannel','POST',{channel:call.callerId});
    await this.ari.channel(call.callerId,'/moh');this.assertPresent(call);
    call.consultBridgeId='consult-'+randomUUID();await this.ari.bridge(call.consultBridgeId,'','POST',{type:'mixing,proxy_media'});
    call.staffId='staff-'+randomUUID();call.staffGone=false;call.staffDeclined=false;call.staffAnswered=false;call.acceptReady=false;this.channels.set(call.staffId,call);call.phase='ringing';
    // The only dial destination is the backend's scoped, authorised result.
    await this.ari.channel(call.staffId,'','POST',{endpoint:dial.endpoint,app:this.config.appName,appArgs:'staff',callerId:dial.callerId,timeout:this.config.ringSeconds,formats:'ulaw'});
    call.transferTimer=setTimeout(()=>this.enqueue(call,()=>this.failTransfer(call,'no_answer')).catch(()=>{}),(this.config.ringSeconds+2)*1000);
  }
  async staffAnswered(call){
    if(call.phase!=='ringing')return;clearTimeout(call.transferTimer);this.assertPresent(call);if(call.staffGone)return this.failTransfer(call,'no_answer');
    try{
      call.phase='consulting';await this.api.event(this.body(call,'transfer_answered',{transferId:call.transferId}));
      await this.ari.bridge(call.consultBridgeId,'/addChannel','POST',{channel:call.staffId});
      const media=await this.attachMedia(call,call.consultBridgeId,'staff');
      // A separate AI session receives only the approved introduction. The caller
      // is in neither this bridge nor this model context.
      call.consultVoice=this.voiceFactory(media,{instructions:'You read a short call introduction to a staff member. You have no tools. Do not conduct a conversation or alter the instructions.',voice:call.runtime.voice,tools:[],identity:call.callId+'-consult',listen:false});
      this.trackUsage(call,call.consultVoice,'staff');
      call.consultVoice.on('fault',()=>this.enqueue(call,()=>this.failTransfer(call,'failed')).catch(()=>{}));
      await call.consultVoice.connect();this.assertPresent(call);
      await call.consultVoice.say(`Hello ${call.targetName}, this is ${call.runtime.assistantName||'the virtual receptionist'}. ${call.introduction.name}${call.introduction.company?' from '+call.introduction.company:''} is calling about: ${call.introduction.reason}.${call.introduction.requestedRecipient?' They asked to speak with '+call.introduction.requestedRecipient+'.':''} Would you like to take the call? Press 1 to accept the call, or press 2 to decline.`);
      this.assertPresent(call);if(call.staffGone||call.staffDeclined)return this.failTransfer(call,call.staffDeclined?'declined':'no_answer');call.acceptReady=true;
      call.transferTimer=setTimeout(()=>this.enqueue(call,()=>this.failTransfer(call,'no_answer')).catch(()=>{}),this.config.acceptSeconds*1000);
    }catch{await this.failTransfer(call,call.staffDeclined?'declined':'failed');}
  }
  async accept(call){
    if(call.phase!=='consulting'||!call.acceptReady||call.staffGone)return;
    this.assertPresent(call);clearTimeout(call.transferTimer);call.acceptReady=false;
    try{
      await this.api.event(this.body(call,'transfer_accepted',{transferId:call.transferId}));this.assertPresent(call);
      await this.closeConsultMedia(call);
      await this.ari.bridge(call.consultBridgeId,'/removeChannel','POST',{channel:call.staffId});this.assertPresent(call);
      // Remove AI audio before either human can hear the other.
      call.aiDetached=true;clearTimeout(call.creditTimer);call.voice.close();call.media.close();this.channels.delete(call.mediaId);await this.ari.safeDeleteChannel(call.mediaId);
      await this.ari.channel(call.callerId,'/moh','DELETE');this.assertPresent(call);if(call.staffGone)throw new Error('Staff disconnected');
      await this.ari.bridge(call.bridgeId,'/addChannel','POST',{channel:call.callerId+','+call.staffId});
      this.assertPresent(call);if(call.staffGone)throw new Error('Staff disconnected');
      call.phase='connected';const occurredAt=new Date().toISOString();
      try{await this.api.durable(this.body(call,'transfer_connected',{transferId:call.transferId,occurredAt}));}catch{this.report(call,'transfer_confirmation_queued');}
      await this.ari.safeDeleteBridge(call.consultBridgeId);call.consultBridgeId=null;this.report(call,'staff_transfer_connected');
    }catch{await this.finish(call,'failed','transfer_connection_failed');}
  }
  async closeConsultMedia(call){call.consultVoice?.close();call.consultMedia?.close();if(call.consultMediaId){this.channels.delete(call.consultMediaId);await this.ari.safeDeleteChannel(call.consultMediaId);call.consultMediaId=null;}}
  async failTransfer(call,status){
    if(call.ended||call.phase==='connected'||!call.transferId)return;clearTimeout(call.transferTimer);call.acceptReady=false;
    const transferId=call.transferId;call.transferId=null;delete call.outboundSlot;
    call.callbackRecipient=call.roleOnlyRequest?call.requestedRole:call.requestedRecipient;call.callbackRole=call.requestedTarget?.role||(call.frontDeskFallback?call.requestedRole:call.transferRole);
    (call.transferFailures||=[]).push({status,caller_type:call.transferCallerType||'other'});
    try{
      if(call.staffId){this.channels.delete(call.staffId);await this.ari.safeDeleteChannel(call.staffId);call.staffId=null;}
      await this.closeConsultMedia(call);await this.ari.safeDeleteBridge(call.consultBridgeId);call.consultBridgeId=null;
      // Persist in the encrypted event queue without keeping the caller on hold
      // or hanging them up because a portal request is temporarily unavailable.
      call.transferEvents=(call.transferEvents||Promise.resolve()).then(()=>this.api.durable(this.body(call,'transfer_failed',{transferId,status}))).catch(()=>this.report(call,'transfer_outcome_queued'));
      this.report(call,'staff_transfer_recovered',{status});
      this.assertPresent(call);await this.ari.channel(call.callerId,'/moh','DELETE');await this.ari.bridge(call.bridgeId,'/addChannel','POST',{channel:call.callerId});
      call.phase='talking';call.voice.resume();call.voice.result(call.transferTool.id,{ok:false,reason:status,callbackOnly:callbackPolicy(call.transferFailures).callbackOnly,instruction:CALLBACK_INSTRUCTIONS});
    }catch{await this.finish(call,'failed','transfer_recovery_failed');}
  }
  async finish(call,outcome='disconnected',reason='ended'){
    if(call.ended)return;call.ended=true;call.ending=true;const occurredAt=call.disconnectedAt||new Date().toISOString();clearTimeout(call.outboundRingTimer);clearTimeout(call.deadline);clearTimeout(call.creditTimer);clearTimeout(call.transferTimer);clearInterval(call.heartbeat);
    call.voice?.close();call.consultVoice?.close();call.media?.close();call.consultMedia?.close();
    const cleanup=[];for(const id of [call.callerId,call.staffId,call.mediaId,call.consultMediaId])if(id){this.channels.delete(id);cleanup.push(this.ari.safeDeleteChannel(id));}
    await Promise.allSettled(cleanup);await Promise.allSettled([call.bridgeId,call.consultBridgeId].filter(Boolean).map(id=>this.ari.safeDeleteBridge(id)));
    if(call.callId){try{await call.usageQueue;await call.transferEvents;await this.api.durable(this.body(call,'ended',{outcome:call.phase==='connected'&&outcome!=='failed'?'transferred':outcome,reason,occurredAt}));await this.api.untrack(call.callId);}catch{this.report(call,'call_end_queued');}}
    this.calls.delete(call.providerCallId);this.report(call,'call_closed',{outcome,reason});
  }
  async shutdown(){this.stopping=true;for(const call of this.calls.values()){call.ending=true;call.voice?.close();call.consultVoice?.close();}await Promise.allSettled([...this.calls.values()].map(call=>this.enqueue(call,()=>this.finish(call,'failed','gateway_stopping'))));}
}
