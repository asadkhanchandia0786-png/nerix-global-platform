import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import type { DB, Query, Row } from './db.ts';
import { AppError, audit, id, need } from './core.ts';
import {serviceProfile} from './services.ts';
const scrypt = promisify(scryptCallback);
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const equal = (a: string, b: string) => {const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
export async function hashPassword(password: string) {
  need(password.length >= 12 && password.length <= 128, 400, 'Use a password between 12 and 128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64) as Buffer).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (password.length > 128) return false;
  const [salt, key] = encoded.split(':');
  const derived = (await scrypt(password, salt || 'missing-user', 64) as Buffer).toString('hex');
  return !!key && equal(derived, key);
}
export type Action = 'overview' | 'leads' | 'calls' | 'campaigns' | 'pause' | 'agents' | 'wallet' | 'billing' | 'team' | 'settings' | 'tasks' | 'tickets' | 'audit';
export interface Access { user: Row; orgId: string; role: string; companyId: string | null; locationId: string | null; internal: boolean; write: boolean }
const allowed: Record<string, Action[]> = {
  owner: ['overview','leads','calls','campaigns','pause','agents','wallet','billing','team','settings','tasks','tickets','audit'],
  manager: ['overview','leads','calls','campaigns','pause','agents','wallet','tasks','tickets'],
  staff: ['overview','leads','calls','tasks','tickets'], viewer: ['overview','leads','calls','wallet','tasks','tickets'],
  operations: ['overview','campaigns','pause','tasks','tickets'], support: ['overview','tickets'], closer: ['overview','tasks','tickets'], partner: []
};
export function scopeSQL(a: Access, params: any[], alias = '') {
  let sql = '';
  if (a.companyId) { params.push(a.companyId); sql += ` AND ${alias}company_id=$${params.length}`; }
  if (a.locationId) { params.push(a.locationId); sql += ` AND ${alias}location_id=$${params.length}`; }
  return sql;
}
export async function validScope(q: Query, org: string, company: string | null, location: string | null) {
  if (company) need((await q.query('SELECT id FROM companies WHERE id=$1 AND org_id=$2', [company, org])).rows.length, 400, 'Invalid company.');
  if (location) need(company && (await q.query('SELECT id FROM locations WHERE id=$1 AND org_id=$2 AND company_id=$3', [location, org, company])).rows.length, 400, 'Location must belong to the selected company.');
}
export function checkScope(a: Access, company: string, location: string) {
  need((!a.companyId || a.companyId === company) && (!a.locationId || a.locationId === location), 403, 'Outside your assigned scope.');
}
export class Auth {
  constructor(public db: DB, public secure: boolean) {}
  cookie(req: Request) { return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('nerix_session='))?.slice(14) || ''; }
  csrf(req: Request) { return hash(`nerix-csrf:${this.cookie(req)}`); }
  async user(req: Request) {
    const user = (await this.db.query('SELECT u.id,u.email,u.name,u.platform_role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true', [hash(this.cookie(req))])).rows[0];
    need(user, 401, 'Please sign in.'); return user;
  }
  async login(res: Response, userId: string) {
    const token = randomToken();
    await this.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')", [hash(token), userId]);
    res.cookie('nerix_session', token, { httpOnly: true, sameSite: 'strict', secure: this.secure, path: '/', maxAge: 12*60*60*1000 });
  }
  async limit(key: string) {
    const row = (await this.db.query("INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING count", [hash(key)])).rows[0];
    need(row.count <= 20, 429, 'Too many attempts. Please try again in 15 minutes.');
  }
  async owner(req: Request) { const u = await this.user(req); need(u.platform_role === 'owner', 403, 'Only the Nerix owner can do this.'); return u; }
  async access(req: Request, orgId: string, action: Action, write = false): Promise<Access> {
    const user = await this.user(req);
    const m = (await this.db.query('SELECT * FROM memberships WHERE org_id=$1 AND user_id=$2 AND active=true', [orgId, user.id])).rows[0];
    let role = m?.role, internal = false;
    if (user.platform_role === 'owner') { role = 'owner'; internal = true; }
    else if (!m && user.platform_role && (await this.db.query('SELECT 1 FROM support_assignments WHERE org_id=$1 AND user_id=$2', [orgId, user.id])).rows.length) { role = user.platform_role; internal = true; }
    need(role && allowed[role]?.includes(action), 403, 'You do not have access to this workspace or action.');
    if(['leads','calls','campaigns','pause','agents','wallet','billing','tasks'].includes(action)) need((await serviceProfile(this.db,user,orgId,m)).voice,403,'Voice service access is not enabled for your account.');
    if (write) {
      if (role === 'viewer') throw new AppError(403, 'This is a read-only role.');
      if (internal && role !== 'owner') need(action === 'tickets' || action === 'tasks' || (action === 'pause' && role === 'operations'), 403, 'This action needs the workspace owner.');
    }
    if (internal) await audit(this.db, user.id, orgId, 'support.access', { action, write });
    return { user, orgId, role, companyId: internal ? null : m.company_id, locationId: internal ? null : m.location_id, internal, write };
  }
}
