import {localNetworks,tlsConfiguration} from './transport.js';
import {isIP} from 'node:net';

function safe(env,key,pattern) {
  const value=env[key]; if(typeof value!=='string'||!pattern.test(value)) throw new Error('Missing or invalid '+key); return value;
}
function network(value) {
  const parts=value.split('/'),ip=parts[0],mask=parts[1]===undefined?32:Number(parts[1]);
  if(parts.length>2||isIP(ip)!==4||parts[1]!==undefined&&!/^\d+$/.test(parts[1])||!Number.isInteger(mask)||mask<8||mask>32)throw new Error('Use provider-issued IPv4 addresses or narrow CIDRs');
  const address=ip.split('.').reduce((n,v)=>n*256+Number(v),0),size=2**(32-mask),start=Math.floor(address/size)*size;
  return {start,end:start+size-1};
}
export function multiAsteriskConfiguration(env,routing) {
  const user=safe(env,'ARI_USERNAME',/^[a-zA-Z0-9_-]+$/),password=safe(env,'ARI_PASSWORD',/^[a-zA-Z0-9!@#$%^&*()_+=.,:?-]{20,}$/);
  if(env.PUBLIC_IPV4&&isIP(env.PUBLIC_IPV4)!==4)throw new Error('Invalid PUBLIC_IPV4');
  const nat=localNetworks(env);
  let pjsip='[global]\ntype=global\nuser_agent=Nerix\nendpoint_identifier_order=ip,username\n';
  for(const transport of new Set(routing.trunks.map(t=>t.transport))) {
    pjsip+=`\n[nerix-${transport}]\ntype=transport\nprotocol=${transport}\nbind=0.0.0.0:${transport==='tls'?5061:5060}\n${nat}`;
    if(transport==='tls')pjsip+=tlsConfiguration(env,{acceptInbound:routing.trunks.some(t=>t.transport==='tls'&&t.direction!=='outbound')});
  }
  let dialplan='[general]\nstatic=yes\nwriteprotect=yes\n';
  const identified=[];
  for(const t of routing.trunks) {
    const register=t.register!==false,host=register?safe(env,t.serverEnv,/^[a-zA-Z0-9.-]+$/):null,username=register?safe(env,t.usernameEnv,/^[a-zA-Z0-9_.+@-]+$/):null,secret=register?safe(env,t.passwordEnv,/^[a-zA-Z0-9!@#$%^&*()_+=.,:?-]+$/):null;
    const ips=safe(env,t.trustedIpsEnv,/^[0-9.,/ ]+$/).split(',').map(v=>v.trim()),ranges=ips.map(network);
    if(t.direction!=='outbound'&&t.inboundMatch==='ip') {
      for(const prior of identified)if(ranges.some(a=>prior.ranges.some(b=>a.start<=b.end&&b.start<=a.end)))throw new Error('Overlapping IP identification for '+prior.id+' and '+t.id+'. Use one shared trunk or provider-confirmed line matching.');
      identified.push({id:t.id,ranges});
    }
    const assigned=routing.routes.filter(r=>r.trunk===t.id),context='nerix-in-'+t.id,base=t.endpoint,server=`sip:${host}:${t.port||(t.transport==='tls'?5061:5060)}`;
    const contact=assigned.length===1?assigned[0].did:'nerix-unrouted';
    if(register)pjsip+=`\n[${base}-auth]\ntype=auth\nauth_type=userpass\nusername=${username}\npassword=${secret}\n\n[${base}-registration]\ntype=registration\ntransport=nerix-${t.transport}\noutbound_auth=${base}-auth\nserver_uri=${server}\nclient_uri=sip:${username}@${host}\ncontact_user=${contact}\nline=yes\nendpoint=${base}\nretry_interval=60\nforbidden_retry_interval=600\nexpiration=300\n\n[${base}-aor]\ntype=aor\ncontact=${server}\nqualify_frequency=60\n`;
    pjsip+=`\n[${base}]\ntype=endpoint\ntransport=nerix-${t.transport}\ncontext=${context}\ndisallow=all\nallow=ulaw\n`;
    if(register)pjsip+=`outbound_auth=${base}-auth\naors=${base}-aor\nfrom_user=${username}\nfrom_domain=${host}\n`;
    pjsip+=`send_pai=yes\ntrust_id_inbound=no\ndirect_media=no\nrtp_symmetric=yes\nforce_rport=yes\nrewrite_contact=yes\ndtmf_mode=rfc4733\nmedia_encryption=${t.mediaEncryption||'no'}\ndeny=0.0.0.0/0\n`;
    for(const ip of ips)pjsip+=`permit=${ip}\n`;
    if(t.direction!=='outbound'&&t.inboundMatch==='ip')pjsip+=`\n[${base}-identify]\ntype=identify\nendpoint=${base}\nmatch=${ips.join(',')}\n`;
    dialplan+=`\n[${context}]\n; Only explicitly assigned destination aliases can enter Sarah.\n`;
    for(const r of assigned) {
      const aliases=[...r.inboundAliases];
      // The registration username is safe only when there is one unambiguous DID.
      if(register&&assigned.length===1&&username!=='s'&&!aliases.includes(username))aliases.push(username);
      for(const alias of aliases)dialplan+=`exten => ${alias},1,Stasis(nerix-reception,inbound,${r.did},${t.id})\n same => n,Hangup()\n`;
    }
    dialplan+='exten => s,1,Hangup(21)\nexten => _.,1,Hangup(21)\n';
  }
  return {
    'http.conf':'[general]\nenabled=yes\nbindaddr=127.0.0.1\nbindport=8088\n',
    'ari.conf':`[general]\nenabled=yes\npretty=no\n[${user}]\ntype=user\nread_only=no\npassword=${password}\n`,
    'rtp.conf':'[general]\nrtpstart=10000\nrtpend=10199\nstrictrtp=yes\n',
    'pjsip.conf':pjsip,'extensions.conf':dialplan,
    'modules.conf':'[modules]\nautoload=yes\n',
    'musiconhold.conf':'[default]\nmode=files\ndirectory=/usr/share/asterisk/moh\n'
  };
}
