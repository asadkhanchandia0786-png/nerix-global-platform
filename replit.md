# Nerix Global Platform 0.4.0 — instructions for the Replit Agent

This is a **new** project combining the Nerix dashboard (0.3.1), the inbound-call API ported from Dentive, and the renamed gateway. Do not rewrite the stack or replace it with a mockup.

- Read `START-HERE.md`, then `docs/WHAT-CHANGED.md` (what is verified and what is not) and `docs/GATEWAY-CONTRACT.md`.
- `npm ci`, `npm run verify`, `npm run dev`. Node.js 22.12.0+. Server on `0.0.0.0:3000`. Default `APP_MODE=demo`; embedded Postgres in `data/postgres/` is preview-only.
- First job: make `npm run verify` pass. Fix defects in the new code (`server/gateway.ts`, `voice.ts`, `email.ts`, `reception.ts`, `voice-math.ts`, `client/voice.tsx`, `database/006-inbound-voice.sql`, edits in `app.ts`/`backup.ts`/`runtime.ts`/`index.ts`/`app.tsx`) and tests. The tests in `tests/voice-gateway.test.ts` were never executed before; expect to correct test setup details, but **never weaken a security or money assertion** to make it pass without explaining why.
- Never put real credentials in code or files; use Secrets. The gateway code (`gateway/`, `shared/`, `deploy/`) runs on the Oracle VM, not in Replit; in Replit only the dashboard runs.
- Preserve: organization/company/location authorization, integer micro-USD wallet and reservations, idempotent billing per call (`inbound:<callId>`), HMAC-signed gateway events with raw-body verification, DID-based tenant routing (never caller-ID), staff numbers never sent to the AI, one confirmed decline or failed sales call blocks further transfers.
- Do **not** change pricing, rates, the USD100 minimum or the realtime/chat models. Do not enable `LIVE_PAYMENTS_ENABLED`. Outbound calling is not connected to the gateway.
- Public wording ("in development") is intentionally unchanged; see `docs/PUBLIC-WORDING-TODO.md`.
- Keep migrations incremental (`007+`). Chat/CRM/internal-company behaviour from 0.3.1 must keep working (existing tests).
