# Nerix Global Search Console check — 12 October 2026

## What the supplied screenshots establish

The Page indexing summary shows **1 indexed URL** and **1 non-indexed URL**, with one reason. The email identifies **Page with redirect**. The third screenshot contains routine links to performance and error reports. None of these screenshots identifies the indexed URL, the excluded URL or the redirect destination.

A redirect exclusion can be expected for an alternate URL. It is not proof that the homepage is blocked. The redirect destination needs its own inspection; do not assume it is indexed from the alias's report. Google documents this distinction in its [Page indexing report](https://support.google.com/webmasters/answer/7440203?hl=en).

## The exact checks to make

1. In **Pages**, scroll to the reasons table, open **Page with redirect**, and copy the affected URL from **Examples**.
2. Inspect `https://nerixglobal.com/` in the top inspection box. Read its indexed status and the Google-selected canonical. Inspect the final destination if Google chose a different homepage version.
3. If the excluded URL is an intended HTTP/www or file-name alias, keep the redirect to the preferred page. If the actual homepage is redirected to an unwanted domain, parking page or unrelated path, review that specific Cloudflare rule and correct only the unintended destination. The screenshots do not establish which case applies.
4. After an actual correction, use the homepage live test and request indexing for that preferred destination. A normal alternate redirect is not something that must be removed just to make the non-indexed count zero.

Google's [redirect guidance](https://developers.google.com/search/docs/crawling-indexing/301-redirects) recommends consistent destinations for alternate addresses. Its [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) describes matching canonical and sitemap URLs.

## Package findings and limits

The existing website package declares `https://nerixglobal.com/` as the homepage canonical and `/privacy` as the privacy canonical. Its sitemap lists those two preferred URLs; robots permits crawling. It intentionally redirects `/index.html` to `/` and `/privacy.html` to `/privacy`. The FAQ update preserves these settings. Those source-file checks do not prove that the live Cloudflare account serves the same responses.

Public retrieval of the live homepage hosts, robots and sitemap was unavailable during this review. No live status code, response header or redirect chain is claimed, and this retrieval limitation is not evidence that Google cannot access the site. No DNS setting, Cloudflare rule, Search Console property or account was changed.

## Why social pages may appear first

An indexed URL is eligible for search; it is not guaranteed to appear for every query or above other pages. The summary count does not establish homepage ranking. LinkedIn/Facebook results alone do not identify an indexing block. Keep the website address and business identity consistent on the official profiles so customers can find the correct site.

For the remaining diagnosis, provide the **excluded example URL** and the **homepage URL Inspection result**. That is enough to distinguish an intended alias from a homepage redirect problem without guessing or deleting working rules.
