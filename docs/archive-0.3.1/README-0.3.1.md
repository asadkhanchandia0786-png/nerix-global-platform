# Nerix Global workspace · 0.2.5

Portable React/TypeScript + Node/Express + PostgreSQL application. **Start with [START-HERE.md](START-HERE.md).**

For your existing 0.2.3 or 0.2.4 Replit project, apply the changed-files-only **Nerix-Global-App-0.2.5-Update.zip** using [the service wording and SEO guide](docs/SERVICE-WORDING-SEO.md). It includes the forty-topic FAQ expansion and uses “Voice service starting rates” in public help. The protected-preview fix and Dentive internal account are retained. No new database migration is required.

This implements the roadmap’s first practical milestone: authenticated customer workspaces, lead/campaign operations and precise wallet accounting with simulated calls. It also supplies administrative, support, referral and payment-review workflows plus a real website-chat inbox. Text AI uses the implemented OpenAI Responses adapter when enabled; real carrier/audio/card integrations remain separate. It is not the finished live telephone/payment service. Integration statuses are explicit; no credentials, live calls, card charging or external bookings are fabricated.

## Run

```bash
npm ci
npm run dev
```

Use current Node.js 22.12.0+ or Node.js 24.0+. `.replit` exposes port 3000 and sets the one-proxy configuration. The production frontend build is included for convenience and can be reproduced with `npm run build`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Node API with Vite frontend middleware; one server |
| `npm run build` | Build frontend assets into `dist/` |
| `npm start` | Serve the API and built `dist/` assets |
| `npm run check` | TypeScript check |
| `npm test` | Actual database/API tests and DOM workflow tests |
| `npm run verify` | Typecheck, tests and frontend build |
| `npm run db:migrate` | Apply versioned SQL migration; startup also runs it |
| `npm run backup` | Consistent private database backup |
| `npm run restore -- path.json` | Restore into a new empty database with explicit confirmation |
| `npm run owner:reset-password` | Owner recovery from trusted server access |

Run commands from the directory containing `package.json`. Do not run two processes against the embedded database. Stop the app before backup/migration/recovery commands when using that database.

## Configuration

Keep secrets in Replit Secrets or a local `.env`, never in source files or the customer UI.

| Variable | Behavior |
| --- | --- |
| `APP_MODE=demo` | Default for local development. New workspaces get test funds and fictional sample leads. Public demo signup is available only after initial owner setup. |
| `APP_MODE=pilot` | Default when NODE_ENV=production; set explicitly in deployment settings. Requires external PostgreSQL. New workspaces have zero balance and no demo leads. Public signup is disabled; use owner-created workspaces and invitations. Live integrations remain unavailable. |
| `DATABASE_URL` | Dedicated PostgreSQL/Neon connection string. Without it, demo uses `data/postgres/`. Use the provider’s TLS connection string; certificate verification is not disabled by this app. |
| `APP_ORIGIN` | Exact public HTTPS origin without a trailing slash. Required for production. Controls mutation-origin validation and secure cookies. |
| `SETUP_TOKEN` | Random secret of at least 24 characters, used only for first owner creation. A private local key is generated for development if omitted. |
| `TRUST_PROXY=1` | Use only behind exactly one trusted reverse proxy. Included Replit configuration sets it. |
| `PORT` | Defaults to `3000`. |
| `NODE_ENV=production` | Startup requires external PostgreSQL, HTTPS `APP_ORIGIN` and `SETUP_TOKEN`. Use `npm start` with built assets. |

Use a **new, separate database** for the pilot. Changing `APP_MODE` does not turn existing demo workspaces into paid ones. Do not reuse Dentive/Sarah’s database, keys or customer wallets.

This server runs Node and persistent background reconciliation. It is not a static Cloudflare Pages upload and cannot be deployed as a Worker without a separately engineered port. A later `app.nerixglobal.com` domain setup should route to the chosen API/frontend hosting; the marketing website is separate.

The included deployment command explicitly sets NODE_ENV=production and Replit's proxy setting. It refuses startup without the required persistent database, HTTPS APP_ORIGIN and setup token. The commands are configuration, not evidence of publication. Review the selected hosting plan and PostgreSQL backup options before deploying. Development host access is limited to localhost/IP addresses plus the configured APP_ORIGIN and REPLIT_DEV_DOMAIN hosts.

## Structure

| Directory | Content |
| --- | --- |
| `client/` | Responsive dashboard, forms, CSV/XLSX worker, owner and customer views |
| `server/app.ts` | Validated, authenticated API routes and role enforcement |
| `server/auth.ts` | Server sessions, scrypt password hashing, invitation checks, scoped access |
| `server/wallet.ts` | Atomic reservations, exact simulation billing, recovery |
| `server/payments.ts` | Test quotes, verified manual receipts, refund allocation/reconciliation |
| `server/chat.ts` | Public token-based chat, scoped staff inbox, presence/capacity, claims, follow-ups and OpenAI text adapter |
| `public/chat-widget.js` | Website widget with AI/help messages, reason-first handoff and honest offline fallback |
| `server/leads.ts` | Mapping, validation, suppression, timezone eligibility |
| `server/agents.ts` | Separate Alex and Sarah instructions |
| `server/sarah-style.ts` | Style and privacy text reused from the supplied Sarah 0.6.16 project |
| `database/` | Transactional, versioned SQL schema |
| `tests/` | Security, billing, workflow and persistence checks |
| `docs/` | Original roadmap, release status, live activation plan |

