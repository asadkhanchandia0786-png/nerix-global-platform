// Self-serve business sign-up with email verification (6-digit code via Resend),
// plus owner-only tools to create and edit customer accounts manually.
import { randomInt } from 'node:crypto';
import type { Express, Request } from 'express';
import { z } from 'zod';
import type { DB, Query, Row } from './db.ts';
import { Auth, hash, hashPassword, randomToken, equal } from './auth.ts';
import { audit, createOrg, email, id, need, text, uuid } from './core.ts';
import { queueEmail, emailEnabled, verificationEmail, accountCreatedEmail } from './email.ts';
import { orgLock } from './activation.ts';

const CODE_MINUTES = 15, MAX_ATTEMPTS = 5, RESEND_SECONDS = 60, STALE_MS = 10 * 60 * 1000;
const codeHash = (userId: string, code: string) => hash(`nerix-verify:${userId}:${code}`);
const password = z.string().min(12).max(128);

// Per-key limiter with its own ceiling and window (the shared Auth.limit allows 20 per 15 minutes).
export async function limit(q: Query, key: string, max: number, minutes: number) {
  const r = (await q.query(`INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+($2||' minutes')::interval) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+($2||' minutes')::interval ELSE rate_limits.expires_at END RETURNING count`, [hash(key), String(minutes)])).rows[0];
  need(r.count <= max, 429, 'Too many attempts. Please wait a while and try again.');
}

// Creates a fresh code (replacing any earlier one) and queues the email in the same transaction.
export async function issueCode(q: Query, userId: string, to: string, name: string) {
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await q.query(`INSERT INTO email_verifications(user_id,code_hash,expires_at,attempts,sent_at) VALUES($1,$2,now()+($3||' minutes')::interval,0,now())
    ON CONFLICT(user_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=0,sent_at=now()`, [userId, codeHash(userId, code), String(CODE_MINUTES)]);
  await queueEmail(q, { kind: 'email_verification', to, ...verificationEmail(code, name, CODE_MINUTES) });
}

// Sends a fresh code unless one went out in the last minute. Used by login and "resend".
export async function sendCodeIfDue(q: Query, u: Row) {
  const v = (await q.query('SELECT sent_at FROM email_verifications WHERE user_id=$1', [u.id])).rows[0];
  if (v && Date.now() - new Date(v.sent_at).getTime() < RESEND_SECONDS * 1000) return false;
  await issueCode(q, u.id, u.email, u.name); return true;
}

