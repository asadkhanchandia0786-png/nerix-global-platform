# Version 0.5.0 — self-serve sign-up, email verification, activation lock, owner account tools

## What customers see
- **https://app.nerixglobal.com/?signup=1** opens the sign-in screen on the **Create an account** tab. The tabs are: *Sign in · Create an account · Have an invitation?*
- The form asks for full name, company/business name, work email and a password (12+ characters).
- A 6-digit code is emailed through Resend (valid 15 minutes, 5 wrong tries, resend at most once a minute).
- The person is signed in only after the code is entered. Until then they cannot use the dashboard, even with the correct password; trying to sign in simply asks for the code again.
- Each sign-up gets its **own isolated workspace** (one company, one location, empty wallet, no demo credit, no sample leads).

## The credit lock
New self sign-ups start **locked**. A locked workspace can use the dashboard, CRM / software modules, team, tasks and the FAQ-only website chat, but these are **read-only or refused**:

| Feature | When locked |
|---|---|
| AI receptionist settings | read-only (save refused) |
| AI agents page | read-only |
| Phone number assignment | refused (and already owner-only) |
| Campaigns, outbound simulations | refused |
| Live inbound calls through the gateway | answered with `activation_required` before any credit is reserved |
| Website chat | prepared FAQ replies only, never OpenAI |

A workspace unlocks when **either** you press **Activate** (Nerix administration → Accounts), **or** its wallet holds real money (a verified payment you record, or promotional credit you add). **Lock** in the admin screen is a *hard lock* (`suspended`): funds do not lift it. Workspaces you create yourself, internal companies, and every workspace that existed before this release stay **active**.

## Owner tools (Nerix administration → Accounts tab)
- **Create account**: name, business, email, industry, optional password (or email them a set-password link valid 48 h), and an *activate now* switch. Accounts you create are marked email-verified.
- **Edit**: name, email, business name, enabled, email-verified. Changing the email, disabling, or un-verifying signs the person out.
- **Password**: set one directly, or email a link (the link is shown to you if email is not configured).
- **Activate / Lock**, and **Resend code** for unverified people.
- Every action is written to the audit log.

## Security notes
- Codes are stored hashed, expire, and die after 5 wrong attempts. Sign-up: 5 per IP per hour, 3 per email per hour. Code entry: 30 per IP and 10 per email per 15 minutes. Resend: 10 per IP, 5 per email per hour.
- Sign-up answers are identical whether or not the address already exists.
- Pre-registration protection: if someone signs up with an address and password only they know, a registration from the real owner more than 10 minutes later replaces the unverified details, so the mailbox owner ends up with their own password. A verified account is never changed by sign-up.
- A password-reset link also proves the mailbox, so someone who lost the code can use "Forgot your password?".
- Sessions require a verified email, in addition to the sign-in checks.
- Sign-up needs Resend configured (`RESEND_API_KEY`, `EMAIL_FROM`). Without it the form says sign-up is unavailable instead of creating accounts nobody can verify.

## Database
One new migration, `database/007-self-signup.sql`; migrations 001–006 are unchanged. It adds `users.email_verified_at` (existing users are marked verified), `users.self_registered`, `organizations.activation_status` / `activation_note` / `activated_at` / `self_registered` (existing workspaces are `active`), and the `email_verifications` table. It applies automatically at startup. Backups made by 0.5.0 include the new columns; `email_verifications` is not backed up, like `password_resets`.

## Deploying to Oracle
```
git pull
npm ci          # only if package-lock.json changed; this release adds no packages
npm run build
sudo systemctl restart nerix-portal   # use the service name from docs/DEPLOY-ORACLE.md
```
No new environment variables. The restart runs migration 007. Check `curl https://app.nerixglobal.com/api/health` shows `"version":"0.5.0"`.

## Not changed
Pricing, rates, models, pilot-mode safeguards, existing UI and the gateway contract are unchanged. The older "Create a separate demo workspace" link still exists in demo mode only.
