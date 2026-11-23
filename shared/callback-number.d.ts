export function phoneCountry(number?: string | null): string | null;
export function inboundCallerNumber(value: unknown): string | null;
export function callbackNumber(input?: Record<string, any>, context?: { callerPhone?: string | null; defaultCountry?: string | null }):
  | { ok: true; callbackPhone: string; source: string; requiresConfirmation: boolean; instruction: string }
  | { ok: false; reason: string; instruction: string };
