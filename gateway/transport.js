import {isIP} from 'node:net';

export function localNetworks(env) {
  const items=(env.SIP_LOCAL_NETWORKS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(env.PUBLIC_IPV4&&isIP(env.PUBLIC_IPV4)!==4)throw new Error('Invalid PUBLIC_IPV4');
  for(const value of items){
    const [ip,mask,...extra]=value.split('/');
    if(extra.length||isIP(ip)!==4||mask===undefined||!/^\d+$/.test(mask)||Number(mask)<8||Number(mask)>32)throw new Error('SIP_LOCAL_NETWORKS needs IPv4/CIDR networks, for example the host private IP/32');
  }
  if(env.PUBLIC_IPV4&&!items.length)throw new Error('Set SIP_LOCAL_NETWORKS to the actual private interface network when PUBLIC_IPV4 is set');
  const local=[...new Set(['127.0.0.1/32',...items])].map(n=>'local_net='+n+'\n').join('');
  return local+(env.PUBLIC_IPV4?'external_signaling_address='+env.PUBLIC_IPV4+'\nexternal_media_address='+env.PUBLIC_IPV4+'\n':'');
}
export function tlsConfiguration(env,{acceptInbound=false}={}) {
  const file=(key,required=false)=>{
    const value=env[key]||'';
    if(required&&!value)throw new Error('Set '+key+' for inbound TLS');
    if(value&&!/^\/[a-zA-Z0-9_./-]+$/.test(value))throw new Error('Invalid absolute certificate path in '+key);
    return value;
  };
  const cert=file('SIP_TLS_CERT_FILE',acceptInbound),key=file('SIP_TLS_KEY_FILE',acceptInbound);
  if(!!cert!==!!key)throw new Error('Set both SIP_TLS_CERT_FILE and SIP_TLS_KEY_FILE');
  return 'method=tlsv1_2\nverify_server=yes\nca_list_file='+(file('SIP_TLS_CA_FILE')||'/etc/ssl/certs/ca-certificates.crt')+'\n'+(cert?'cert_file='+cert+'\npriv_key_file='+key+'\n':'');
}