## Website chat

Read [docs/CHAT-SETUP.md](docs/CHAT-SETUP.md) for the two-ZIP setup. Only the server receives `OPENAI_API_KEY`. `CHAT_AI_ENABLED=true` opts into API use; `CHAT_MODEL` defaults to `gpt-4.1-mini`; `CHAT_AI_DAILY_LIMIT` defaults to 200 requests per UTC day across all sites. Each conversation has at most 40 completed AI replies, 200 visitor messages and a seven-day visitor token. Output is bounded to 350 tokens, history to 18 messages, and failed or over-budget requests use labeled FAQ help. Stored usage includes responses discarded after a human joins. This is an operational limit, not a fixed dollar spend cap; also configure your OpenAI project budget/alerts.

Widget requests use site-specific origin allowlists, an opaque Bearer token and omitted cookies. Tokens are hashed on the server and kept only in browser tab session storage. Staff use the normal authenticated/CSRF-protected app. Public requests cannot select an organization, read inboxes, claim visitors or access another token's conversation. Origin checks do not authenticate non-browser clients; durable rate limits and request caps also apply.

Staff capacity is per chat site. The inbox sends a 25-second heartbeat, expires presence after 75 seconds and recovers unaccepted requests after two minutes. A person must click Join; two claims cannot succeed for one visitor. Automatic replies stop after a claim, including a reply already being generated. A stale/disconnected person returns the chat to follow-up. Five-second polling supplies messages; WebSockets, push notifications and agent availability across tabs/devices are later scale improvements.

Clients can receive separate branded sites with approved knowledge and company/location scope. Existing internal assignments and customer memberships determine access. Chat pricing is a separate commercial decision: this release does not debit client voice wallets for chat. No automatic email, SMS or phone callback is sent when a request is saved.

Migration 002 adds chat without replacing migration 001 or deleting existing accounts/wallets. Backups include chat history/contact requests, invalidate visitor tokens and active claims on restore, and retain v0.1.0/v0.2.0/v0.2.1 backup compatibility. Restore resets the message sequence so new messages can be saved after recovery. Presence and staff sessions are intentionally excluded. The staff inbox filters on the server and provides 50-row pages and full queue counts, including older open follow-ups.

## Owned internal companies

App 0.2.2 adds an owner-controlled `billing_mode` classification. Read [docs/INTERNAL-COMPANIES.md](docs/INTERNAL-COMPANIES.md) for the existing-project update and Dentive conversion. Internal companies have no Nerix deposit or usage fee; the server supplies a zero service rate, tracks activity, and rejects top-ups/recharge/credit adjustments. Provider costs are separate. Customer companies cannot grant themselves this exemption.

Only the platform owner can convert a demo workspace after confirming it is an owned business. Conversion is serialized with wallet/call operations, refuses active reservations or real payments, keeps accounts and operational data, and removes test credit with an audit/ledger record. New internal companies can also be created with zero balance and no sample leads. Old workspaces default to normal customer billing through migration 003. Backups preserve internal classification; older backups default safely to customer billing.

Live voice and carrier calling remain separate adapters. Internal companies can use zero-fee simulations while those integrations are built; normal authorization, suppression, retry and concurrency guards still apply.

## Authentication and permissions

This release adapts the supplied Sarah project’s password/session approach using Node’s scrypt and random, hashed, server-stored session tokens. The roadmap suggested Better Auth; it is **not installed** in this release. This keeps PostgreSQL and embedded preview behavior identical. Any migration to a full auth provider should preserve role boundaries and revoke old sessions deliberately.

Cookies are HttpOnly and SameSite Strict, secure when the HTTPS origin is configured. Mutation requests require a custom client header and session-bound CSRF token. Login/setup/acceptance attempts have durable throttles. Password changes and access changes revoke sessions. No password or provider secret is returned in customer API responses.

Open the Replit preview in a new tab before signing in. An embedded cross-site preview may block SameSite cookies.

Customer roles: owner, manager, staff, viewer; optional company/location scope. Owners have whole-workspace scope. Internal Nerix roles are separate: owner, operations, support, closer and partner. Operations/support/closers require explicit customer assignments; partners only see their own referrals. Owners cannot remove the last customer owner through normal team editing. Support access and protected administrative actions are audited.

MFA, email verification, automated password-reset email, fine-grained transcript/recording permissions, automatic retention/deletion and external security review are later rollout gates. No identity-document storage or recordings are enabled now.

