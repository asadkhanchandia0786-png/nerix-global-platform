// Credit / activation lock for self-registered workspaces.
// A locked workspace can use the dashboard, CRM and FAQ chat, but cannot spend OpenAI or VoIP credit:
// AI receptionist settings, AI agents, phone-number assignment, campaigns, outbound simulations,
// live inbound calls and AI chat replies stay read-only until Nerix activates the workspace
// or the wallet holds real funds. 'suspended' is a hard lock set by the owner; funding does not lift it.
import type { Query } from './db.ts';
import { need } from './core.ts';
export const LOCK_MESSAGE = 'This workspace is awaiting activation. The AI receptionist, phone numbers and outbound calling unlock once Nerix activates your workspace or your wallet is funded.';
export const SUSPENDED_MESSAGE = 'This workspace has been locked by Nerix. Please contact support to restore AI receptionist, phone and outbound features.';
export interface Lock { locked: boolean; status: 'locked' | 'active' | 'suspended'; reason: string | null }
export async function orgLock(q: Query, orgId: string): Promise<Lock> {
  const r = (await q.query('SELECT o.activation_status,o.billing_mode,COALESCE(w.paid,0)+COALESCE(w.bonus,0) AS funds FROM organizations o LEFT JOIN wallets w ON w.org_id=o.id WHERE o.id=$1', [orgId])).rows[0];
  if (!r) return { locked: false, status: 'active', reason: null };
  const status = r.activation_status as Lock['status'];
  if (r.billing_mode === 'internal' || status === 'active') return { locked: false, status, reason: null };
  if (status === 'suspended') return { locked: true, status, reason: SUSPENDED_MESSAGE };
  if (Number(r.funds) > 0) return { locked: false, status, reason: null };   // funded wallet lifts an ordinary sign-up lock
  return { locked: true, status, reason: LOCK_MESSAGE };
}
export async function requireUnlocked(q: Query, orgId: string) { const l = await orgLock(q, orgId); need(!l.locked, 402, l.reason || LOCK_MESSAGE); }
