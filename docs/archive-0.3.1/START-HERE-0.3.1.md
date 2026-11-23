# Nerix Global — Replit setup

The current release is **0.2.5**, supplied as **Nerix-Global-App-0.2.5-Update.zip** for your existing 0.2.3 or 0.2.4 project. Follow `docs/SERVICE-WORDING-SEO.md` to update that same project. It includes the forty-topic FAQ expansion, updated public service wording and previous internal-company/preview corrections. No new database migration is required. The original-install instructions below are historical instructions for the initial 0.2.1 base, not instructions to replace your current project.

This ZIP is the **v0.2.1 foundation + website-chat release** from the roadmap: a working application with real accounts, saved data and simulated calls/payments. It does not place phone calls, generate live audio or charge cards yet. Text chat, human replies and saved follow-ups are implemented; AI text uses the optional OpenAI configuration described in `docs/CHAT-SETUP.md`.

Use a **new, separate Replit project** for this app. Your existing marketing website and Dentive/Sarah project keep their own files and databases.

## 1. Upload and extract

Create an empty Node.js project in Replit. Upload **Nerix-Global-App-0.2.1.zip** to its file area, then open **Shell** and run:

```bash
unzip Nerix-Global-App-0.2.1.zip
npm ci
```

The ZIP has the app files at its root. After extraction, `package.json`, `.replit`, `server/` and `client/` should be directly in the project root. If Replit already extracted the ZIP during import, run only `npm ci` there. These commands are for a new empty app, not the live website or Sarah project.

The included `.replit` file selects Node.js 22 and runs `npm run dev`. Use an up-to-date Node.js 22 (22.12.0+) or Node.js 24 (24.0+) for the included development tests.

## 2. Run the app

Click **Run**, or enter this in Shell:

```bash
npm run dev
```

The app listens on port 3000. The first start creates its database tables automatically. It can take several seconds.

For this demonstration you do not need Safepay, OpenAI, carrier or database credentials. A local embedded PostgreSQL database is stored in `data/postgres/`. Keep the `data/` folder if you want to keep your demo accounts and work. Never run two app processes against that folder.

## 3. Create your owner login

Open the Preview **in a new browser tab** before signing in. The app also shows an “open this workspace in a new tab” link if it is inside an embedded preview. A separate tab avoids third-party cookie restrictions.

On first launch, the Console shows:

```text
Initial setup key (enter once in the app): ...
```

Enter that key in the app, then choose your name, email and a password of at least 12 characters. There is no shared/default admin password.

You can instead set a long random `SETUP_TOKEN` in Replit Secrets before the first run. If you do, enter that value on the setup screen; it will not be printed in the Console. This key only authorizes the first owner account. Your email and password are used for later logins.

You will see two demonstration workspaces: **Nerix Global** and **Dentive AI · pilot**, each with USD300 in clearly labeled test credit and fictional leads. The owner can switch between them. Separate customer accounts only see their own authorized workspace.

## 4. Try the first workflow

1. **AI agents:** open Alex and Sarah. Review their approved knowledge and distinct tones.
2. **Lead directory:** import the included `public/samples/lead-import.csv` or `.xlsx`, or add a lead manually. Match the columns, choose the country/timezone/date format, preview, then commit.
3. **Campaigns → Edit:** choose the location, calling days/hours and attempt limit. Record the authorization review and set “Ready for simulation.”
4. **Simulate:** choose a lead and simulated schedule. If outside its allowed window, select the lead and use “Use next calling window.” Explicit opt-outs stay blocked.
5. Choose **90 seconds → Interested**. At USD0.30/minute, the test charge is exactly **USD0.45**. Review the call history, wallet and follow-up task.
6. Simulate a different lead with **No answer**. Its AI charge is **USD0.00**.
7. **Wallet & billing → Add credit:** try USD100 and select PKR. This is a simulated quote with an illustrative rate; no card or money is involved.
8. **Team & locations:** invite a staff member, set their company/location scope, then disable access to test revocation. Invitations are private links; this release does not send invitation emails.
9. **Nerix administration → Internal team:** invite support/operations staff or referral partners. After they accept, assign their permitted customer workspaces.

## 5. Try website chat

Open **Live chat inbox → Nerix Global website**. Click **Go available**, then **Test visitor widget** to open the visitor view in another tab. Ask a question, click **Talk to our team**, enter the reason first, then name/email/phone and contact permission. In your inbox, choose the waiting visitor and click **Join chat**. Your reply appears in the widget and automatic replies stop. Use **Resolve & close** when done.

Without an OpenAI key, this is clearly labeled FAQ help. Human replies and follow-up saving work. Add `OPENAI_API_KEY` in Replit Secrets and `CHAT_AI_ENABLED=true` to use the implemented text-AI adapter. The default text model is `gpt-4.1-mini`, independent of voice settings. A real provider response still needs your acceptance test.

Keep the inbox open while available. An agent heartbeat expires after 75 seconds; requests not accepted within two minutes become follow-ups. This release uses five-second polling, so messages may take a few seconds to appear. Email/callback delivery is manual.

Follow **`docs/CHAT-SETUP.md`** to host the backend and connect the separate Cloudflare ZIP. Its `chat-config.js` needs your exact public app URL. The website starts with local FAQ help until connected; it never claims an offline request was saved.

When you publish the app, the included deployment command switches on production checks. Configure a dedicated `DATABASE_URL`, HTTPS `APP_ORIGIN`, long `SETUP_TOKEN` and `APP_MODE=pilot` first. Missing production settings deliberately stop publishing; they do not prevent the normal local demo from running.

## 6. Keep the next activation steps separate

The app is ready for the above review. **Uploading it does not complete live OpenAI, Safepay, SIP, warm-transfer or calendar integration.** The remaining code, credentials and controlled tests are listed in `docs/BUILD-STATUS.md` and `docs/ACTIVATION-PLAN.md`.

Complete FBR/Safepay onboarding separately. Do not enter payment-card numbers, CVV, bank passwords, CNIC images or provider secrets into app notes.

Before collecting real payments, use a dedicated external PostgreSQL database, HTTPS and the approved merchant/terms setup. Do not promote demo balances into real funds. No public deployment or domain change is performed by this ZIP.

## Useful commands

```bash
npm run verify
npm run build
npm start
```

`npm run verify` checks TypeScript, runs the tests and creates the frontend production build. Stop an already-running app before using `npm start`, to avoid duplicate processes and port conflicts.

If you see “request origin is not permitted,” set `APP_ORIGIN` in Secrets to the exact URL of the new tab, with `https://` and no trailing slash, then restart. Replit proxy support is already configured in `.replit`.

For backup, recovery, production configuration and developer details, read `README.md`.
