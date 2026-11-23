# From foundation to the live Nerix pilot

This is remaining implementation and acceptance work, not a claim that adding API keys activates missing services. Existing Sarah source informed tone, privacy, callback and transfer design. Its carrier/server code was not copied wholesale into this new multi-tenant app.

## 1. Review the foundation on Replit

Create the owner account, inspect the two isolated demo workspaces, import a real-format sample with non-sensitive or fictional data, test 90-second/no-answer billing, and try a location-scoped staff invitation. Keep separate databases for demo and pilot. Complete an actual browser review at laptop/mobile widths after upload; DOM tests do not validate CSS layout.

## 1A. Activate website text chat

The chat adapter, visitor widget, human inbox and follow-up queue are implemented in v0.2.0. Follow `CHAT-SETUP.md`: configure server Secrets and a persistent hosted Node endpoint, complete a real OpenAI response test, then put the public backend URL into the static website's `chat-config.js`. Confirm both Nerix website origins, agent availability, cross-domain polling, model fallback and an actual human reply before advertising live staffed chat.

Use the existing New client chat site flow for approved client pilots, with their public knowledge, origin and permitted workspace/company/location scope. Agree separate chat pricing, human staffing and privacy/retention terms before customer rollout. The voice rates do not automatically apply to chat; automatic chat debit and billing are not implemented.

## 2. Build and test live browser voice

Use a securely configured Nerix OpenAI account, the approved Dentive pitch/public knowledge and the selected mini model from the roadmap if available to that account. Implement ephemeral browser session credentials, server-authorized tools, accurate usage capture, interruptions and bounded sessions. Never expose the API key in frontend JavaScript. Measure token usage and costs instead of assuming a fixed provider minute price.

Check Alex’s identity (“Nerix Global”), natural contact recognition, prior-human-call attribution, objections, interruption, polite refusal, accurate email/interest distinctions and immediate suppression. Check Sarah against the provided conversation style. Preserve the independent agent profiles.

## 3. One carrier / one call

Provision the separate Linux Asterisk/controller service and one approved SIP carrier using its confirmed settings. Confirm authorized caller ID, outbound eligibility, target countries and a controlled test destination. Implement media transport, answer/AI-attachment timestamps, DTMF/IVR behavior and signed, tenant-bound call events.

Replace fixed simulation reservations with bounded live reservation extensions, gateway-enforced maximum paid duration, heartbeats and recovery after API/worker/controller failures. Verify no ringing charge, no continued service beyond paid bounds and duplicate-event reconciliation. Keep one simultaneous live call until proven stable.

## 4. Transfer and calendar acceptance

Implement the state machine: prospect agrees → closer dialed → private briefing → explicit acceptance → bridge confirmed → AI detaches → AI billing ends. A SIP redirect alone is insufficient. Test voicemail, press-2 decline, unavailable staff, hangups, private audio isolation and human conversation after AI exits.

If transfer fails, save a callback with name, phone, business and reason. Use the existing task workflow. Connect one chosen calendar provider with validated working hours, timezone, buffers, availability recheck and idempotent event creation. Prefer an earlier available full slot when appropriate; only say “booked” after provider confirmation. Until then keep the UI’s “meeting request” label.

## 5. Safepay after approval

Obtain FBR/proprietor documents, an eligible Meezan account and Safepay approval for prepaid AI services and the correct merchant identity. Verify USD/PKR/GBP/EUR/CAD/AED/SAR presentment eligibility, PKR settlement, actual FX costs, original-method refunds and saved-card permissions.

Implement the current official hosted-checkout API/SDK for that approved merchant. Use server-generated original-currency quotes with timestamp/expiry, provider references, signature verification and an authoritative provider-status check. Never credit from a browser redirect. Persist every event once and map settled success to one ledger entry; test duplicate/out-of-order/forged/expired events and unknown payment IDs.

Track gross payment, USD wallet credit, PKR settlement, FX, fees and taxes separately. Do not add a customer surcharge without explicit supported merchant/network approval and disclosed terms. Publish the approved unused-paid-credit refund terms and correct legal identity before accepting cards.

Replace manual refund confirmation with a tested provider integration. Allocate partial and full refunds to original payments/currencies, retain pending reservations, reconcile terminal outcomes, and protect against double submissions. Confirm the provider’s actual refund window and procedure for older balances.

Then implement optional saved-token recharge: separate customer authorization, threshold, USD amount >=100, currency-conversion terms, monthly cap, one durable attempt at a time, idempotent provider requests, decline/authentication recovery and easy revocation. Never store PAN/CVV or treat saved bank details as bank-debit permission.

## 6. Referral economics and internal operations

The owner’s intended reward is PKR5,000. The coded pilot review uses the **proposed** 30-day waiting period and PKR10,000 verified contribution threshold. Obtain owner approval of written partner terms before offering these as final commercial terms.

Replace manually reviewed contribution with measured consumed-service revenue minus AI/carrier/payment/tax/refund costs. Add provider disputes and chargebacks before paying commissions automatically; the current manual review is not a fraud-detection system. Match real business identity, not only an email; check self-referrals, related customers and duplicate businesses. Verify identity/payout account through a private approved process. Do not put CNIC/educational scans in lead notes.

Add closers and support staff through internal roles and explicit customer assignments. The app already supports session revocation and audit. Live recording/transcript access and more granular permissions must be designed before those data exist.

## 7. Production and scale

Choose the actual Node/API/worker hosting, dedicated PostgreSQL, monitoring, trusted origins, domain and encrypted backups. Complete the owner’s legal/merchant disclosures, privacy and retention policies. Add email verification/reset/delivery, MFA for owners, operational alerts, provider-health monitoring and a verified disaster-recovery run.

Use sustained pilot metrics to validate margins before discounts or more concurrency. The 500-call/day goal and 20–30-channel ideas are later capacity targets, not guarantees or features of this release. Advanced support/PMS and external CRM adapters require provider-specific implementation and testing.

The marketing website and Dentive/Sarah deployment remain separate. No DNS, hosting, merchant account or phone routing is changed by installing this ZIP.
