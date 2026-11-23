# Public wording that still says "in development" (left unchanged on purpose)

You asked for no changes to pricing and models, and public claims are your decision, so these were **not** edited. Update them yourself (or ask the Replit Agent) when you go live:

- `website/index.html` line ~71: "Now welcoming early-access enquiries. Platform in development."
- `shared/faq.ts`, entry `live-status` ("Is the full calling platform live today?") and the generated `docs/CUSTOMER-FAQ.md` (run `npm run faq:build`, which also rebuilds the chat widget bundle).
- `server/chat-policy.ts`, `NERIX_KNOWLEDGE`: the sentence saying the calling platform is in development.
- The website advertises outbound "Alex" lead-generation. Outbound calling is **not** connected to the gateway in 0.4.0 (inbound reception with live transfers only). Consider rewording until outbound exists and its consent rules are reviewed.
- `tests/faq.test.ts` checks some of these sentences; update the expectations together with the text.
