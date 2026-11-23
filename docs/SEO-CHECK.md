# Google search checks — 12 October 2026

The existing live website was checked before uploading v1.0.2. These are public HTTP observations, not Google Search Console account data.

| URL | HTTP result | Observed signals |
| --- | --- | --- |
| https://nerixglobal.com/ | 200 | Canonical: https://nerixglobal.com/; No X-Robots-Tag header observed |
| https://www.nerixglobal.com/ | 200 | Canonical: https://nerixglobal.com/; No X-Robots-Tag header observed |
| https://nerixglobal.com/robots.txt | 200 | No X-Robots-Tag header observed; Allows crawling; sitemap points to the apex |
| https://nerixglobal.com/sitemap.xml | 200 | No X-Robots-Tag header observed; Existing XML sitemap is available |

No obvious indexing block was found in the public homepage response or robots file. Normal HTTP200 responses are not proof that Googlebot has successfully crawled or chosen to index the page. Private Search Console reports, bot-specific Cloudflare rules, crawl history and Google-selected canonical were not available here.

The v1.0.2 website adds an exact Nerix site name and organization identity, visible voice/chat copy, corrected Alex/Sarah names, explicit index/follow metadata, and updated canonical/sitemap URLs. It keeps https://nerixglobal.com/ as the primary homepage and uses /privacy for the privacy-page canonical. Both homepage hosts already worked; a dashboard-level www-to-apex redirect can be considered after checking current rules. The ZIP does not alter DNS or domain-level Cloudflare rules.

“Netrix Global” showing for a broad name search does not itself prove that Nerix is blocked. Indexing and ranking are separate decisions. A preferred result position and eventual indexing cannot be guaranteed. After the updated website is uploaded, inspect its exact canonical URL in Search Console and check the reported reason and selected canonical.

Primary references: [Google technical requirements](https://developers.google.com/search/docs/essentials/technical), [site names](https://developers.google.com/search/docs/appearance/site-names), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Cloudflare redirects](https://developers.cloudflare.com/pages/configuration/redirects/).
