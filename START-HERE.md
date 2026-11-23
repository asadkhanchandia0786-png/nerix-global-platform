# Nerix Global Platform 0.4.0 — start here

This is a **new, separate project**. It combines three things you already built and tested:

| Folder | What it is | Where it runs |
|---|---|---|
| `/` (root: `server/`, `client/`, `database/`…) | The Nerix dashboard and API: customers, wallet, website chat, CRM modules **and now inbound AI calls** | Replit (testing) → Oracle VM (live) |
| `gateway/`, `shared/`, `deploy/` | The Asterisk/OpenAI call gateway from your Dentive project, renamed for Nerix, set to `gpt-realtime-2.1-mini` | Oracle VM |
| `website/` | The Nerix marketing website (v1.0.6) with the chat widget | Cloudflare |

Nothing here touches your old Dentive project, your old Nerix project, or their accounts. If something goes wrong you still have them.

If Replit places the files inside an extra folder when you import the zip, move the contents up to the project root (the folder that contains `package.json`).

## How a call flows
Customer's business line (no answer) → forwards to their Nerix number at **VoIPstudio** → **Oracle VM**: Asterisk + gateway →
the gateway asks this dashboard's API who the call is for (by the number dialled), checks credit, and gets the instructions →
**OpenAI Realtime** talks to the caller → the AI can **transfer to staff** (they press 1 to accept) or **take a callback**
→ call ends, the wallet is charged by the second, a callback email goes out through **Resend**. Data lives in **Neon**.

## What you do, in order
1. **Replit** — create a new Repl from this zip. Run `npm ci`, then `npm run verify` (it checks types, runs every test and builds). Fix nothing by hand: if anything fails, give the exact message to the Replit Agent together with `docs/WHAT-CHANGED.md`.
2. `npm run dev`, open the app, create the owner account with the setup key, make a test company, convert it to an *internal company* (Nerix administration), and open **AI receptionist** to assign a test number and set up the receptionist.
3. `PORTAL_URL=… NERIX_GATEWAY_SECRET=… DID=+44… npm run gateway:smoke` — pretends to be the Oracle gateway for one call. This proves the dashboard side before any phone is involved.
4. **Accounts** — follow `docs/CUTOVER-FROM-DENTIVE.md` (Neon database, Resend domain, OpenAI key, Cloudflare account, VoIPstudio).
5. **Oracle** — follow `docs/DEPLOY-ORACLE.md` (dashboard on the VM) then `docs/ORACLE-GATEWAY-SETUP.md` (gateway). Take a boot-volume backup first.
6. **Test calls** — follow `docs/TEST-PLAN.md` from the top, stage by stage. Do not skip the transfer and failure drills.
7. **Website** — deploy `website/` to the Nerix Cloudflare account (see `docs/CUTOVER-FROM-DENTIVE.md`).

## Read this before trusting anything
`docs/WHAT-CHANGED.md` lists exactly what was verified when this package was built (syntax of every file, 15 logic tests,
the gateway's own signature and routing code against the new dashboard) and what **could not** be verified in the build
environment (database queries, React rendering, `npm run build`, live calls). Those are covered by `npm run verify` and the test plan.

Pricing, rates, the Alex/Sarah agent setup and the outbound simulations from 0.3.1 are unchanged. Outbound calling is **not** connected to the gateway.
