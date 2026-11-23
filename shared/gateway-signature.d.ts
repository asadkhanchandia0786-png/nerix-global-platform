export function signGatewayBody(secret: string, timestamp: string | number, raw: Buffer | string): string;
export function verifyGatewayRequest(input: { secret: string; timestamp?: string; signature?: string; raw?: Buffer | string; now?: number }):
  { ok: true } | { ok: false; status: number; reason: string };
