# Moving your five accounts from Dentive to Nerix

The accounts stay the same. Only what runs on them changes. Do these in order and **do not delete anything from Dentive until Nerix has passed `docs/TEST-PLAN.md`** — that is your rollback.

## 1. Neon (database)
- In the Neon console open your existing project and create a **new database named `nerix`** (Databases → New database). Do not reuse Dentive's database.
- Copy its connection string (it must end with `?sslmode=require`). This becomes `DATABASE_URL`.
- The app creates every table itself on first start (migrations 001–006). Nothing to import.
- Neon's free plan sleeps the database after a few minutes of inactivity and has a monthly compute allowance. The portal now only runs its background checks every 15 minutes when nobody is using it (every 15 seconds during calls/chats), so the database can sleep between visits. Check Neon's **Usage** page after a week.

## 2. Resend (email)
- Resend → Domains → add `nerixglobal.com`. Add the DNS records Resend shows (in the **Nerix** Cloudflare account, DNS tab). Wait for "Verified".
- Create a new API key with sending access limited to that domain. This becomes `RESEND_API_KEY`.
- Set `EMAIL_FROM` to an address on that domain, e.g. `Nerix Global <hello@nerixglobal.com>`.
- What gets emailed: team invitations, password-reset links, and (if you list addresses in the receptionist settings) a message for every new callback request.
- Check your Resend plan's daily sending limit before inviting many people.

## 3. OpenAI
- Best: create a **new Project** called "Nerix" in the OpenAI dashboard and a key inside it, so Nerix and Dentive spend is tracked separately. The same key also works if you prefer.
- That key is `OPENAI_API_KEY` in **both** `portal.env` (website text chat) and `gateway.env` (voice).
- Voice model is `gpt-realtime-2.1-mini` (set in `deploy/gateway.env.example`). Website chat model stays `gpt-4.1-mini`. Neither was changed from what you use today.

## 4. Cloudflare
Your saved Cloudflare login is Dentive's. For Nerix use the **Nerix** Cloudflare account:
- Make sure `nerixglobal.com` is a zone in the Nerix account (Add a site, change nameservers at the registrar if it is not).
- **Website:** deploy the `website/` folder as a Pages/static-assets project in that account. `website/chat-config.js` already points `apiBase` at `https://app.nerixglobal.com`; change it if you choose another address. Keep the existing `_headers`/`_redirects` files. Then, in the dashboard's website-chat settings, add `https://nerixglobal.com` as an allowed website for the site key `nerix-global` (see `docs/CHAT-SETUP.md`); without it the browser's chat requests are refused.
- **Dashboard address:** `app.nerixglobal.com` is created by a Cloudflare Tunnel from the Oracle VM (see `docs/DEPLOY-ORACLE.md`). No Cloudflare Worker is needed for Nerix.
- Add a WAF custom rule that **blocks** requests whose URI path starts with `/api/gateway/` on the public hostname. The gateway talks to the dashboard locally, so nothing outside needs that path.

## 5. VoIPstudio
- Same account, same forwarding numbers, same central outbound registration used for staff transfers. **No change on the VoIPstudio side** if the gateway keeps the same Oracle address.
- For each new customer: create their number and forwarding as you did for Dentive practices, then in the dashboard (Nerix administration → their workspace → **AI receptionist → Assign number**) enter that same number. The dashboard then shows a **Gateway route** snippet for the Oracle routing file.
- Because every customer's forwarded calls arrive from VoIPstudio's addresses, the gateway identifies the customer by **the number that was dialled**, never by the caller's number. Before selling to more than one or two customers, test with at least three numbers across two VoIPstudio accounts (see the test plan, stage 5).

## 6. Oracle Cloud
- Same account and same VM. The Dentive gateway keeps working until you switch it off in `docs/ORACLE-GATEWAY-SETUP.md`.
- Your free allowance is 2 OCPU / 12 GB. Oracle can reclaim a free VM that sits almost idle for 7 days. A phone service is exactly that kind of machine, so upgrade the account to Pay As You Go (stays free within the free limits) and ask Oracle support whether that also removes the reclaim rule. Set up an uptime monitor either way.

## What to keep, what to retire
Keep Dentive's Worker (`app.dentiveai.com`) and its database untouched until Nerix passes the test plan. Retire them afterwards. The `dentiveai.com` domain is separate and can simply expire.
