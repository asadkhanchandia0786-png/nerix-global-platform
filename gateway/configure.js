import {localNetworks,tlsConfiguration} from './transport.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isIP} from 'node:net';
import {e164} from './config.js';
import {readRouting} from './routing.js';
import {multiAsteriskConfiguration} from './configure-multi.js';

export function asteriskConfiguration(env) {
  const routing=readRouting(env);if(routing)return multiAsteriskConfiguration(env,routing);
  const required=k=>{const v=env[k];if(!v)throw new Error('Missing setting: '+k);return v;};
  const clean=(k,pattern)=>{const v=required(k);if(!pattern.test(v))throw new Error('Invalid or unsupported characters in '+k);return v;};
  const host=clean('SIP_SERVER',/^[a-zA-Z0-9.-]+$/),user=clean('SIP_USERNAME',/^[a-zA-Z0-9_.+@-]+$/);
  const password=clean('SIP_PASSWORD',/^[a-zA-Z0-9!@#$%^&*()_+=.,:?-]+$/);
  const ariUser=clean('ARI_USERNAME',/^[a-zA-Z0-9_-]+$/),ariPass=clean('ARI_PASSWORD',/^[a-zA-Z0-9!@#$%^&*()_+=.,:?-]+$/);
  if(ariPass.length<20)throw new Error('Use an ARI password of at least 20 characters');
  const did=e164(required('SIP_INBOUND_DID'));if(!did)throw new Error('SIP_INBOUND_DID must be in +international format');
  const ips=required('SIP_TRUSTED_IPS').split(',').map(v=>v.trim());
  if(!ips.length||ips.some(v=>{const [ip,mask]=v.split('/');return isIP(ip)!==4||mask!==undefined&&(!/^\d+$/.test(mask)||Number(mask)<8||Number(mask)>32);}))throw new Error('Use provider-issued IPv4 addresses or narrow CIDR ranges for SIP_TRUSTED_IPS');
  const transport=env.SIP_TRANSPORT||'udp';if(!['udp','tls'].includes(transport))throw new Error('SIP_TRANSPORT must be udp or tls');
  const encryption=env.SIP_MEDIA_ENCRYPTION||'no';if(!['no','sdes'].includes(encryption))throw new Error('SIP_MEDIA_ENCRYPTION must be no or sdes');
  if(encryption==='sdes'&&transport!=='tls')throw new Error('Use TLS signaling for SDES media encryption');
  const serverPort=Number(env.SIP_SERVER_PORT||(transport==='tls'?5061:5060));if(!Number.isInteger(serverPort)||serverPort<1||serverPort>65535)throw new Error('Invalid SIP_SERVER_PORT');
  const nat=localNetworks(env);
  const server=`sip:${host}:${serverPort}`,tls=transport==='tls'?tlsConfiguration(env,{acceptInbound:true}):'';
  return {
    'http.conf':'[general]\nenabled=yes\nbindaddr=127.0.0.1\nbindport=8088\n',
    'ari.conf':`[general]\nenabled=yes\npretty=no\n[${ariUser}]\ntype=user\nread_only=no\npassword=${ariPass}\n`,
    'rtp.conf':'[general]\nrtpstart=10000\nrtpend=10199\nstrictrtp=yes\n',
    'pjsip.conf':`[global]\ntype=global\nuser_agent=Nerix\nendpoint_identifier_order=ip,username\n\n[nerix-transport]\ntype=transport\nprotocol=${transport}\nbind=0.0.0.0:${transport==='tls'?5061:5060}\n${tls}${nat}\n[nerix-auth]\ntype=auth\nauth_type=userpass\nusername=${user}\npassword=${password}\n\n[nerix-registration]\ntype=registration\ntransport=nerix-transport\noutbound_auth=nerix-auth\nserver_uri=${server}\nclient_uri=sip:${user}@${host}\ncontact_user=${did}\nretry_interval=60\nforbidden_retry_interval=600\nexpiration=300\n\n[nerix-aor]\ntype=aor\ncontact=${server}\nqualify_frequency=60\n\n[nerix-carrier]\ntype=endpoint\ntransport=nerix-transport\ncontext=nerix-inbound\ndisallow=all\nallow=ulaw\noutbound_auth=nerix-auth\naors=nerix-aor\nfrom_user=${user}\nfrom_domain=${host}\ndirect_media=no\nrtp_symmetric=yes\nforce_rport=yes\nrewrite_contact=yes\ndtmf_mode=rfc4733\nmedia_encryption=${encryption}\n\n[nerix-identify]\ntype=identify\nendpoint=nerix-carrier\nmatch=${ips.join(',')}\n`,
    'extensions.conf':`[general]\nstatic=yes\nwriteprotect=yes\n\n[nerix-inbound]\n; This dedicated SIP registration is mapped explicitly to its assigned DID.\n; Do not infer a practice from caller ID or accept arbitrary public SIP headers.\nexten => ${did},1,Stasis(nerix-reception,inbound,${did})\n same => n,Hangup()\n; Some providers deliver to the SIP username rather than contact_user.\n${user===did?'':`exten => ${user},1,Stasis(nerix-reception,inbound,${did})\n same => n,Hangup()\n`}exten => s,1,Hangup(21)\nexten => _.,1,Hangup(21)\n`,
    'modules.conf':'[modules]\nautoload=yes\n',
    'musiconhold.conf':'[default]\nmode=files\ndirectory=/usr/share/asterisk/moh\n'
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const at=process.argv.indexOf('--output');if(at<0||!process.argv[at+1])throw new Error('Supply --output /path/to/a/new/private-directory');
    const output=path.resolve(process.argv[at+1]),files=asteriskConfiguration(process.env);
    await fs.mkdir(output,{recursive:false,mode:0o700});
    for(const [name,content]of Object.entries(files))await fs.writeFile(path.join(output,name),content,{flag:'wx',mode:0o600});
    console.log('Created private Asterisk configuration. Install it only on the dedicated gateway host; see docs/SIP_SETUP.md.');
  }catch(error){console.error('Configuration not written: '+error.message);process.exitCode=1;}
}
