import fs from 'node:fs';

const number = value => typeof value === 'string' && /^\+[1-9]\d{6,14}$/.test(value);
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(value);
const envKey = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(value);
function requireValue(condition, message) { if (!condition) throw new Error('Gateway routing: ' + message); }

// This file is controlled by the gateway operator, never by callers or customer users.
// Endpoint names and caller IDs cannot be supplied through an AI tool call.
export function validateRouting(input) {
  requireValue(input?.version === 1, 'version must be 1');
  requireValue(Array.isArray(input.trunks) && input.trunks.length > 0 && input.trunks.length <= 100, 'configure 1–100 trunks');
  requireValue(Array.isArray(input.routes) && input.routes.length > 0 && input.routes.length <= 500, 'configure 1–500 DID routes');
  const ids = new Set();
  const trunks = input.trunks.map(t => {
    requireValue(identifier(t.id) && !ids.has(t.id), 'trunk IDs must be unique safe names'); ids.add(t.id);
    const direction=t.direction||'both';
    requireValue(['inbound','outbound','both'].includes(direction),'direction must be inbound, outbound or both');
    const register=direction!=='inbound';
    for(const field of ['maxForwardingCalls','maxOutboundCalls'])requireValue(t[field]===undefined||Number.isInteger(t[field])&&t[field]>=1&&t[field]<=100,'invalid '+field);
    for (const key of register?['serverEnv','usernameEnv','passwordEnv','trustedIpsEnv']:['trustedIpsEnv']) requireValue(envKey(t[key]), 'trunk ' + t.id + ' needs ' + key);
    requireValue(['ip','line'].includes(t.inboundMatch || 'ip'), 'inboundMatch must be ip or line');
    requireValue(['udp','tls'].includes(t.transport || 'udp'), 'transport must be udp or tls');
    requireValue(['no','sdes'].includes(t.mediaEncryption || 'no'), 'unsupported media encryption');
    requireValue(t.mediaEncryption !== 'sdes' || t.transport === 'tls', 'SDES requires TLS');
    requireValue(t.port === undefined || Number.isInteger(t.port) && t.port > 0 && t.port < 65536, 'invalid trunk port');
    requireValue(direction!=='inbound'||(t.inboundMatch||'ip')==='ip','forward-only ingress requires IP identification');
    return {...t,direction,register,maxForwardingCalls:t.maxForwardingCalls||5,maxOutboundCalls:t.maxOutboundCalls||5, endpoint:'nerix-peer-' + t.id, inboundMatch:t.inboundMatch || 'ip', transport:t.transport || 'udp'};
  });
  const dids = new Set(), scopes = new Set(), aliases = new Set();
  const routes = input.routes.map(r => {
    requireValue(number(r.did) && !dids.has(r.did), 'each DID must occur once in international format'); dids.add(r.did);
    requireValue(ids.has(r.trunk)&&trunks.find(t=>t.id===r.trunk).direction!=='outbound', 'unknown inbound trunk');
    const outboundTrunk=r.outboundTrunk||r.trunk;
    requireValue(ids.has(outboundTrunk)&&trunks.find(t=>t.id===outboundTrunk).direction!=='inbound','configure an outbound registration for this route');
    requireValue(typeof r.workspaceKey === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(r.workspaceKey), 'workspaceKey is required');
    requireValue(typeof r.locationKey === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(r.locationKey), 'locationKey is required');
    const scope = r.workspaceKey + '/' + r.locationKey;
    requireValue(!scopes.has(scope), 'assign one Nerix number to each location'); scopes.add(scope);
    requireValue(Array.isArray(r.publicNumbers) && r.publicNumbers.every(number), 'list the public numbers that forward to this DID');
    requireValue(r.inboundAliases===undefined||Array.isArray(r.inboundAliases), 'inboundAliases must be a list');
    const inboundAliases = [...new Set([r.did, r.did.slice(1), ...(r.inboundAliases || [])])];
    requireValue(inboundAliases.every(v => typeof v === 'string' && /^[a-zA-Z0-9_.+@-]{1,80}$/.test(v) && v !== 's'), 'invalid inbound alias');
    for (const alias of inboundAliases) {
      const key = r.trunk + '/' + alias; requireValue(!aliases.has(key), 'an inbound alias cannot identify two locations'); aliases.add(key);
    }
    requireValue(Array.isArray(r.transferNumbers) && r.transferNumbers.length <= 100 && r.transferNumbers.every(number), 'list the permitted staff telephone numbers in transferNumbers');
    const callerId = r.outboundCallerId || r.did;
    requireValue(number(callerId), 'invalid outbound caller ID');
    requireValue(callerId === r.did || r.callerIdVerified === true && r.publicNumbers.includes(callerId), 'a public caller ID needs provider verification and must belong to this location');
    return {...r,outboundTrunk, inboundAliases, transferNumbers:[...new Set(r.transferNumbers)], outboundCallerId:callerId};
  });
  // A public overflow destination must not itself be another Sarah entry point.
  for (const r of routes) requireValue(r.publicNumbers.every(p => !dids.has(p)), 'public overflow numbers must differ from every Nerix number');
  return {version:1,trunks,routes};
}
export function readRouting(env = process.env) {
  if (!env.GATEWAY_ROUTING_FILE) return null;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(env.GATEWAY_ROUTING_FILE, 'utf8')); }
  catch { throw new Error('Cannot read GATEWAY_ROUTING_FILE as JSON'); }
  return validateRouting(parsed);
}
export function inboundRoute(config, did, trunk) {
  if (!config.routing) return null; // Legacy single-DID installs keep working.
  const route = config.routing.routes.find(r => r.did === did && r.trunk === trunk);
  if (!route) throw new Error('Unconfigured inbound DID or trunk');
  return route;
}
export function dialDestination(config, call, result) {
  const phone=result.targetPhone,route=call.route;
  if (!number(phone)) throw new Error('A valid authorised telephone number is required');
  if (config.routing && !route) throw new Error('Inbound route is required');
  if (route && !route.transferNumbers.includes(phone)) throw new Error('Telephone destination is not authorised for this location');
  const blocked=[call.calledNumber,...(config.routing?.routes.flatMap(r=>[r.did,...r.publicNumbers])||[])];
  if (blocked.includes(phone)) throw new Error('Transfer would return to Sarah');
  if(route?.outboundTrunk&&route.outboundTrunk!==route.trunk&&route.callerIdVerified!==true)throw new Error('Confirm this location caller ID on the central outbound registration');
  const endpoint=route?config.routing.trunks.find(t=>t.id===(route.outboundTrunk||route.trunk))?.endpoint:config.sipEndpoint;
  if (!endpoint || !/^[a-zA-Z0-9_-]{1,64}$/.test(endpoint)) throw new Error('Invalid transfer endpoint');
  return {endpoint:'PJSIP/'+phone+'@'+endpoint,callerId:route?.outboundCallerId||call.calledNumber};
}
