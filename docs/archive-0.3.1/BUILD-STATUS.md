# Release status — 0.3.1, 13 October 2026

Monthly software pricing is now negotiated per company inside each organization. Each company has independent invoices, periods, trials and cancellation. Existing organization billing history and paid access are preserved. Voice/chat switches and wallet usage remain separate. See [BUSINESS-SOFTWARE.md](BUSINESS-SOFTWARE.md).

# Release status — 0.3.0, 13 October 2026

Business software is now an independent module in the existing app: configurable company modules, templates, records, task rules, record views, import/export, service permissions and manually verified monthly software billing. See [BUSINESS-SOFTWARE.md](BUSINESS-SOFTWARE.md) for scope and limitations. Voice and external integration status remains as recorded below.

# Release status — 0.2.5, 12 October 2026

**Ready for Replit installation and demonstration of the foundation milestone. Not a finished live calling/payment platform.** No external account, production website, DNS, bank, carrier or merchant configuration has been changed.

## Implemented

| Area | Included behavior |
| --- | --- |
| Identity and access | One-time secure owner setup, real sign-in/session/password changes, customer invitations, internal invitations, scoped roles, suspension/revocation, audit trail |
| Customer structure | Organizations → companies → locations; Nerix and Dentive demo workspaces; separate customer signups and visibility |
| Pricing | USD0.30 / USD0.50 / USD0.75 service defaults, editable industries, private customer overrides, call rate snapshots |
| Owned internal companies | Platform-owner conversion/new-company option; no Nerix fees/deposit/test balance; preserved company login/data, zero-fee simulation, customer exemption isolation and auditable demo-credit removal |
| Wallet | Durable paid/bonus/test separation, integer micro-USD ledger, atomic reservations, per-second charges, duplicate-event protection, expired reservation recovery |
| Leads | CSV/XLSX worker, mapping and server preview, explicit country/timezone/date format, multiple contacts, previous caller and notes, reimport history preservation, durable suppression |
| Campaigns | Lead generation/follow-up settings, local windows, authorization declaration, attempts/spacing, callback conflicts, pause, company/location caps, eligibility queue |
| Simulations | User-selected timing/outcome, answered-versus-ringing charge, one active call per organization, recorded timeline and agent/rate snapshots |
| Agent profiles | Separate Alex/Sarah tones, supplied Sarah conversation style and privacy rules, name/language/voice/preferred model/knowledge settings |
| Website chat | Fixed-logo widget, actual public/private APIs, token/origin isolation, OpenAI text adapter, labeled FAQ fallback, reason-first human requests, staffed inbox, availability/capacity, claim locking, suppressed late AI replies and durable follow-ups |
| Client chat sites | Separate public keys, approved knowledge, sales/support style, website origins and customer/company/location permissions; separately priced pilots |
| Payments | Seven-currency illustrative test quotes, USD100 minimum, one-time private later-deposit exceptions, owner-verified manual payment bookkeeping, test receipts |
| Refunds | Paid-credit checks, reservation and service pause, allocation to original funding currency, owner review/confirmed manual completion, ledger reconciliation |
| Recharge | Saved threshold/amount/currency/cap preferences; explicit disabled/pending-provider state |
| Operations | Staff follow-up/meeting requests, ticket replies/status, customer review, internal staff assignments, manual referral review and payout-reference bookkeeping |
| Recovery | SQL migration, durable embedded preview or external PostgreSQL, consistent backup and guarded empty-database restore, trusted owner password reset |
| Delivery | Source, lockfile, built frontend, Replit configuration, sample CSV/XLSX, setup guide and original roadmap |

## Not implemented or not externally validated

