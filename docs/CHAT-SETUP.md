# Nerix Global voice + website chat — upload guide

Use **Nerix-Global-App-0.2.1.zip** for the app and **Nerix-Global-Cloudflare-v1.0.3.zip** for the marketing website. The app serves the AI/human chat and stores conversations. The Cloudflare ZIP is static and contains the visitor widget.

## 1. Install the app first

In a new Replit Node.js project, upload the app ZIP and run:

```bash
unzip Nerix-Global-App-0.2.1.zip
npm ci
npm run dev
```

Open the preview in a new tab and create your owner account using the Console setup key. If you already installed v0.1.0 or v0.2.0 in this app project, stop it and back it up before extracting this full release. Extract with `unzip -o Nerix-Global-App-0.2.1.zip`, then run `npm ci`. Keep `.env`, Replit Secrets, `data/` and backups. Migration 002 runs automatically when needed and preserves the foundation tables. No `apply-update.js` is required for this Nerix full release.

## 2. Test human chat before enabling paid AI usage

Open **Live chat inbox** and choose **Nerix Global website**. Click **Go available**. Keep this tab open.

Click **Test visitor widget**. In that separate tab:

1. Click the small round logo and ask about services. Without OpenAI enabled, the assistant is clearly labeled automatic FAQ help.
2. Click **Talk to our team**. Enter the reason first, then your name, email and phone with country code and contact permission.
3. In the staff inbox, select the waiting visitor, review the reason/transcript and click **Join chat**.
4. Send a human reply. It appears in the visitor widget within a few seconds; automatic replies are paused.
5. **Resolve & close** finishes the chat and its follow-up. **Return to team** leaves a follow-up open.
6. Set yourself unavailable and try another visitor request. It should save a follow-up and state that no live person is available. The assistant can still help with questions.

Messages poll every five seconds. Human availability expires after 75 seconds without an inbox heartbeat; waiting requests turn into follow-ups after two minutes. Staff contact the visitor manually from the saved details. This release does not automatically send an email or call.

## 3. Enable OpenAI text chat

Add these in **Replit Secrets**:

| Secret | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI project API key |
| `CHAT_AI_ENABLED` | `true` |
| `CHAT_MODEL` | `gpt-4.1-mini` initially |
| `CHAT_AI_DAILY_LIMIT` | `200` initially, or a lower limit you choose |

Restart the app. Open a new visitor chat and ask a question not covered by the basic FAQ. Confirm the response is labeled **Sarah · AI** and that the inbox records token usage. Check the actual OpenAI project usage/credits. If the model or key is unavailable, the widget uses labeled FAQ fallback; the Console reports an HTTP status when available.

The text model is separate from the voice/Realtime model and settings. The implementation uses OpenAI Responses with `store:false`, a bounded output and no browser API key. Daily request limits are server-wide, not a guaranteed dollar cap. Configure your OpenAI project's budget/alerts as well.

No live OpenAI transaction was performed during packaging. This key/configuration test is required to accept your actual provider connection.

## 4. Host a persistent backend

For public website chat, the Node app needs a stable public HTTPS address and durable PostgreSQL. The temporary Run preview stops delivering chat if the app stops. Use a suitable Replit deployment or another persistent Node host; the static Cloudflare ZIP alone cannot run this Express/PostgreSQL backend.

The included Replit deployment command explicitly enables production mode. Before publishing, add `DATABASE_URL`, an exact HTTPS `APP_ORIGIN`, a long random `SETUP_TOKEN` (at least 24 characters), and `APP_MODE=pilot` to the deployment configuration. Add the chat Secrets there too. Publishing intentionally stops with an explanatory error if the required production configuration is missing. The ordinary **Run** button remains a local demo. Use a dedicated database and create the owner account for that database; local preview accounts are not copied into it automatically. Consult `README.md` for production settings and backup workflow.

For example, your real app address may look like `https://your-actual-app.replit.app`, or a later `https://app.nerixglobal.com`. Use the address actually assigned to you. Do not paste an example address or an OpenAI key into the website.

## 5. Connect the Cloudflare website

Extract **Nerix-Global-Cloudflare-v1.0.3.zip** on your laptop. Open `chat-config.js` in a text editor and replace the empty `apiBase` with your exact public app origin:

