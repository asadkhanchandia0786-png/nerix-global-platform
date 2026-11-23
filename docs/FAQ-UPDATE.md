# Customer FAQ update — app 0.2.4 / website 1.0.4

The global Nerix chat now has 40 prepared topics and a **Browse FAQs** menu. Services, Alex/Sarah, onboarding, availability, pricing, USD100 deposits, seven planned currencies, payment onboarding, unused-credit refunds, calling rules, transfers, integrations, team access and privacy are covered. A question without a confirmed preset answer is directed to the team. This remains prepared FAQ help, rather than a freely reasoning AI assistant.

**No OpenAI key is required.** With AI disabled, preset replies do not call OpenAI or consume its request budget. Connected chat still saves messages and supports the existing reason-first human request and follow-up flow. When a person joins, automatic replies pause and the FAQ menu closes. Intentional connected FAQ mode is labeled **Preset FAQ help**, rather than an AI-offline error.

The standalone website widget has the same catalog bundled into its existing JavaScript file. If its backend is disconnected, it can still answer the global Nerix FAQs locally. It clearly states that human-help details only prepare an unsent email draft; they cannot reach your inbox until a persistent public backend is connected.

## Update the existing Replit project

This is **Nerix-Global-App-0.2.4-Update.zip**, containing changed/new files relative to 0.2.3. Keep your current project, Secrets and database. Dentive's internal account and zero Nerix service rates remain in force. There is no new database migration.

1. Stop the app. Run `npm run backup` and retain the private backup.
2. Upload the update ZIP into the same project's Files.
3. Run one command at a time from the directory containing `package.json`:

```bash
unzip -o Nerix-Global-App-0.2.4-Update.zip
npm ci
npm run build
```

4. Click **Run**, then hard-refresh the app and test-widget tabs with **Ctrl + Shift + R**. Start **New chat** so old replies do not confuse the new mode label.
5. In **Nerix Global → Live chat inbox**, go available. Open **Test visitor widget**, click **Browse FAQs**, choose a question and verify its answer.
6. Request a person, join from the inbox and reply. Check that the visitor receives the reply and the FAQ button disappears while a person is handling the chat. Also try a request while nobody is available and check the saved follow-up.

Leave `CHAT_AI_ENABLED` unset or `false` for preset-only operation. If you choose to enable OpenAI later, the existing separate server Secrets apply; provider usage then needs real acceptance and monitoring.

## Update the Cloudflare website

Use **Nerix-Global-Cloudflare-v1.0.4.zip** as a new deployment in the existing Pages project. It contains the complete static website, with the matching FAQ widget. The homepage design, logo, voice examples, site content, canonical, robots, sitemap and redirect rules are preserved.

Before uploading, preserve any `apiBase` you already configured in your current `chat-config.js`. The provided package retains the original empty value because no persistent public app address has been supplied. A protected temporary Replit development URL is not the public backend for customer handoffs. Do not put API keys or preview-access tokens into static website files.

If you already have a public backend, enter its exact HTTPS origin in `chat-config.js`, with no path or trailing slash, and rezip all website files with `index.html` at the archive root. Keep `siteKey: "nerix-global"`. Without that backend, local FAQs work but inbox delivery does not.

## Editing answers later

The full reviewable content is in **CUSTOMER-FAQ.md**. `shared/faq.ts` is the source for both connected replies and the generated widget bundle. Running `npm run build` updates the bundled public script and catalog before Vite builds. Do not edit the generated bundle region directly.

Free-form Site settings knowledge controls enabled AI responses; it does not rewrite preset FAQ topics. Client chat sites retain their own scope and do not display the global Nerix catalog or substitute Nerix's rates for their business information. Client-specific prepared catalogs are separate work.

Voice, carrier, external calendar/CRM and real Safepay checkout remain separate activation milestones. The answers mark those limitations and do not promise universal integrations, guaranteed results, automatic recharge or instant refunds.
