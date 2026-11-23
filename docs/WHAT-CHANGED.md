# What this package is, what was verified, what was not

Built from three sources you supplied: **Nerix Global App 0.3.1** (dashboard, chat, CRM, wallet), **Dentive/Sarah 0.6.16** (the gateway and the call API), and **Nerix website 1.0.6**. Your three originals were only read; they were not modified.

## Added or ported
1. **Inbound call API** (`server/gateway.ts`): protocol 4 from Dentive, rewritten for the Nerix database and wallet. Authorise by dialled number, reserve/renew/settle prepaid credit, capacity, spending caps, callbacks, warm-transfer state machine, usage, idempotent events.
2. **Database** `database/006-inbound-voice.sql`: numbers, receptionist settings, inbound calls, transfers, callbacks, event log, usage, email outbox, password resets.
3. **Dashboard**: *AI receptionist* page (numbers, settings, staff directory, hours, prompt preview, Oracle route snippet) and *Calls & callbacks* page; callbacks also appear in *Follow-ups* and stay in sync.
4. **Generic prompt** (`server/reception.ts`): the Sarah rules with all dental wording removed; business facts, policies, emergency instruction, hours and staff come from the customer's settings.
5. **Email through Resend** (`server/email.ts`): invitations, password reset, callback alerts. Queued in the database, sent after commit, retried; bodies are erased after sending.
6. **Password reset** screens and API.
7. **Gateway** (`gateway/`, `shared/`, `deploy/`): your Dentive gateway renamed (env `NERIX_*`, headers `X-Nerix-*`, service `nerix-gateway`, `/etc/nerix`, `/opt/nerix-gateway`), default model `gpt-realtime-2.1-mini`, generic roles/caller types, patient/outreach code disabled, spoken staff introduction uses the configured assistant name. Core call logic untouched.
8. **Backups** now include the voice tables; restoring a backup taken during a call safely closes it and releases held credit.
9. **Maintenance loop** runs every 15 s while in use and every 15 min when idle (was always 15 s) so Neon's free database can sleep.
10. Tests `tests/voice-pure.test.ts` (15) and `tests/voice-gateway.test.ts` (7), script `npm run gateway:smoke`.

## Deliberately unchanged
Pricing and rates, the three service tiers, the $100 minimum, Alex/Sarah profiles, outbound simulations, website chat, CRM modules, authorization model, the Dentive gateway's call handling, VoIPstudio settings.

## Verified when this package was built (no internet, no database in the build environment)
- Every new or edited `.ts/.tsx/.js/.sh/.json` file parses.
- **15 logic tests pass** (`node --test tests/voice-pure.test.ts`): money math, signature compatibility with the **real** gateway client, generic staff lookup/intake/policy, callback numbers, opening hours across time zones, prompt content.
- The gateway's own routing validator accepts the route the dashboard generates and keeps its transfer safety gates.
- Type-check of the new server files against stubbed libraries found no real errors.

## NOT verified (needs `npm run verify` on Replit, then the test plan)
- Every SQL statement against a real PostgreSQL/PGlite database; the 7 integration tests in `tests/voice-gateway.test.ts` were written but **have not been run**.
- React rendering of the two new pages and sign-in changes; `npm run check` against the real library types; `npm run build`.
- Existing 0.3.1 tests after my edits to `app.ts`, `backup.ts`, `runtime.ts`, `index.ts`, `app.tsx`.
- Any live call, Asterisk, VoIPstudio, OpenAI, Resend delivery, Cloudflare, Oracle step.
Expect small fixes on first run; that is what stage 0 is for. Billing and call-routing code deserves your full test plan before a paying customer.

## Known limits
- Adding a customer location means pasting a route into the Oracle file and restarting the gateway when idle (also when staff numbers change). Automating that is a good next step.
- Live calls are refused for demo workspaces and when credit is below ~15 s; the caller then hears the call drop (no spoken message).
- No call recordings or transcripts are stored; callbacks and call metadata only.
- Email "verification" is not separate: in pilot mode people join only by emailed invitation, which proves the address. Demo-mode self-sign-up stays unverified (use demo only for testing).
- Language list is English variants only; other languages need a prompt/voice review.
- Local (non-international) callback numbers are understood for US, Canada, UK and Pakistan only; other countries need `+` numbers.
- The old outbound pages (Campaigns, Leads, Call history) still show simulations and are not connected to the gateway.
