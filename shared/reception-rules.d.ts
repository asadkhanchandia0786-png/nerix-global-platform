export interface StaffTarget { id: string; name: string; role?: string; phone?: string | null; hasPhone?: boolean; defaultForRole?: boolean }
export const STAFF_ROLES: string[];
export const CALLER_TYPES: string[];
export function requestedStaffRole(value: unknown): string;
export function roleOnlyRequest(input?: { requestedName?: string; requestedRole?: string }): boolean;
export function staffRole(target: { role?: string; name: string }): string;
export function receptionFallback<T extends StaffTarget>(targets: T[]): T | null;
export function findTransferTarget(targets: StaffTarget[], requestedName?: string, requestedRole?: string): any;
export function transferIntake(input?: Record<string, any>, options?: { maxReason?: number }):
  | { ok: true; callerName: string; reason: string; callerType: string; companyName: string }
  | { ok: false; reason: string; missing: string[]; instruction: string };
export function callbackPolicy(attempts?: { status: string; caller_type?: string | null }[]): { afterFailure: boolean; callbackOnly: boolean };
export const CALLBACK_INSTRUCTIONS: string;
export const NAMED_TRANSFER_INSTRUCTIONS: string;