```js
window.NERIX_CHAT = {
  apiBase: "https://YOUR-ACTUAL-HOSTED-APP-ADDRESS",
  siteKey: "nerix-global",
  contactEmail: "info@nerixglobal.com"
};
```

Use `https://`, no trailing slash and no path. Keep the site key. Save it, then select all extracted files/folders and ZIP them with **index.html at the archive root**. Upload that ZIP as a **new deployment in the existing Cloudflare Pages website project**. Keep its current custom domains.

The default Nerix chat site permits both `https://nerixglobal.com` and `https://www.nerixglobal.com`. In **Live chat inbox → Site settings**, check these exact origins. A temporary `pages.dev` preview needs its own exact origin added if you want chat there.

The supplied Cloudflare ZIP deliberately has an empty backend URL because your new hosted address is not known yet. It immediately displays the logo button and local FAQ/email-draft fallback. It does not pretend that offline contact details were submitted to the inbox.

## 6. Add team members or a client chat site

Invite Nerix support/operations staff in **Nerix administration → Internal team**. After accepting, they can handle the global Nerix website; client workspace access uses explicit assignments. Customer staff access follows their membership and site company/location scope. Partners/viewers cannot read visitor inboxes.

For a client, select the correct customer workspace and click **New client chat site**. Set its business name, Sarah support or Alex sales style, approved public knowledge, website origins and company/location scope. The public site key keeps its queue separate. Set `contactEmail` to the client’s approved support address and `privacyUrl` to its published privacy policy. Without a client contact address, an offline widget directs visitors to the business website's contact information; it never silently redirects their details to Nerix. Use **Copy website connection** and the widget files for its embed; agree staffing, commercial terms and the client's privacy arrangements before public activation.

The copied configuration belongs in `chat-config.js`. Load it before the widget, for example with these two tags before `</body>` when you host the supplied widget files on that website:

```html
<script src="/chat-config.js" defer></script>
<script src="/chat-widget.js" defer></script>
```

Also include `chat-widget.css` and `assets/nerix-logo.png` next to those files, or provide an approved `logoUrl`. The Nerix Cloudflare ZIP already includes these files and tags. In the staff inbox, filters and Previous/Next page controls include older requests; open follow-ups are not limited to the most recent 100 chats.

Chat can be offered alongside voice services. Chat pricing is agreed separately; this version does not bill chat against voice minutes or automatically debit a client wallet.

## 7. Google after uploading the website

The package adds consistent Nerix branding, `WebSite`/`Organization` information, a crawlable homepage and updated sitemap, and fixes Alex/Sarah examples. It keeps `https://nerixglobal.com/` as the canonical homepage. The privacy page's canonical URL is `/privacy`, matching Cloudflare Pages' extensionless HTML handling.

The public checks found both homepage hosts returning HTTP200, no `X-Robots-Tag: noindex`, and a robots file allowing crawling. This does not establish Google's private indexing report or guarantee a ranking for “Nerix Global”. Another company's “Netrix Global” result does not itself block indexing.

After deployment, inspect `https://nerixglobal.com/` in Search Console, run the live test and request indexing for the updated page once. Check the reported indexing reason and Google-selected canonical. Keep the submitted sitemap URL. If the www host is independently served, optionally configure a **Cloudflare dashboard 301 redirect from www to the canonical apex** after checking current rules. Domain-level redirects are not implemented by a Pages `_redirects` file; the ZIP only adds path redirects.

Reference: [Google technical requirements](https://developers.google.com/search/docs/essentials/technical), [Google site names](https://developers.google.com/search/docs/appearance/site-names), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Cloudflare Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/).


App 0.2.2 is provided as an update-only ZIP for that 0.2.1 base. Apply `Nerix-Global-App-0.2.2-Update.zip` using `INTERNAL-COMPANIES.md`; the website package and backend URL setup stay the same.

For the existing 0.2.2 app, apply **Nerix-Global-App-0.2.3-Update.zip** using `CHAT-CONNECTION-FIX.md` if the self-hosted visitor test shows live connection offline. The test page supports the signed-in browser of a protected preview; the public website still requires a persistent public backend.

App 0.2.4 adds forty prepared Nerix topics and a Browse FAQs menu. Leave CHAT_AI_ENABLED unset/false for preset-only operation; human handoff is independent. See FAQ-UPDATE.md and CUSTOMER-FAQ.md. Cloudflare website v1.0.4 contains the matching widget and preserves the original empty backend value until a public backend is configured.
