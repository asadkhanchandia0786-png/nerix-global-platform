// Transactional email through Resend (HTTPS API; no extra package needed).
// Messages are queued in the same database transaction as the event that caused them,
// then sent after commit. There is no polling loop: a retry timer exists only while mail is pending.
import type { DB, Query } from './db.ts';
import { id } from './core.ts';
export interface EmailConfig { apiKey?: string; from?: string; appOrigin?: string }
let cfg: EmailConfig = {}, db: DB | undefined, timer: NodeJS.Timeout | undefined, running = false;
export const emailEnabled = () => !!cfg.apiKey && !!cfg.from;
export function startEmail(database: DB, config: EmailConfig) { db = database; cfg = config; schedule(3000); }
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
function schedule(ms: number) { if (timer || !db) return; timer = setTimeout(() => { timer = undefined; void flush(); }, Math.max(1000, Math.min(ms, 15 * 60 * 1000))); timer.unref?.(); }
export async function queueEmail(q: Query, m: { orgId?: string | null; kind: string; to: string; subject: string; text: string; html?: string }) {
  await q.query('INSERT INTO email_outbox(id,org_id,kind,to_email,subject,body_text,body_html) VALUES($1,$2,$3,$4,$5,$6,$7)', [id(), m.orgId ?? null, m.kind, m.to.trim().toLowerCase(), m.subject.slice(0, 200), m.text, m.html ?? '']);
  schedule(2000);   // runs after the surrounding transaction has had time to commit
}
async function fail(m: Record<string, any>, permanent: boolean, error: string) {
  const attempts = Number(m.attempts) + 1, final = permanent || attempts >= 5;
  await db!.query('UPDATE email_outbox SET attempts=$2,last_error=$3,status=$4,next_attempt_at=now()+($5||\' minutes\')::interval WHERE id=$1', [m.id, attempts, error.slice(0, 300), final ? 'failed' : 'pending', String(attempts * 5)]);
}
export async function flush() {
  if (!db || running || !emailEnabled()) return;
  running = true;
  try {
    const rows = (await db.query("SELECT * FROM email_outbox WHERE status='pending' AND next_attempt_at<=now() ORDER BY created_at LIMIT 10")).rows;
    for (const m of rows) {
      try {
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.id },
          body: JSON.stringify({ from: cfg.from, to: [m.to_email], subject: m.subject, text: m.body_text, ...(m.body_html ? { html: m.body_html } : {}) }) });
        if (r.ok) await db.query("UPDATE email_outbox SET status='sent',sent_at=now(),attempts=attempts+1,body_text='',body_html='',last_error=NULL WHERE id=$1", [m.id]);   // message bodies can hold one-time links: do not keep them
        else await fail(m, r.status >= 400 && r.status < 500 && r.status !== 429, `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      } catch (e) { await fail(m, false, String(e)); }
    }
    const next = (await db.query("SELECT extract(epoch FROM (min(next_attempt_at)-now())) AS wait FROM email_outbox WHERE status='pending'")).rows[0];
    if (next?.wait !== null && next?.wait !== undefined) schedule(Math.max(5, Number(next.wait)) * 1000);
  } catch { console.error('Email delivery check failed; it will be retried.'); schedule(60000); }
  finally { running = false; }
}
export async function purgeEmail(q: Query) { await q.query("DELETE FROM email_outbox WHERE created_at<now()-interval '14 days'"); }

// ---------- message templates ----------
const wrap = (title: string, bodyHtml: string) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#14213d"><h2 style="margin:0 0 12px">${esc(title)}</h2>${bodyHtml}<p style="color:#6b7280;font-size:12px;margin-top:28px">Nerix Global · you are receiving this because of activity on your Nerix workspace.</p></div>`;
const button = (href: string, label: string) => `<p><a href="${esc(href)}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(label)}</a></p><p style="font-size:12px;color:#6b7280">If the button does not work, copy this link:<br>${esc(href)}</p>`;
export const inviteEmail = (link: string, workspace: string, role: string) => ({ subject: `You are invited to ${workspace} on Nerix`,
  text: `You have been invited to join ${workspace} as ${role}.\n\nAccept the invitation (valid for 48 hours):\n${link}\n`, html: wrap('You are invited', `<p>You have been invited to join <strong>${esc(workspace)}</strong> as <strong>${esc(role)}</strong>. The invitation is valid for 48 hours.</p>${button(link, 'Accept invitation')}`) });
export const resetEmail = (link: string) => ({ subject: 'Reset your Nerix password',
  text: `Use this link to choose a new password (valid for 1 hour). If you did not ask for it, you can ignore this message.\n${link}\n`, html: wrap('Reset your password', `<p>Use the button to choose a new password. The link is valid for 1 hour. If you did not ask for it, ignore this message.</p>${button(link, 'Choose a new password')}`) });
export const callbackEmail = (i: { business: string; location: string; callerName: string; phone: string; reason: string; callerType: string; company?: string | null; recipient?: string | null; link: string }) => ({
  subject: `New callback request: ${i.callerName}`,
  text: `${i.business} · ${i.location}\n\nCaller: ${i.callerName}${i.company ? ' (' + i.company + ')' : ''}\nPhone: ${i.phone}\nReason: ${i.reason}\n${i.recipient ? 'Asked for: ' + i.recipient + '\n' : ''}\nOpen the dashboard: ${i.link}\n`,
  html: wrap('New callback request', `<p style="color:#6b7280;margin:0 0 10px">${esc(i.business)} · ${esc(i.location)}</p><table cellpadding="6" style="font-size:14px"><tr><td><b>Caller</b></td><td>${esc(i.callerName)}${i.company ? ' (' + esc(i.company) + ')' : ''}</td></tr><tr><td><b>Phone</b></td><td>${esc(i.phone)}</td></tr><tr><td><b>Reason</b></td><td>${esc(i.reason)}</td></tr>${i.recipient ? `<tr><td><b>Asked for</b></td><td>${esc(i.recipient)}</td></tr>` : ''}</table>${button(i.link, 'Open callbacks')}`) });

export const verificationEmail = (code: string, name: string, minutes: number) => ({ subject: `${code} is your Nerix verification code`,
  text: `Hi ${name},\n\nYour Nerix Global verification code is ${code}.\nIt is valid for ${minutes} minutes. If you did not create an account, you can ignore this message.\n`,
  html: wrap('Verify your email', `<p>Hi ${esc(name)}, enter this code to finish creating your Nerix Global account. It is valid for ${minutes} minutes.</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:18px 0">${esc(code)}</p><p style="font-size:12px;color:#6b7280">If you did not create an account, you can ignore this message.</p>`) });
export const accountCreatedEmail = (link: string, name: string, business: string) => ({ subject: 'Your Nerix Global account',
  text: `Hi ${name},\n\n${business ? `A Nerix Global account has been created for ${business}.\n` : ''}Choose your password here (valid for 48 hours):\n${link}\n`,
  html: wrap(business ? 'Your account is ready' : 'Choose a new password', `<p>Hi ${esc(name)},</p><p>${business ? `A Nerix Global account has been created for <strong>${esc(business)}</strong>. ` : ''}Use the button to choose your password. The link is valid for 48 hours.</p>${button(link, 'Choose my password')}`) });
