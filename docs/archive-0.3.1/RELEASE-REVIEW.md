# Pre-upload review — app 0.2.1 / website 1.0.3

Reviewed on 12 October 2026, before the owner's first upload. This is a correction release for the existing foundation and website chat. The original website design, logo, Alex/Sarah roles, rates, USD wallet rules and separate Dentive project are retained.

## Confirmed issues corrected

| Finding | Correction |
| --- | --- |
| Human chat bubbles reused the request-button selector and could disappear on the next poll. | Button selectors are now explicit. The visitor/staff workflow checks that human replies remain visible across subsequent polls. |
| A late poll could append messages from an old conversation after starting a new one. | Single-flight polling and conversation/revision checks discard stale results; mutations invalidate older requests. |
| Expired tokens could block the New chat action. | A confirmed expired session can be replaced with a fresh conversation. |
| Restored message IDs did not advance PostgreSQL's serial sequence, blocking new messages after restore. | Restore resets the sequence. The regression restores history, then starts and sends messages in a new chat. |
| Only the latest 100 chats reached the staff inbox, hiding older follow-ups. | Server-side queue filters, complete counts and 50-row pages make older requests accessible. |
| Retrying a staff reply could create duplicate messages after a lost response. | The same message/request key is retained for retries. |
| Deployment depended on the host setting NODE_ENV; the development server accepted arbitrary hosts. | Replit's deployment command explicitly enables production checks. Exact origin validation, persistent-database requirements and development host restrictions are enforced. |
| A generic widget privacy link could point to a missing page; offline client details defaulted to Nerix email. | The default policy points to Nerix's public policy. Client fallback requires that client's configured email. |
| The 404 page did not contain the requested floating widget. | It now loads the same logo widget using root-relative asset paths. |
| The public calculator allowed amounts below the agreed USD100 minimum, and public AI knowledge mentioned private exceptions. | Public copy, calculator validation and default AI knowledge now consistently state the USD100 minimum. Private owner exception tools remain private. |
| Replit project instructions still called this the old 0.1.0 release. | Versions, install commands and chat activation instructions are aligned. |
| Multibyte invalid setup input could throw in constant-time comparison. | Compare buffer byte lengths before comparison and return a normal validation error. |

## Verification

The original 38 tests passed; regression cases first reproduced the restore and hidden-follow-up failures. The corrected application has 45 passing tests covering real API/database and DOM workflows, including the new failure cases. TypeScript and the production frontend build pass. Website checks cover example tabs, minimum and per-second calculations, chat enquiry, local asset targets, page IDs, canonical/robots/sitemap data, widget inclusion and identical widget source in both packages. A separate clean copy installed all 247 dependencies with `npm ci`, then started the built server with a new database and completed the full visitor/human handoff over local HTTP. The dependency audit reported zero vulnerabilities. See `TEST-RESULTS.txt` for the final execution record; archive integrity and required-file checks also passed.

## Required configuration and remaining scope

- The Cloudflare ZIP deliberately leaves `chat-config.js` → `apiBase` empty until the app has a real hosted HTTPS address. It displays local FAQ/email-draft fallback in that state. Full AI/human chat needs the connected backend and owner setup.
- OpenAI text chat requires a server API key, CHAT_AI_ENABLED=true, a funded/authorized model and an owner acceptance test. No live paid provider call was made during this review.
- Public deployment requires a separate durable PostgreSQL database, HTTPS origin and setup token. Hosted Replit/Cloudflare browser acceptance is still required; local DOM checks do not establish actual browser layout, proxy behavior or provider availability.
- Live voice/carrier, Safepay checkout/refunds/auto-recharge and external calendar adapters still require implementation and activation. This release does not complete those integrations.
- Staff follow-up contact is manual; no notification email, SMS or callback is sent automatically. Google indexing/ranking remains Google's decision.

Implementation references checked: [Replit configuration](https://docs.replit.com/features/project-setup/configuration), [Vite allowed hosts](https://vite.dev/config/server-options.html#server-allowedhosts). No website, account, DNS record or provider configuration was published or changed by this review.