export function registerSignup(app: Express, db: DB, auth: Auth, opts: { origin?: string }) {
  const base = (req: Request) => opts.origin || `${req.protocol}://${req.get('host')}`;
  const sameAnswer = { ok: true, verify: true };

  app.post('/api/auth/register', async (req, res) => {
    await limit(db, `register-ip:${req.ip}`, 5, 60);
    const b = z.object({ name: text(200), business: text(120), email, password }).parse(req.body);
    await limit(db, `register-email:${b.email}`, 3, 60);
    need(emailEnabled(), 503, 'Email is not configured yet, so sign-up is unavailable. Please contact Nerix.');
    const hashed = await hashPassword(b.password);
    await db.transaction(async q => {
      const existing = (await q.query('SELECT id,name,email,email_verified_at,active,self_registered FROM users WHERE email=$1 FOR UPDATE', [b.email])).rows[0];
      if (existing) {
        // Same answer for every address; nothing about a verified account is ever touched.
        if (!existing.active || existing.email_verified_at) return;
        const v = (await q.query('SELECT created_at FROM email_verifications WHERE user_id=$1', [existing.id])).rows[0];
        const stale = !v || Date.now() - new Date(v.created_at).getTime() > STALE_MS;
        if (existing.self_registered && stale) {
          // Pre-registration protection: someone may have signed up with this address and a password only they know.
          // Whoever is registering now, an hour later, replaces the unverified details; the mailbox owner then verifies *their* account.
          const org = (await q.query('SELECT o.id,o.name FROM organizations o JOIN memberships m ON m.org_id=o.id AND m.role=\'owner\' WHERE m.user_id=$1 AND o.self_registered=true LIMIT 1', [existing.id])).rows[0];
          await q.query('UPDATE users SET name=$2,password_hash=$3 WHERE id=$1', [existing.id, b.name, hashed]);
          await q.query('DELETE FROM sessions WHERE user_id=$1', [existing.id]);
          if (org) { await q.query('UPDATE organizations SET name=$2 WHERE id=$1', [org.id, b.business]); await q.query('UPDATE companies SET name=$3 WHERE org_id=$1 AND name=$2', [org.id, org.name, b.business]); }
          await issueCode(q, existing.id, b.email, b.name);
          await q.query('UPDATE email_verifications SET created_at=now() WHERE user_id=$1', [existing.id]);
          await audit(q, existing.id, org?.id ?? null, 'signup.re_registered');
        } else await sendCodeIfDue(q, existing);   // a recent registration is never overwritten: just (re)send the code, at most once a minute
        return;
      }
      need((await q.query("SELECT 1 FROM users WHERE platform_role='owner' LIMIT 1")).rows.length, 409, 'Sign-up is not open yet.');
      const userId = id();
      await q.query('INSERT INTO users(id,email,name,password_hash,email_verified_at,self_registered) VALUES($1,$2,$3,$4,NULL,true)', [userId, b.email, b.name, hashed]);
      const org = await createOrg(q, b.business, 'general', userId, false);
      await q.query("UPDATE organizations SET activation_status='locked',self_registered=true WHERE id=$1", [org.id]);
      await audit(q, userId, org.id, 'signup.registered', { business: b.business });
      await issueCode(q, userId, b.email, b.name);
    });
    res.json(sameAnswer);
  });

  app.post('/api/auth/verify-email', async (req, res) => {
    await limit(db, `verify-ip:${req.ip}`, 30, 15);
    const b = z.object({ email, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.') }).parse(req.body);
    await limit(db, `verify-email:${b.email}`, 10, 15);
    const outcome = await db.transaction(async q => {
      const u = (await q.query('SELECT id,active,email_verified_at FROM users WHERE email=$1 FOR UPDATE', [b.email])).rows[0];
      const v = u && (await q.query('SELECT * FROM email_verifications WHERE user_id=$1 FOR UPDATE', [u.id])).rows[0];
      if (!u || !u.active || u.email_verified_at || !v || new Date(v.expires_at) <= new Date() || Number(v.attempts) >= MAX_ATTEMPTS) return { userId: null as string | null };
      if (!equal(codeHash(u.id, b.code), v.code_hash)) {
        await q.query('UPDATE email_verifications SET attempts=attempts+1 WHERE user_id=$1', [u.id]);   // committed, because we return instead of throwing
        return { userId: null as string | null };
      }
      await q.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [u.id]);
      await q.query('DELETE FROM email_verifications WHERE user_id=$1', [u.id]);
      await audit(q, u.id, null, 'signup.email_verified');
      return { userId: u.id as string };
    });
    need(outcome.userId, 400, 'That code is wrong or has expired. Request a new one.');
    await auth.login(res, outcome.userId);
    res.json({ ok: true });
  });

  app.post('/api/auth/resend-code', async (req, res) => {
    await limit(db, `resend-ip:${req.ip}`, 10, 60);
    const b = z.object({ email }).parse(req.body);
    await limit(db, `resend-email:${b.email}`, 5, 60);
    need(emailEnabled(), 503, 'Email is not configured yet. Please contact Nerix.');
    await db.transaction(async q => {
      const u = (await q.query('SELECT id,name,active,email_verified_at FROM users WHERE email=$1 FOR UPDATE', [b.email])).rows[0];
      if (!u || !u.active || u.email_verified_at) return;
      await sendCodeIfDue(q, { id: u.id, email: b.email, name: u.name });   // cool-down: rapid repeats are silently ignored
    });
    res.json(sameAnswer);   // identical answer whether or not the address exists
  });

  // ---------------- owner-only account management ----------------
  const accountRows = async () => (await db.query(`SELECT u.id AS user_id,u.name,u.email,u.active,u.email_verified_at,u.self_registered,u.created_at,
      o.id AS org_id,o.name AS business,o.industry,o.is_demo,o.paused,o.activation_status,o.activation_note,o.activated_at,
      COALESCE(w.paid,0) AS paid,COALESCE(w.bonus,0) AS bonus
    FROM users u JOIN memberships m ON m.user_id=u.id AND m.role='owner' AND m.active=true JOIN organizations o ON o.id=m.org_id AND o.billing_mode='customer'
    LEFT JOIN wallets w ON w.org_id=o.id WHERE u.platform_role IS NULL ORDER BY u.created_at DESC LIMIT 500`)).rows;
  const resetLink = async (q: Query, req: Request, userId: string, hours: number) => {
    const token = randomToken();
    await q.query('DELETE FROM password_resets WHERE user_id=$1 OR expires_at<now()', [userId]);
    await q.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3||' hours')::interval)", [hash(token), userId, String(hours)]);
    return `${base(req)}/#reset?token=${token}`;
  };

  app.get('/api/admin/accounts', async (req, res) => {
    await auth.owner(req);
    const rows = await accountRows();
    const out = [];
    for (const r of rows) { const l = await orgLock(db, r.org_id); out.push({ ...r, locked: l.locked }); }
    res.json({ accounts: out, emailEnabled: emailEnabled() });
  });

  app.post('/api/admin/accounts', async (req, res) => {
    const owner = await auth.owner(req);
    const b = z.object({ name: text(200), business: text(120), email, industry: text(40).default('general'),
      password: password.optional(), activate: z.boolean().default(false), sendEmail: z.boolean().default(true) }).parse(req.body);
    let link: string | null = null;
    const out = await db.transaction(async q => {
      need(!(await q.query('SELECT 1 FROM users WHERE email=$1', [b.email])).rows.length, 409, 'An account with this email already exists.');
      const userId = id(), pw = await hashPassword(b.password ?? randomToken());
      await q.query('INSERT INTO users(id,email,name,password_hash,email_verified_at,self_registered) VALUES($1,$2,$3,$4,now(),false)', [userId, b.email, b.name, pw]);
      const org = await createOrg(q, b.business, b.industry, userId, false);
      await q.query("UPDATE organizations SET activation_status=$2,activated_at=CASE WHEN $2='active' THEN now() ELSE NULL END,activation_note='Created by Nerix administrator' WHERE id=$1", [org.id, b.activate ? 'active' : 'locked']);
      if (!b.password) { link = await resetLink(q, req, userId, 48); if (b.sendEmail && emailEnabled()) await queueEmail(q, { orgId: org.id, kind: 'account_created', to: b.email, ...accountCreatedEmail(link, b.name, b.business) }); }
      await audit(q, owner.id, org.id, 'admin.account_created', { email: b.email, activated: b.activate });
      return { userId, orgId: org.id };
    });
    res.json({ ...out, setPasswordLink: link && !(b.sendEmail && emailEnabled()) ? link : null });
  });

  app.patch('/api/admin/accounts/:user', async (req, res) => {
    const owner = await auth.owner(req), uid = uuid.parse(req.params.user);
    const b = z.object({ name: text(200).optional(), email: email.optional(), business: text(120).optional(), active: z.boolean().optional(), emailVerified: z.boolean().optional() }).parse(req.body);
    await db.transaction(async q => {
      const u = (await q.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [uid])).rows[0];
      need(u && !u.platform_role, 404, 'Customer account not found.');
      const org = (await q.query("SELECT o.id,o.name FROM organizations o JOIN memberships m ON m.org_id=o.id AND m.user_id=$1 AND m.role='owner' AND m.active=true WHERE o.billing_mode='customer' ORDER BY o.created_at LIMIT 1", [uid])).rows[0];
      if (b.email && b.email !== u.email) need(!(await q.query('SELECT 1 FROM users WHERE email=$1 AND id<>$2', [b.email, uid])).rows.length, 409, 'Another account already uses that email.');
      await q.query('UPDATE users SET name=COALESCE($2,name),email=COALESCE($3,email),active=COALESCE($4,active) WHERE id=$1', [uid, b.name ?? null, b.email ?? null, b.active ?? null]);
      if (b.emailVerified === true) { await q.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1', [uid]); await q.query('DELETE FROM email_verifications WHERE user_id=$1', [uid]); }
      if (b.emailVerified === false) await q.query('UPDATE users SET email_verified_at=NULL WHERE id=$1', [uid]);
      if (b.business && org && b.business !== org.name) { await q.query('UPDATE organizations SET name=$2 WHERE id=$1', [org.id, b.business]); await q.query('UPDATE companies SET name=$3 WHERE org_id=$1 AND name=$2', [org.id, org.name, b.business]); }
      if ((b.email && b.email !== u.email) || b.active === false || b.emailVerified === false) await q.query('DELETE FROM sessions WHERE user_id=$1', [uid]);
      await audit(q, owner.id, org?.id ?? null, 'admin.account_edited', { uid, ...b });
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/accounts/:user/password', async (req, res) => {
    const owner = await auth.owner(req), uid = uuid.parse(req.params.user);
    const b = z.object({ password: password.optional() }).parse(req.body ?? {});
    let link: string | null = null, sent = false;
    await db.transaction(async q => {
      const u = (await q.query('SELECT id,email,name FROM users WHERE id=$1 AND platform_role IS NULL FOR UPDATE', [uid])).rows[0];
      need(u, 404, 'Customer account not found.');
      if (b.password) { await q.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(b.password), uid]); await q.query('DELETE FROM sessions WHERE user_id=$1', [uid]); }
      else { link = await resetLink(q, req, uid, 48); if (emailEnabled()) { await queueEmail(q, { kind: 'password_reset', to: u.email, ...accountCreatedEmail(link, u.name, '') }); sent = true; } }
      await audit(q, owner.id, null, 'admin.account_password', { uid, direct: !!b.password });
    });
    res.json({ ok: true, emailed: sent, setPasswordLink: sent ? null : link });
  });

  app.post('/api/admin/accounts/:user/resend-verification', async (req, res) => {
    const owner = await auth.owner(req), uid = uuid.parse(req.params.user);
    need(emailEnabled(), 503, 'Email is not configured.');
    await db.transaction(async q => {
      const u = (await q.query('SELECT id,email,name,email_verified_at FROM users WHERE id=$1 AND platform_role IS NULL FOR UPDATE', [uid])).rows[0];
      need(u && !u.email_verified_at, 400, 'This account is already verified.');
      await issueCode(q, u.id, u.email, u.name); await audit(q, owner.id, null, 'admin.verification_resent', { uid });
    });
    res.json({ ok: true });
  });

  app.post('/api/admin/org/:org/activation', async (req, res) => {
    const owner = await auth.owner(req), org = uuid.parse(req.params.org);
    const b = z.object({ status: z.enum(['active', 'locked', 'suspended']), note: z.string().trim().max(500).default('') }).parse(req.body);
    const r = await db.query("UPDATE organizations SET activation_status=$2,activation_note=$3,activated_at=CASE WHEN $2='active' THEN now() ELSE NULL END WHERE id=$1 AND billing_mode='customer' RETURNING id", [org, b.status, b.note]);
    need(r.rows.length, 404, 'Customer workspace not found.');
    await audit(db, owner.id, org, 'admin.activation_changed', b); res.json({ ok: true });
  });
}