## Billing invariants

- Store USD as integer **millionths of a dollar**. Never use a floating-point wallet balance. A call’s total charge rounds upward to the nearest millionth only once for that call.
- Default per-minute rates: outbound USD0.30, basic reception/support USD0.50, advanced support USD0.75. Customer overrides beat industry defaults, then platform defaults. New reservations snapshot the effective rate and full agent instructions.
- Reserve funds while holding the wallet row lock. Concurrent attempts cannot spend the same funds. This pilot permits one active simulation per organization and at most 30 minutes per simulation.
- Simulation billing starts at answer plus AI attachment and ends at AI exit. Ringing/no-answer has no AI charge. There is no live carrier leg or provider cost in these simulations.
- Reservations expire after five minutes if not completed and are reconciled every 15 seconds and on restart. No live-call watchdog is claimed by this implementation.
- Immutable ledger event keys prevent duplicated credits and charges. Funding lots record paid credit separately from promotional/test credit. Usage spends bonus first, then paid lots FIFO.
- Company/location monthly caps use UTC calendar months. They apply to new reservations; settings currently establish caps when the company/location is created.
- Normal first/later top-ups have a server-enforced USD100 minimum. Private smaller later approvals bind one organization, exact amount, currency and 48-hour expiry. They cannot bypass the initial deposit rule.
- Test FX rates are visibly illustrative and never used for live transactions. No live rate feed, provider quote or customer surcharge exists yet.
- Manual paid receipts require an owner-verified cleared transfer, unique provider/bank reference, original amount/currency and verification/FX evidence reference. Never treat a screenshot, browser redirect or a pending transfer as cleared funds.
- Refund requests reserve unused paid funds, pause service and disable recharge. Test/promotional balances cannot be refunded. Allocations use original payment currency and quote, not a new arbitrary FX rate. Minor-unit rounding is tracked across partial refunds. Requests smaller than an original-currency minor unit require staff reconciliation.
- Approving a refund does **not** send money. Record completion only after the approved original-method provider route confirms reimbursement. Nerix’s retained processing costs are not subtracted from the customer’s unused paid credit. Resolve the refund before resuming service.
- Recharge preferences are saved with an explicit disabled state. No tokens, saved-card charges or bank pulls are implemented.

## Lead and campaign behavior

CSV/XLSX are parsed in a browser worker, bounded to 5 MB, 100 columns and 1,000 rows per batch. Formula cells are omitted. The server validates every mapped record again and rejects the whole import if a row is invalid. The lead list displays up to 5,000 records; call history displays the latest 500. Server-side pagination is a later scale improvement.

Numbers normalize to E.164 using an explicit source country. Callback dates use an explicit format and recipient timezone; ambiguous or nonexistent daylight-saving times are rejected. Multiple named contacts, roles, previous caller and original notes are retained. Reimports append history, merge new contacts and preserve existing status/notes; they do not move a lead into another location or clear suppression.

The eligibility check enforces campaign readiness, authorization, recipient-local weekdays/hours, retry spacing, bounded attempts, follow-up timing and durable company-scoped suppression. Both primary and follow-up numbers are checked. “Not interested” ends the active sequence. An explicit callback outside the permitted window is shown as a conflict to review.

The scheduler in this release **evaluates** queues; it does not automatically dial them. Simulation time is explicitly selected by the operator. Meetings are staff requests, not confirmed calendar bookings. Live private warm-transfer behavior remains in the activation plan.

## Backup and recovery

1. With embedded preview storage, stop the app. With external PostgreSQL, the export uses a consistent repeatable-read transaction.
2. Run `npm run backup`.
3. Store the resulting JSON privately with encryption and access controls. It contains customer data and password hashes. Do not attach it to public tickets or source control.
4. To restore, use a **new empty** database/project, set its `DATABASE_URL`, then run:

```bash
RESTORE_CONFIRM=EMPTY_DATABASE npm run restore -- backups/your-backup.json
```

Restore refuses an existing database with accounts. Sessions are intentionally excluded. A restore test using the actual schema, balances and histories is included. For production, also enable and test the database provider’s managed backups; this helper is not a replacement for a recovery policy.

For owner password recovery, use trusted server access. Temporarily set `RESET_OWNER_EMAIL` and `RESET_OWNER_PASSWORD` in Secrets, stop the app if using embedded storage, run `npm run owner:reset-password`, then remove those temporary Secrets. All owner sessions are revoked.

## Validation and limitations

See `docs/BUILD-STATUS.md` for the release-specific test result and remaining work. DOM workflow tests exercise the real API and database without external providers. They are not a live browser/layout or Replit-hosted acceptance test. This build has not been published into the owner’s Replit account.

Current dependency guidance: [Replit configuration](https://docs.replit.com/features/project-setup/configuration), [PGlite](https://pglite.dev/docs/api), [SheetJS official installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). The lockfile pins the actual dependency versions, including SheetJS from its official distribution.