| Area | Remaining work |
| --- | --- |
| OpenAI text acceptance | The HTTP adapter and actual application flows are tested with a controlled provider; a live paid OpenAI response is not tested without the owner's key. Add Secrets and perform the documented smoke test. |
| Chat rollout | Hosted cross-domain/browser acceptance, production persistence, agent notifications, real traffic monitoring, retention/deletion policy and final client pricing/agreements |
| OpenAI audio | Live Realtime browser/telephone sessions, authorized AI tools, token-cost capture and voice acceptance tests |
| Telephone | Asterisk/controller deployment, carrier integration, actual calling, inbound routing, DTMF, live budget extensions and call watchdog |
| Warm transfer | Private briefing, explicit closer acceptance, actual bridge confirmation and AI detachment; presently design/instructions only |
| Calendar / CRM | External provider adapters and confirmed bookings; currently staff requests and connection preferences only |
| Safepay | Live hosted checkout, signature/status verification, webhook reconciliation, current FX quotes, provider refunds and saved-card charging; no secret flag enables these |
| Settlement | Automated PKR bank/processor settlement import, fees/tax reconciliation and production tax invoices |
| Referrals | Automated measured contribution, business-identity deduplication, dispute feeds, secure document verification and automatic payouts; policy thresholds remain proposals |
| Production | Owner browser acceptance on Replit, hosting/domain, managed database, email verification/reset/delivery, MFA, monitoring/alerts, retention/deletion and security review |
| Scale | Automatic durable dial jobs, multi-call live concurrency, server-side pagination, private file/recording storage and advanced support integrations |

The roadmap’s recommended architecture named Better Auth. This build uses the supplied Sarah-style scrypt/server-session approach with a shared PostgreSQL schema; the README documents this choice. It does not claim Better Auth is installed.

## Validation evidence

The release verification report is in `TEST-RESULTS.txt`. It records the actual TypeScript check, database/API and DOM workflow tests, frontend production build and dependency audit at packaging time.

The tests run against embedded PostgreSQL with real API routes. They exercise tenant/location isolation, CSRF, scoped and revoked access, exact billing, simultaneous reservations, idempotency, suppression/reimport, timezones/DST, minimum/private deposits, quote expiry, original-currency refund accounting, disabled recharge, referral rejection, backup restoration and persistence. UI tests use a DOM runtime with the actual API/database, including the visitor-widget-to-staff-inbox handoff. Additional tests cover competing staff claims, late AI replies, disconnected agents, expired visitor tokens, capacity, privacy boundaries, API failures/quotas and chat backup restoration.

A managed interactive browser was not available in this build environment, so **visual layout and Replit-hosted acceptance are not claimed**. No live provider credential or remote PostgreSQL service was used. No simulated outcome is evidence of actual AI, carrier, bank or customer behavior.

Follow `ACTIVATION-PLAN.md` for the next staged integrations. Commercial and provider approval gates in the original roadmap remain in force.

## 0.2.3 preview connection correction

The self-hosted test widget can retain a protected preview browser sign-in. External embeds still omit cookies. First-connection failures now display their reason. The change and same-project installation steps are in `CHAT-CONNECTION-FIX.md`; direct acceptance on the owner's Replit instance remains required.

## 0.2.4 customer FAQ catalog

Forty prepared public topics are shared by the API and bundled website helper, with a browsable menu, explicit pending-service limits and intentional FAQ labeling. Preset operation requires no OpenAI key or requests. Client scopes, preview access and human handoff guards are retained. Use `FAQ-UPDATE.md`; the Search Console findings and limits are in `SEARCH-CONSOLE-CHECK.md`.

## 0.2.5 public wording and website SEO review

Public FAQs and the website use service/setup language instead of the ambiguous pilot pricing label. The existing rates, USD100 minimum, private preview fix, human handoff and Dentive zero-rate account remain unchanged. The matching website has aligned metadata, direct canonical internal links and a new square NG favicon, while retaining the original logo and existing crawl/sitemap/404 rules. See `SERVICE-WORDING-SEO.md` and `WEBSITE-SEO-REVIEW.md`. Live Cloudflare deployment and Search Console state still require the owner’s checks.
