import { createHmac, timingSafeEqual } from 'node:crypto';
// Same algorithm the gateway client uses: HMAC-SHA256 over "<unix seconds>.<exact raw JSON body>".
export const signGatewayBody = (secret, timestamp, raw) => createHmac('sha256', secret).update(String(timestamp) + '.').update(raw).digest('hex');
export function verifyGatewayRequest({ secret, timestamp, signature, raw, now = Date.now() }) {
  if (typeof secret !== 'string' || secret.length < 32) return { ok: false, status: 503, reason: 'gateway_not_configured' };
  if (!/^\d{10}$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return { ok: false, status: 401, reason: 'gateway_timestamp_invalid' };
  const expected = Buffer.from(signGatewayBody(secret, timestamp, raw || Buffer.alloc(0)));
  const given = Buffer.from(String(signature || ''));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, status: 401, reason: 'gateway_signature_invalid' };
  return { ok: true };
}
