# Nerix Global website SEO review

Reviewed: 12 October 2026. Website release: **1.0.5**. Matching app patch: **0.2.5**.

The downloadable website's static indexing settings pass the package audit. Its homepage and privacy page contain indexable HTML, allow indexing, and use consistent HTTPS canonical URLs. This is not a verification of the current live domain, its Cloudflare account settings, Google's chosen canonical, or a search ranking.

## What changed

| Finding | Correction | Effect |
| --- | --- | --- |
| Public pricing called the service a “voice pilot” | Public chat says **Voice service starting rates**; related marketing copy uses service/setup language | Clearer wording; prices and actual activation status are unchanged |
| Search and sharing titles used different wording | Title, Open Graph and Twitter metadata consistently describe **Nerix Global — AI voice agents and website chat** | Clearer brand/service identification; Google can still select its own result title |
| Some internal links pointed through `.html` aliases | Home/privacy links point directly to `/` and `/privacy` | Removes unnecessary redirects from internal navigation |
| The existing headset logo used as a favicon was 1364×1153, not square | Added a stable **192×192 PNG NG favicon** | Meets the square favicon format requirement; the original headset logo remains unchanged throughout the website and chat launcher |
| Website structured data used a secondary name not needed for this brand | Preferred name remains **Nerix Global**, with **nerixglobal.com** as the alternative | Consistent website identity and a domain-name fallback; no invented social-profile URLs |

These are improvements. They do not establish that the previous favicon, wording or redirect aliases caused your website to be absent for a brand-name query. A favicon issue affects the search icon, rather than proving a page indexing block.

## Verified in the package

- Homepage canonical: `https://nerixglobal.com/`.
- Privacy canonical: `https://nerixglobal.com/privacy`.
- Homepage/privacy have distinct titles/descriptions, one main heading, English language and mobile viewport metadata.
- Service information, pricing and website FAQs are in the original HTML; a crawler does not have to open the chat widget to see the main content.
- `robots.txt` allows crawling and points to the correct sitemap.
- `sitemap.xml` is valid XML and lists only the two preferred indexable URLs. The 404 page and redirect aliases are excluded.
- The existing `/index.html → /` and `/privacy.html → /privacy` permanent redirects are retained. A report excluding an intentional alias can be normal.
- The top-level `404.html` is present and contains `noindex`; it does not declare the homepage as its canonical. Cloudflare documents using this file for missing pages.
- Website/organization structured data is valid JSON and uses the Nerix name/domain. No fabricated review ratings, physical office, incorporation status or social-profile ownership is added.
- Local file links and section anchors resolve. JavaScript syntax and existing Alex/Sarah tab, enquiry and price-calculator behavior pass checks.
- The new favicon is a valid square PNG. The original headset logo, stylesheet, voice examples and price calculations are preserved.
- The static widget is identical to the app's generated public FAQ widget. It retains the forty-topic catalog and human-handoff behavior.

The app passes **63 existing automated tests**, TypeScript checking and the production build. These include real local database/API chat flows, preview credentials, human handoff, account isolation, backup compatibility and Dentive's zero Nerix service fees. No new database migration or live provider transaction is introduced.

No live PageSpeed score was measured. The preserved original logo is about 1 MB, so a separately prepared smaller equivalent is a possible later performance improvement; its size alone does not prove an indexing problem. Social-platform rankings and Google ranking outcomes are not measured by this package review.

## Upload and live checks

1. Deploy **Nerix-Global-Cloudflare-v1.0.5.zip** as a new production deployment in the existing Pages project. Preserve any current public backend origin in `chat-config.js` first. The supplied default is empty; prepared FAQ answers work locally, while human inbox delivery requires your connected public backend.
2. Open **https://nerixglobal.com/** directly. It should serve the Nerix homepage publicly without a sign-in wall. Inspect that exact URL in Search Console and use **Test live URL**. Check page fetch, crawl permission and indexing permission. The successful preferred page must return HTTP 200 to Google.
3. In the indexed result, check the **Google-selected canonical** as well as your declared canonical. A successful live test is eligibility evidence; it does not mean Google has already indexed that version. If Google selects another URL, inspect that URL and the actual redirect chain before changing a working rule.
4. Check **https://nerixglobal.com/privacy**, **https://nerixglobal.com/robots.txt** and **https://nerixglobal.com/sitemap.xml**. The privacy page should work at its clean URL and the sitemap should contain the two preferred addresses above.
5. Check the HTTP and `www` variants. If an existing permanent redirect leads to the preferred HTTPS homepage, keep it. If a variant serves a duplicate, decide whether to consolidate it in Cloudflare after checking the actual response. This ZIP does not change DNS or domain-level redirect rules.
6. A made-up path such as `/this-page-does-not-exist` should show the custom missing-page screen with HTTP 404. Check this after deployment; the local package check is not a live Cloudflare status measurement.
7. Request indexing/recrawling of the preferred homepage after the update. Keep the existing sitemap submission if successful. Inspect **Pages → Page with redirect → Examples** to identify the reported excluded URL; do not delete an intended redirect merely to eliminate that report category.

The previous screenshots showed **one indexed URL and one redirect exclusion**, but did not identify which URL was indexed or the excluded redirect target. A final conclusion about the homepage needs those details. Public-domain retrieval was unavailable to the audit tools in this session; that is not evidence that Google cannot crawl your site.

LinkedIn/Facebook pages appearing before your website is a ranking observation, not proof of an indexing block. Keep your official profiles linked to the exact website URL. Indexing eligibility, actual indexing and ranking for a particular query are separate. There is no guaranteed date or position for your site.

## Official guidance used

- [Google Search technical requirements](https://developers.google.com/search/docs/essentials/technical): public crawl access, successful HTTP response and indexable content; eligibility does not guarantee indexing.
- [Google title-link guidance](https://developers.google.com/search/docs/appearance/title-link): concise descriptive titles and consistent prominent page information; Google generates the result title.
- [Google site-name guidance](https://developers.google.com/search/docs/appearance/site-names): consistent website identity and supported domain-name alternatives.
- [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): consistent preferred URLs in links, canonical annotations and sitemap.
- [Google favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search): a stable, crawlable, brand-representative square icon in a supported format.
- [Cloudflare Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/): clean static routes and a top-level custom 404.

This audit does not alter a live website, Search Console account, social profile, Cloudflare rule, domain record or paid provider configuration.
