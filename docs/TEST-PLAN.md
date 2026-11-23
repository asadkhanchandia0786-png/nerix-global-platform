# Test plan — go stage by stage, in order

Do not move to the next stage until every box in the current one is ticked. Use an **internal test company** (Nerix administration → convert to internal company) for stages 1–4 so no customer credit is involved.

## Stage 0 — Replit: the code itself
- [ ] `npm ci` finishes.
- [ ] `npm run verify` finishes with no errors (type check + every test + build). The new suites are `tests/voice-pure.test.ts` and `tests/voice-gateway.test.ts`.
- [ ] If anything fails, copy the **exact** message to the Replit Agent along with `docs/WHAT-CHANGED.md`. Do not change pricing, models or billing rules to make a test pass.

## Stage 1 — Dashboard only (no phone)
- [ ] Create a test company; convert it to an internal company.
- [ ] *AI receptionist*: assign a number (any valid +number), then **Set up receptionist**: business name, facts, hours, front-desk number, one staff member with a **default for role**. Save. Click **Preview instructions** and read them: they should describe the business, never mention dental/patients.
- [ ] `PORTAL_URL=… NERIX_GATEWAY_SECRET=… DID=+… npm run gateway:smoke` prints `PASS`.
- [ ] *Calls & callbacks* now shows that smoke call and a callback; *Follow-ups* shows the callback task; marking it done in either place updates both.
- [ ] Invite a second user: the invitation email arrives (needs Resend). Use *Forgot your password?* on the sign-in page: the reset email arrives and the link works once.

## Stage 2 — Oracle, gateway installed, no live traffic
- [ ] `docs/DEPLOY-ORACLE.md` and `docs/ORACLE-GATEWAY-SETUP.md` completed; `curl http://127.0.0.1:3000/api/health` shows `liveCalls: true`.
- [ ] `node --env-file=/etc/nerix/gateway.env /opt/nerix-gateway/gateway/check.js` reports no problems.
- [ ] `systemctl status nerix-gateway nerix-portal asterisk` all active; `journalctl -u nerix-gateway` shows no repeating errors.
- [ ] Reboot the VM once; all three services come back by themselves.

## Stage 3 — One real test call (internal company)
Call the test company's **forwarded** number from your mobile.
- [ ] The assistant answers within a few seconds with the greeting you wrote, says it is a virtual receptionist, and uses the business name.
- [ ] It answers a question from your "public facts", and says it cannot help with something not in them (no invented facts).
- [ ] Ask for "the manager" (a role): it asks your name and reason, confirms them, then tries the staff phone.
- [ ] The call appears in *Calls & callbacks* with the right outcome and duration.

## Stage 4 — Transfers and callbacks
- [ ] Staff presses **1**: caller and staff are connected, the AI leaves, the call is listed as *transferred*.
- [ ] Staff presses **2** or does not answer: the AI returns, offers a callback, does **not** try another person.
- [ ] Ask for someone not in the directory: it offers the front desk only after confirming with you.
- [ ] Callback flow: it reads back your number, you agree, it saves; the callback appears in the dashboard and the email arrives.
- [ ] Hang up mid-call, stop the portal mid-call (`systemctl stop nerix-portal`, then start it): the call ends cleanly and no money or credit stays "held" afterwards.
- [ ] `callerIdVerified` is `true` only for routes whose caller ID you confirmed in VoIPstudio.

## Stage 5 — Customers and money
- [ ] Use a **customer-type** (not internal) company with a small paid or test credit. Note the wallet balance.
- [ ] Make a 1-minute call. The wallet reduces by about the published rate for that time (per second, rounded up to the next millionth of a dollar); nothing remains "reserved" after the call.
- [ ] Set the balance almost empty: the next call is refused (the caller hears nothing/busy) and the wallet page shows the funding needed.
- [ ] With **two** customers: give each its own number (ideally on two VoIPstudio accounts). Call each; confirm each call lands in the right workspace and instructions, and that staff of customer A can never be reached from customer B.
- [ ] Make two calls at once to one number: both are answered; a third while two are open is refused (default 2 included channels).

## Stage 6 — Before you tell customers it is live
- [ ] Second reboot test; uptime monitor on `https://app.nerixglobal.com/api/health`.
- [ ] A backup was taken and a restore was rehearsed on a throwaway database (`npm run backup`, `npm run restore`).
- [ ] Oracle account upgraded to Pay As You Go / reclaim question answered by Oracle.
- [ ] Public wording updated: see `docs/PUBLIC-WORDING-TODO.md`.
- [ ] Legal review done for recording/AI-disclosure rules in each country you serve (the assistant states it is virtual; this build records no audio and no transcripts).
