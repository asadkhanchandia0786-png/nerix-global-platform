# Public service wording and website SEO — app 0.2.5 / website 1.0.5

The public help answer now says **Voice service starting rates**, rather than **Voice pilot starting rates**. Related public FAQ and website copy uses service/setup language. The USD0.30 / USD0.50 / USD0.75 starting rates and USD100 normal minimum are unchanged. The platform's actual development and pending activation status remains clear. This wording does not create credit, enable live calling, or change Dentive's internal company account.

## Update the existing Replit project

Use **Nerix-Global-App-0.2.5-Update.zip** in your current project. This cumulative changed-files-only update works over 0.2.3 or 0.2.4, and includes the forty-topic FAQ menu from 0.2.4. There is no new database migration. Keep Secrets, data, accounts and the original application.

Stop the app, run `npm run backup` and retain that private backup. Upload the ZIP into Files, then run these commands in Shell from the directory containing `package.json`:

```bash
unzip -o Nerix-Global-App-0.2.5-Update.zip
npm ci
npm run build
```

Click **Run**, hard-refresh the app and test-widget tabs, then choose **New chat → Browse FAQs → What are your starting voice service rates?** New replies use the updated wording. Existing saved messages keep their historical text. OpenAI is optional; leave `CHAT_AI_ENABLED` unset or `false` for preset-only replies. The private-preview credential correction and human handoff are retained.

If you are still on 0.2.2, apply 0.2.3 first. Do not extract any of these app ZIPs into the Cloudflare marketing website or the separate Sarah application.

## Upload the website to Cloudflare

Use **Nerix-Global-Cloudflare-v1.0.5.zip** for a new production deployment in your existing Pages project. It contains all static website files with `index.html` at the archive root. A complete file set is required for a Pages direct-upload deployment.

Before uploading, preserve any existing public `apiBase` setting in your current `chat-config.js`. The package's default value is empty because no persistent public backend has been supplied. This means local prepared FAQ answers work, but human-help details prepare an email draft instead of reaching the inbox. Use your real public app HTTPS origin when that backend is ready; do not use a protected temporary preview URL or put a secret into this file.

The layout, original headset logo, Alex/Sarah examples and price calculations are preserved. SEO improvements include descriptive aligned search/share titles, a consistent Nerix site identity, direct internal links to the canonical homepage/privacy routes, and a small square NG favicon. The original logo remains the website and chat-launcher image. Canonical URLs, crawl permissions, the sitemap and intentional alias redirects remain in place. The existing top-level 404 page is retained and is excluded from the sitemap.

See **WEBSITE-SEO-REVIEW.md** for the complete package audit and the live deployment checks. Package validation cannot determine your actual Cloudflare DNS, redirect rules, Google-selected canonical or search position. There is no promised ranking or indexing date.
