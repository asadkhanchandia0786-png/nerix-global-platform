# Nerix Global — Alex Build Roadmap

Prepared: 9 October 2026  
Updated: 12 October 2026 — see sections 13–16 for commercial decisions and sections 20–23 for the internal account, preview, FAQ and website SEO updates.  
Status: the portable customer dashboard and FAQ/human chat foundation are implemented. Live voice, carrier, calendar and real card-payment activation remain separate work.

## 1. What we are building

Nerix Global will be one voice-agent platform for multiple businesses and industries. Each customer gets its own workspace, people, leads, agent settings, calling rules, usage, and prices. Dentive AI is the first owned internal company workspace, with Nerix fees waived; Alex is its outbound agent. Its live calling pilot is still pending.

The first useful release is the Dentive outbound workflow: import leads, run an eligible campaign, hold a conversation, save an accurate outcome, transfer an interested prospect, and arrange a callback or meeting. Other customers will use the same platform with their own settings.

Reception and customer support are the next release on the same foundation. A responsive web application is sufficient initially; separate iOS and Android applications are deferred.

| Item | Decision |
|---|---|
| Business and product | Nerix Global platform; customizable agent names, including Alex |
| Website | nerixglobal.com, using the domain already owned |
| Customer application | app.nerixglobal.com |
| First customer | Dentive AI |
| Initial AI model | OpenAI gpt-realtime-2.1-mini, subject to access and capacity in the Nerix API account |
| Outbound services | Lead Generation and Follow-up modes |
| Later services | Basic reception/support and advanced support |
| Initial outbound rate | $0.30 per billable minute |
| Initial basic support rate | $0.50 per billable minute |
| Initial advanced support rate | $0.75 per billable minute |
| Pricing flexibility | Industry defaults and negotiated customer overrides, managed by Nerix |
| Payment model | Prepaid money balance; usage deducted by the second |
| Deployment approach | Develop in a new Replit project; use separate Nerix data and credentials |
| Existing Dentive/Sarah system | A reference for proven behavior; inspect its source before deciding what can be reused |

The model name is listed in the current [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini). Its API is token-priced, so the Sarah test result below $0.10/minute is a useful starting observation, not a guaranteed cost ceiling.

## 2. Accounts and services

The same laptop can be used. Deployed cloud services will run without the laptop being switched on.

Reuse an existing vendor account where its permissions and plan allow it, but create dedicated Nerix projects, databases, keys, and billing records. A new project does not create a new free allowance unless the vendor explicitly provides one.

| Service | Purpose | What to prepare | When needed |
|---|---|---|---|
| Namecheap | Domain registration | Keep the existing Nerix domain and registrar account | Already available |
| Replit | Development and preview | A new project named nerix-global; separate project secrets | First build |
| GitHub or another Git remote | Version history and recovery | A private Nerix repository, connected to the project | First build |
| Neon | PostgreSQL database | A dedicated Nerix project, with separate development and production data | First build |
| Cloudflare | DNS and hosting for website/dashboard | Nerix domain configuration and separate application deployment | Preview deployment |
| OpenAI API | Voice model | Nerix account/project, API billing, server credentials, usage alerts | Voice testing |
| Resend | Account verification, invitations, receipts and operational email | Verify the Nerix sending domain; use a dedicated API key | Authentication email testing |
| Oracle or another Linux VM host | Persistent backend, scheduler and telephony services | An eligible account and isolated server resources | Phone-call integration |
| VoIPstudio or an approved SIP provider | Phone numbers and telephone network access | Confirm supported connection method, campaign permissions, costs and capacity | Phone-call integration |
| Payment processor | Receive customer top-ups | Choose a provider that supports the actual legal entity, country and prepaid service | Before accepting online payments |
| Object storage | Private uploads and optional recordings | Private bucket with retention settings | Before retaining larger files |
| Monitoring and backups | Detect failures and recover data | Error alerts, health checks, billing reconciliation and restore procedure | Before live pilot |

Resend's sending service and a staff email inbox are separate needs. The Nerix team still needs an inbox for replies and business correspondence. Add storage and monitoring using the existing providers where practical; each function does not require a new vendor account.

[Replit supports project-specific secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets). Keep credentials out of prompts, source control, browser code, and screenshots. Add them directly to the project's secret settings.

Oracle's [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/) permits one free account per person and requires accurate contact and billing information. It says contact and payment-card information are used for identity verification. Its complete duplicate-account detection methods are not published there. A different email or borrowed name does not establish eligibility. Use existing eligible resources, a correctly owned and eligible account, or an approved paid account; development can proceed before this is settled.

## 3. Proposed application structure

This is an architectural recommendation, not a list of systems already running.

| Component | Proposed implementation | Responsibility |
|---|---|---|
| Public website and dashboard | React with TypeScript | Marketing pages, signup, customer and administrator screens |
| Application API | Node.js with TypeScript | Permissions, leads, rates, wallets, integration endpoints |
| Authentication | Better Auth backed by PostgreSQL | Signup, sign-in, sessions, verification and recovery |
| Business database | Neon PostgreSQL | Customer records, operational data, durable jobs and financial ledger |
| Background worker | Persistent Node.js process with database-backed jobs | Campaign scheduling, callbacks, reconciliation and retry handling |
| Call controller | Asterisk plus a private controller service | SIP calls, call state, DTMF, bridges and warm transfers |
| Voice integration | OpenAI Realtime adapter | Conversation audio, approved tools, model usage and outcomes |
| File storage | Private object storage | Lead upload originals and recordings where enabled |
| Telephony connection | Tested carrier adapter | Customer SIP or numbers supplied through Nerix |

[Cloudflare documents deployment of React applications](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/). The initial production proposal puts the web frontend there, with the Node backend, persistent worker and call controller on Linux infrastructure. Keep those services separately deployable even if the small pilot shares a server.

[Better Auth supports PostgreSQL and common server frameworks](https://better-auth.com/docs/installation). It is an application library; it does not automatically implement Nerix's company/location permissions. Those checks belong in the application.

[Asterisk ARI exposes channels, bridges and media controls](https://docs.asterisk.org/Configuration/Interfaces/Asterisk-REST-Interface-ARI/). This supports the proposed call controller, but audio transport, codec compatibility, transfers and recovery still require implementation and testing.

The ordinary [Cloudflare web proxy is for HTTP/HTTPS](https://developers.cloudflare.com/dns/proxy-status/limitations/). SIP and call media must use a suitable telephony endpoint and firewall configuration, not simply the dashboard's proxied domain. Do not expose the Asterisk administration interface publicly.

The application server decides whether a call, charge, calendar action or transfer is allowed. The AI can request an action through a tool, but cannot choose its own permissions, rates, customer identity, or wallet balance.

## 4. What is shared and what each company changes

| Shared platform behavior | Customer-configurable behavior |
|---|---|
| Tenant isolation and permission checks | Company names, locations and team members |
| Prepaid ledger and zero-credit enforcement | Agent names, supported voices and languages |
| Audited rate resolution | Industry and approved business knowledge |
| Call event tracking and usage calculation | Scripts, qualification questions and outcomes |
| Suppression checks and scheduling enforcement | Eligible campaign schedules and callback preferences |
| Reliable transfers and booking tools | Transfer destinations, available staff and calendars |
| Import validation and preserved lead history | Spreadsheet column mapping and custom fields |
| Integration authentication and logging | Enabled supported CRM/dialer/calendar connections |

Dentive's Tuesday/Wednesday follow-up preference is a saved preset, not a restriction for every customer. A travel business can use different days, questions and booking rules without requiring a separate copy of the software.

A setting change should not require code. A new external software integration usually will: adding a CRM name or uploading its manual does not create an API connection.

Use this hierarchy: organization → companies → locations. Assign owner, company manager, location manager and staff permissions at the appropriate scope. A separate Nerix platform administrator controls commercial settings and audited support access.

## 5. Prepaid billing specification

Store money as the authoritative balance. Show the balance, applicable price per minute and estimated available minutes. Do not store only a fixed bucket of minutes when one customer can use several services with different prices.

| Example | Available service time before additional fees |
|---|---:|
| $100 at $1.00/minute | 100 minutes |
| $100 at $0.50/minute | 200 minutes |
| $100 at $0.30/minute | 333 minutes 20 seconds |
| $100 at $0.75/minute | 133 minutes 20 seconds |

Charge = billable seconds × applicable per-minute rate ÷ 60.

Use precise fixed-point or decimal arithmetic with sufficient precision for fractional cents. Do not round every call up to a whole minute. Present currency rounded for display while retaining the underlying precision.

**Billing events**

| Call state | Nerix AI service charge |
|---|---|
| Queued or ringing before answer | No |
| No answer or busy without an answered session | No |
| Answered and Alex connected/listening | Yes |
| Answered IVR, hold audio or voicemail while Alex remains active | Yes |
| Alex speaking or waiting for an in-call tool | Yes, within the active billable session |
| Warm-transfer preparation while Alex remains active | Yes, one customer AI session clock |
| Human-to-human conversation after Alex leaves | No further AI service charge |
| AI connection failed before handling begins | No AI handling time to charge; separately reconcile any carrier cost |

The start timestamp requires both answered-call confirmation and an attached AI session. The end timestamp is when AI handling ends. Carrier billing can start at a different event and continue after a transfer. Never charge twice merely because the transfer temporarily uses two telephone legs.

Rate precedence: negotiated customer/service override → industry/service default → platform/service default. Save the selected rate and its version on the call. Rate changes affect future calls from the agreed effective time, not historical calls or a call already in progress.

Each organization starts with one wallet. Company/location spending caps can share that wallet; separate sub-wallets are a later option if a customer needs separate funding.

Before placing a call, the server reserves spending capacity. Concurrent calls must draw from the same safely locked balance. Extend reservations during the call, stop admitting new calls when funds are insufficient, and begin a graceful ending before remaining funds are exhausted. A gateway watchdog must enforce a bounded call duration even if the dashboard or worker disconnects.

Use unique payment and call-event identifiers so a repeated webhook cannot add credit or deduct a charge twice. Failed calls release reservations. Interrupted sessions are reconciled against gateway events and provider records.

Administrator credit changes require a reason and an audit record. Production credits must correspond to a verified payment or a clearly recorded promotional/manual adjustment. Development credits are visibly marked as test money.

Number rental, carrier usage, transfer legs, taxes and any setup/integration charge must be disclosed separately where applicable. Do not imply the $0.30 AI rate includes every destination's telephone cost. Customer wallet funding also does not automatically fund Nerix's OpenAI or carrier account.

## 6. Leads and Dentive follow-up behavior

The first importer supports CSV and XLSX with a preview and column mapping. The Texas sheet is a useful example, not a universal format.

| Input information | How to store and use it |
|---|---|
| Clinic/company name | Lead organization |
| Main phone number | Normalized telephone number with verified country context |
| Follow-up number | Separate callback destination; preserve the original main number |
| Email | Contact email with status: provided, queued, sent, delivered or failed where known |
| FD / OM / Dr | Multiple contacts with front desk, office manager or doctor roles |
| Conversation date | History entry; require explicit date-format selection during import |
| Follow-up date/time | Scheduled action with recipient timezone |
| Comments | Original notes plus reviewed structured fields |
| Outcome | Explicit disposition, not inferred solely from spreadsheet color |

Preserve human-written notes and who made the previous call. If Asad spoke to Alondra, Alex should say “Our team previously spoke with Alondra,” not claim that Alex personally did so.

If a receptionist clearly gives her name in the greeting, Alex can use it. If the name or role is unclear, ask naturally or continue without it. A doctor's or manager's direct answer should trigger the appropriate conversation without forcing a receptionist script.

Giving an email address is not the same outcome as showing buying interest. Alex should say an email was sent only when that action is recorded as completed.

Suggested initial dispositions: New, No answer, Busy, IVR reached, Email provided, Decision maker unavailable, Callback requested, Interested, Meeting booked, Transferred, Not interested, Do not call, Invalid number, and Failed. Each outcome has its own next action.

Dentive's default follow-up rule is approximately seven days later within selected Tuesday/Wednesday windows, using the clinic's timezone. A specific request such as “Monday morning” takes precedence as a request to review: if it conflicts with campaign settings, show the conflict for resolution instead of silently ignoring it.

Lead Generation and Follow-up modes share the same history. A customer can upload a follow-up sheet, or select due leads already in the system. Reimports must not erase previous calls or restore an opted-out number to the dial queue.

“Not interested” ends the active sales sequence. An explicit “Do not call” creates durable suppression for the relevant business scope and survives reimport. Do not implement unlimited redialing until somebody opts out; use bounded attempts, retry spacing, appropriate calling authorization and recipient-local windows.

## 7. Transfer and calendar behavior

**Warm transfer**

1. Alex obtains the prospect's agreement to speak with a person.
2. It identifies an available configured closer and calls that destination while keeping the prospect appropriately informed.
3. It gives the closer a private, short introduction: prospect name, company and requested service.
4. The closer explicitly accepts; a voicemail greeting is not an accepted transfer.
5. The controller bridges the prospect and closer, confirms the connection and removes Alex.
6. AI billing ends when Alex leaves. The two people remain connected.
7. If no closer accepts, Alex offers the configured callback or booking option and creates a staff task with concise notes.

A simple SIP redirect is not a complete implementation of this workflow. Test privacy of the closer briefing, acceptance, hangups, busy destinations and recovery.

**Booking**

The Dentive preset should check the requested time, appointment duration, timezone, staff availability and buffer rules. If 2:00 is unavailable and a full eligible 1:30 slot is available, offer 1:30 before a later 2:30 slot. If the prospect declines, offer a small set of available choices on that day.

Recheck before saving, protect against duplicate bookings and only announce success after the calendar confirms the event. If the integration is unavailable, record a request for staff instead of inventing a booking.

Other companies can choose different appointment durations, availability preferences or a follow-up-only workflow. Implement one calendar provider first and add others through tested adapters.

## 8. Build order and completion gates

| Phase | What we build | Evidence required before proceeding |
|---|---|---|
| 1. Project foundation | New project/repository, database migrations, authentication, organizations, companies, locations and roles | Two test organizations cannot access each other's data; permissions are enforced by the API |
| 2. Prices and wallet | Industry/service defaults, negotiated rates, ledger, reservations, simulated call events and usage dashboard | Exact second-based deductions, duplicate-event safety and concurrent zero-credit enforcement |
| 3. Leads and campaign setup | Import preview, contacts/history, dispositions, recipient timezones, suppression and leadgen/follow-up queues | Reimport preserves history and suppression; scheduling selects only eligible due leads |
| 4. Agent configuration and browser tests | Name/voice settings, approved knowledge, Dentive preset, safe tools and OpenAI usage capture | Alex handles representative scripts and records accurate outcomes with measured cost |
| 5. One carrier and one live call | VM, Asterisk/controller, media adapter, answer detection, DTMF/IVR and hangups | Controlled calls to authorized test numbers; reliable audio and timestamps; no ringing charge |
| 6. Dentive end-to-end pilot | Warm transfers, one calendar, staff tasks and automated follow-up scheduling | Transfer, callback and booking scenarios pass; summaries and histories remain accurate |
| 7. Customer onboarding and payments | Signup/industry selection, quoted rate display, top-ups, payment webhooks, admin support tools | Real payment validation, replay/refund tests, customer separation and transparent invoices |
| 8. Reception and support | Forwarded inbound calls, business knowledge, language settings and basic/advanced plans | Tested routing, unavailable-staff behavior and correctly authorized integrations |
| 9. External dialer/CRM mode | One selected external platform adapter, signed webhooks and data mapping | Lead context enters correctly; outcomes, usage and follow-ups return without duplication |
| 10. Production rollout | Domain deployment, alerts, backups, restore test, capacity limits and cost review | Limited pilot performs reliably; billing reconciles; measured economics justify expansion |

Start with one carrier, one language, one calendar integration and one simultaneous phone call. Increase concurrency only after transfers, wallet reservations and provider capacity are verified. A 500-call/day target is a capacity goal, not a guaranteed conversion result or an assumption that every call lasts 30 seconds.

The customer-facing pricing and data model should accommodate support from the start, but advanced support integrations do not need to delay the first outbound pilot.

## 9. Customer onboarding choices

| Choice shown to the customer | What we must support |
|---|---|
| Nerix dashboard + customer's SIP | Customer supplies an approved connection; uploads and outcomes stay in Nerix |
| Existing dialer/CRM + Alex | A supported external integration sends context and receives outcomes; its billable events are mapped to Nerix |
| Complete Nerix setup | Nerix provisions the supported telephone connection and explains number rental and carrier charges |

Show connection status honestly: Requested, Under review, Configured, Test passed, or Active. Do not display every carrier or CRM as instantly compatible.

Selecting an industry shows its applicable rate before the first top-up. A negotiated rate is visible to that customer, with an effective date. Customers configure their workflows; they cannot set their own billable rate.

The business must provide its identity, use case, target countries, caller ID authorization and appropriate calling authorization. Campaign eligibility must be evaluated for the destination and call type. AI disclosure and using a customer's SIP do not by themselves settle those requirements.

## 10. Cost and profitability validation

The unit that matters is total campaign cost divided by billable customer minutes, alongside task success. Failed attempts and other unbilled work can still create expense.

OpenAI's [Realtime cost documentation](https://developers.openai.com/api/docs/guides/voice-latency-cost) explains that conversational sessions accrue text/audio input and output token costs. Context and caching affect cost; merely keeping a connection open is not itself the billing unit. Capture reported usage rather than multiplying session duration by an assumed OpenAI minute price.

At the time of this plan, the mini model page lists audio input at $10 and output at $20 per million tokens, plus text and cached-input rates. These are provider prices, separate from Nerix's $0.30/$0.50/$0.75 service rates. Recheck pricing before launch.

**Illustrative outbound economics — hypothetical costs, not provider quotes**

| Total variable cost per customer-billable minute | Revenue at $0.30/minute | Contribution before fixed overhead | Contribution margin |
|---|---:|---:|---:|
| $0.10 | $0.30 | $0.20 | 66.7% |
| $0.15 | $0.30 | $0.15 | 50.0% |
| $0.20 | $0.30 | $0.10 | 33.3% |
| $0.25 | $0.30 | $0.05 | 16.7% |

For example, 1,000 billable outbound minutes produce $300 of AI-service revenue. If the measured variable cost is $0.15/minute, $150 remains before fixed infrastructure, staff, refunds and other overhead. Separately invoiced carrier revenue and expense must be included consistently when calculating company profit.

Track AI usage, transcription if separately enabled, call attempts, telephone legs, storage, hosting, payment fees and integration costs. Allocate unbilled campaign costs across the relevant usage instead of silently ignoring them.

Monthly operating cost = fixed infrastructure + actual AI usage + telephone costs + storage/email + payment fees + operations. Development labor is a separate cost. Do not quote a fixed project total until hosting, payment eligibility, carrier terms, integration scope and expected concurrency are known.

Free plans can reduce early cash spending; they do not prove the service will remain free at production scale. During the pilot measure median and high-cost calls, longer IVRs, short rejections, warm transfers, no-answer attempts and follow-ups. Publish a negotiated discount only after these measurements support it.

## 11. Reliability and data handling needed for launch

Verify the parts where a mistake would expose customer data, lose money or place an unwanted call:

- Server-enforced organization/company/location access, including exports and AI tool calls.
- Scoped credentials and signed integration events; mask secrets and sensitive content in logs.
- Audited administrator support access and credit/rate changes.
- Persistent opt-outs, deduplication, bounded retries and recipient timezone handling, including daylight-saving changes.
- No live marketing calls from imported lists until the applicable eligibility checks are satisfied.
- No collection of card numbers, bank details or unnecessary sensitive information during the lead-generation workflow.
- Recordings disabled by default until a company's disclosure, access and retention choices are configured.
- Resumable jobs, a campaign pause switch, per-customer concurrency limits and spending cutoffs.
- Backups with a demonstrated restore, and alerts for stalled calls, failed transfers and mismatched charges.

Names, emails and phone numbers are still personal data. Restrict access and retention even though Alex is not collecting banking information. Any later use involving regulated or sensitive workflows needs its own requirements before it is enabled.

## 12. The first practical build milestone

Create the new Replit project and dedicated development database first. Build a functioning foundation with simulated calling so we can review customer access and billing before spending money on calls.

**Screens in the first milestone**

| Screen | Initial behavior |
|---|---|
| Sign-in and workspace selection | Authenticate a real session and select an authorized workspace |
| Customer overview | Show balance, service rates, estimated minutes and test usage |
| Leads | Import preview, mapping and saved lead/contact history |
| Campaigns | Create a campaign and choose Lead Generation or Follow-up mode |
| Agent settings | Store name, industry, script, language and selected voice |
| Call history | Show clearly labeled simulated events, outcomes and charges |
| Team and locations | Manage scoped access |
| Nerix administrator | Create industries, set rates, inspect audited customer records and pause service |

**Developer handoff for that milestone**

Build a TypeScript web application using the proposed portable architecture. Initialize database migrations and separate development configuration. Implement real authentication and tenant-scoped server endpoints. Create two isolated test organizations, with Dentive AI as one preset. Add configurable rates of $0.30 outbound, $0.50 basic support and $0.75 advanced support.

Implement a durable wallet ledger with test credits, rate snapshots, reservations and idempotent simulated call events. Store monetary values precisely. Demonstrate that 90 billable seconds at $0.30/minute deduct $0.45, while a ringing-only attempt deducts $0.00. Demonstrate that simultaneous calls cannot spend the same remaining funds twice.

Add the lead importer with column mapping and explicit country/date-format selection. Save multiple contacts and their roles, original notes, previous caller identity and callback timing. Preserve existing suppression during reimport.

Keep simulated calls visibly labeled. Place all telephony, AI and payment actions behind server-side adapters and disabled live-operation flags until their own integrations are ready. Build useful empty and error states. Do not replace missing integrations with fake “connected” badges.

Keep credentials in project secrets. Document local/Replit startup, database migrations and the current implementation status in the repository. Include meaningful checks for tenant isolation, duplicate events, concurrent spending and import suppression.

**What is needed from the owner as each phase begins**

| Phase | Owner-provided information |
|---|---|
| Foundation | Access to the new project/database and the final logo asset when available |
| Voice tests | Nerix OpenAI credentials entered securely, approved Dentive pitch and allowed answers |
| Telephone tests | Approved carrier connection, authorized caller ID and controlled test numbers |
| Transfers and booking | Closer destination, working hours, timezone, chosen calendar and meeting duration |
| Follow-ups | Sample lead file, explicit date format, follow-up windows and retry preferences |
| Paid onboarding | Actual legal business details, supported payment account and published customer terms |
| Support release | Approved support knowledge and credentials for each specifically supported integration |

The next implementation deliverable should be this foundation with simulated calls. Oracle registration and live carrier configuration are dependencies for later phone integration, not prerequisites for beginning the application.

## 13. Decisions and requirements added on 11 October 2026

This update records the owner's current requirements and proposed commercial policies. It takes precedence over earlier planning where it changes payments, team access or sales commissions. The marketing website is live; this roadmap is not evidence that the Nerix application or payment integration has been implemented.

### 13.1 Confirmed project requirements

| Area | Requirement |
|---|---|
| Internal Nerix team | The owner can invite, add, suspend and remove managers and staff from the administrator dashboard. They can help investigate customer account and service issues within their granted permissions. |
| Access boundary | Nerix's internal support team is separate from a customer's own company/location staff. Giving someone a customer role must not grant platform-wide access. |
| Agent behavior | Support should retain the warm, calm Sarah style from the supplied Dentive source. Cold calling uses a separate smart, friendly, conversational profile, light situational humor and no aggressive sales pressure. These profiles coexist in the same project. |
| Sales referrals | Referral partners arrange meetings with interested companies. Nerix's founder or designated closers handle the sales conversation. Clients onboard and pay Nerix directly through the website. |
| Referral amount | The intended one-time referral commission is PKR5,000 for a qualifying new paid customer; meetings and free/demo registrations alone do not earn it. Qualification and payout timing below remain proposals. |
| Setup fee | Nerix will not charge a setup fee. This does not change Dentive AI's existing commercial terms. |
| Future hiring | Add dedicated closers and customer support people as the business grows, so the owner does not need to attend every meeting or handle every support request. |
| Partner verification | Collect appropriate identity and payout verification before paying a partner. Educational documents were suggested by the owner; they are not a substitute for verifying referrals and actual customer payments. |
| Payment provider | Safepay is the preferred candidate, subject to merchant approval for the actual business model and legal entity. |
| Dentive payments | If Safepay is suitable and approved, plan a Safepay integration for Dentive AI as well. The supplied Sarah project currently uses manual Payoneer verification. No migration or deployment is authorized by this note alone. |
| Registration | Start with CNIC, personal FBR NTN and appropriate banking as a proprietor, subject to provider approval. Incorporation is deferred until earnings justify the fees. Nerix Global and Dentive AI are distinct businesses intended to become separate companies; this is not a decision to combine them into one company. |
| Banking | Meezan is the preferred settlement bank. An eligible business/proprietor account is preferred for receipts; the exact Asaan account's eligibility remains unverified. A receiving account by itself does not enable card charging. |

### 13.2 Internal team access design

Recommended initial roles:

| Role | Initial access |
|---|---|
| Owner | Manage internal users and permissions, commercial rates, merchant configuration and other protected settings. |
| Operations manager | Review assigned customers, campaigns, service health and support cases; pause service where specifically authorized. |
| Support staff | View assigned customer account status, usage summaries and support cases, and record troubleshooting actions. |
| Closer | View assigned meetings, relevant lead context and sales outcomes. |
| Referral partner | Submit and track their own referrals and commission status, without browsing customer accounts or balances. |

Permissions must be enforced by the server, not only by hiding buttons. Give support access to assigned customers and necessary information by default. Call recordings, transcripts, exports, refunds and credit adjustments need explicit permission; they must not be automatically included in a generic staff role. Staff cannot see provider secrets or full payment-card data.

Record invitations, permission changes, customer access and sensitive actions in an audit trail. Removing or suspending a team member must invalidate their sessions and access on subsequent requests. Include meaningful checks for customer isolation, role restrictions and access revocation when implementing this feature.

### 13.3 Confirmed USD deposits and proposed refund terms

Base customer prices and wallets use **USD**. Customers may pay the quoted equivalent in an approved selected checkout currency, as specified in section 15. The first deposit and all normal later top-ups must be **at least USD100**; larger amounts are allowed. This confirmed rule replaces the earlier PKR25,000 suggestion. Rare, private, owner-approved smaller later payments such as USD5 or USD10 may be offered after a customer's request; they are not public options and do not replace the initial minimum. A guided demonstration remains a proposal. The minimum deposit alone does not establish that a PKR5,000 referral commission is affordable.

Advertise the wallet credit, applicable service rate, taxes and any separate charges before checkout. If a top-up credits the full advertised amount, processor fees are a Nerix expense. Keep the cash needed for unconsumed services and refunds available; do not treat the entire prepaid deposit as earned profit.

Confirmed refund direction: approved refunds return the full unused **paid** balance without deducting Safepay processing charges. The operational terms below still need to be published and matched to supported provider routes:

- Refund the unused paid balance when the customer closes the account, after reconciling active calls, pending charges and any payment dispute.
- Correctly delivered, consumed minutes are normally not refundable. Reverse duplicate or incorrect billing and compensate for confirmed service failures.
- Refund to the original payment method; do not divert a refund to a referral partner or unrelated account.
- Describe the policy before payment and retain the accepted version. Mandatory customer rights and the merchant agreement take precedence where applicable.
- Nerix absorbs the original Safepay processing charges and applicable processing taxes for approved refunds, rather than deducting them from the customer's unused paid balance. Safepay does not reimburse those costs to Nerix.

This is a commercial proposal, not a statement that identical refund terms are legally valid in every customer's country.

### 13.4 Proposed commission rules and controls

Use **Pending → Qualified → Paid** commission states, with **Cancelled/Reversed** for invalid referrals or reversed payments. Waiting 15 or 30 days by itself does not establish that a client is genuine or profitable.

Recommended qualification:

1. Register the referral before the introduction; match it to one genuinely new customer business. Prevent duplicate claims, self-referrals and undisclosed partner-controlled customers.
2. The customer passes normal onboarding, pays Nerix directly, and the payment settles. A screenshot or demo registration is not evidence of cleared funds.
3. At least **30 days** pass after the first settled payment.
4. The customer has actual, authorized, paid usage. The recommended initial buffer is **PKR10,000 of earned contribution** before paying the PKR5,000 commission; validate this threshold against pilot costs and agree it with partners in advance.
5. There is no unresolved refund or payment dispute. Reversed payments cancel qualification; partial refunds require recalculation using the remaining earned contribution.
6. Pay qualified commissions in a monthly batch with a statement. If qualification takes longer than 30 days, the commission remains pending until the conditions are met.

Earned contribution here means revenue from services actually consumed, less associated AI/carrier costs, allocated payment fees, applicable direct taxes and refunded or reversed revenue. It excludes unused customer credit and is calculated before referral commission.

Illustrative economics, assuming the contribution margin already accounts for those variable costs:

| Contribution margin | Consumed service revenue to cover PKR5,000 | Consumed service revenue for a PKR10,000 buffer |
|---|---:|---:|
| 20% | PKR25,000 | PKR50,000 |
| 30% | PKR16,667 | PKR33,334 |
| 40% | PKR12,500 | PKR25,000 |

These are examples, not measured Nerix margins. A customer who pays and then refunds the whole unused deposit generates no service contribution and earns no referral commission.

Thirty days is not the end of card-dispute risk. Keep a reasonable reserve. The written partner agreement should explain how later refunds or chargebacks reverse commission eligibility and, where legally enforceable, offset already-paid commission against future payouts. Do not automatically withdraw money from a partner's bank account.

Verify partner identity and the account used for their payout, and retain documents securely with limited access. Education certificates do not prevent collusion. Customer identity, direct payments, duplicate checks, usage records and the earnings threshold are the relevant controls. Use suitable employment arrangements for later employees rather than assuming that a commission label determines their legal status.

### 13.5 Registration, banking and payment facts checked on 11 October 2026

- [Safepay pricing](https://safepay.pk/pricing): domestic cards 2.9% + PKR30; international cards add 0.3 percentage points. Applicable taxes are additional. Raast is listed at 1.5%. Custom packages are offered for volume or unusual business models; a discount is not guaranteed.
- On a PKR25,000 domestic-card payment, the listed processing charge is PKR755 before taxes. This leaves PKR24,245 in settlement before other applicable deductions; it does not make that amount profit.
- [Safepay refunds](https://safepay.helpscoutdocs.com/article/174-what-happens-to-safepay-charges-when-i-issue-a-refund): from 1 August 2026, original processing charges and applicable taxes remain payable on refunded transactions. There is no separate refund fee.
- [Safepay documents](https://safepay.helpscoutdocs.com/article/152-list-of-documents-you-need-to-provide-safepay): companies require SECP incorporation documents, identity documents, a recent bank maintenance certificate in the company name and the company's FBR NTN certificate. A proprietor's permitted documents differ; approval is still required.
- [SECP registration](https://www.secp.gov.pk/company-formation/registration-of-company/): eZfile supports online name reservation and incorporation. A single owner can consider a single-member company. Name reservation is not completed incorporation.
- [SECP fee calculator](https://www.secp.gov.pk/company-formation/fee-calculator/company-incorporation-fee-calculator/): incorporation fees depend on nominal share capital and filing mode; the calculator excludes the separate name-availability fee. Use the live application challan for the payable total rather than an old fee quotation.
- [SECP eZfile FAQs](https://www.secp.gov.pk/?ind=1733125692099&wpdmdl=54823): company incorporation information is forwarded to FBR for NTN registration. FBR issues the NTN when the submitted information is complete and accurate. Confirm its issuance and arrange company Iris access; SECP does not replace the tax registration.
- An SECP company's merchant account should use its company-name bank account. Do not assume the owner's personal Meezan Asaan account can substitute for it. For an initial proprietorship, confirm the exact Asaan product's business use and processor eligibility before collecting payments.
- For bank/SWIFT wires, request approved incoming-payment instructions from the bank or provider, send an invoice and the correct beneficiary/bank details, agree who bears fees, and credit only verified funds. Sending-bank, intermediary, receiving and currency-conversion costs can apply.
- [Payoneer receiving accounts](https://www.payoneer.com/local-receiving-accounts/) distinguish local networks such as US ACH/UK local transfers from SWIFT receiving routes. Use a specifically enabled SWIFT account for wires; do not assume existing ACH-only details support them. [Payoneer's Pakistan offering](https://pages.payoneer.com/get-paid-pakistan/) supports receiving international business payments without opening banks abroad. Receiving a wire does not itself require US/UK incorporation.
- Future UK incorporation would normally be a [limited company](https://www.gov.uk/limited-company-formation); a US LLC is a separate US structure. Neither plan is a prerequisite merely for choosing Safepay or receiving authorized international transfers in Pakistan.

### 13.6 Decisions needed before paid onboarding

For the initial proprietor launch, confirm CNIC/FBR registration and the appropriate Meezan account; obtain Safepay approval for prepaid AI calling services, USD checkout, settlement terms and both separately identified businesses/domains. Plan distinct company incorporation later. Safepay must confirm the merchant arrangements for each business; common ownership does not make their customer credits interchangeable.

Measure costs with the Sarah reference and the Nerix service configuration before finalizing minimum deposits and commission thresholds. Publish approved service/refund terms and partner qualification terms. Implement hosted checkout, verified payment events, credit-once behavior, refund reconciliation and receipts. Confirm whether both brands can use one merchant account or require separate arrangements; do not assume this from technical integration alone.

These requirements have been saved for the build. No company application, bank account, merchant signup, partner agreement or live payment migration has been submitted or implemented by this update.

## 14. Payment architecture and automatic top-ups — 11 October 2026

### 14.1 Confirmed owner direction

- Start with Safepay if the business is approved; owning a full payment processor is a future possibility, not a prerequisite.
- Begin with CNIC/FBR NTN and eligible banking as a proprietor, deferring SECP incorporation until the business earns revenue.
- Nerix Global and Dentive AI remain distinct businesses with separate customer and financial records, and are intended to become separate incorporated companies.
- Nerix base prices, wallet credits and minimums are denominated in **USD**. Actual customer payments may use an approved selected currency at a quoted conversion rate; see section 15.
- First deposit: **USD100 minimum**. Normal later top-ups: **USD100 minimum**. Customers may fund larger amounts.
- Rare smaller **later** payments, for example USD5 or USD10, require private owner approval following a customer request. They must not appear as normal public checkout options.
- Customers can opt into automatic top-ups, selecting a low-balance threshold and the amount to add. Normal automatic top-ups also follow the USD100 minimum.
- Threshold examples mentioned by the owner include 20% of a defined reference balance or a chosen USD balance such as USD100. Do not display a percentage without explaining its reference amount. An initial fixed-USD threshold is the simplest implementation.
- A customer's authorized payment method is charged for the selected amount; the wallet is credited only after a verified successful payment.

The stated USD/minimum rules belong to this Nerix build. Dentive's existing rates and setup terms are not automatically overwritten. Confirm its commercial configuration separately when implementing its Safepay migration.

### 14.2 What we build and who moves money

| Component | Responsibility |
|---|---|
| Nerix application | Checkout entry, USD wallet ledger, minimums, private exceptions, top-up preferences, payment status and receipts. |
| Safepay or a contracted acquiring bank | Secure payment credential collection, tokens, payment authorization/capture, refunds and agreed settlement. |
| Meezan account | Receive settlements under the agreed bank/merchant setup. Opening the account does not itself enable international card acceptance or automatic debits. |
| Payoneer/approved bank transfer route | Optional customer-initiated transfers using the provider's instructions, verified before crediting the wallet. |

Building our checkout and internal usage-credit ledger does not require us to operate a third-party payment processor. Operating a Safepay-style payment business is a separate regulated venture with banking/network relationships and financial/security operations. It is not a small website addition, and fees do not disappear merely because the checkout is branded Nerix.

[Meezan's official merchant information](https://www.meezanbank.com/ways-to-bank/) describes an e-commerce gateway with tokenized transactions and recurring payments. It is a potential direct-bank alternative to investigate for rates, USD presentment, international acceptance and off-session eligibility. Do not assume that the product is free or automatically included with a business bank account.

### 14.3 Automatic top-up implementation proposal

[Safepay's tokenization documentation](https://safepay-docs.netlify.app/concepts/tokenization/introduction/) explicitly covers automatic top-ups triggered by a low customer balance. Its [payment modes](https://safepay-docs.netlify.app/concepts/payment-modes/) distinguish merchant-initiated saved-card payments from ordinary customer checkouts.

Recommended flow:

1. A customer completes an initial hosted payment and separately opts into automatic top-ups. Save their approved token/reference, not raw card numbers or CVV.
2. Show the threshold, top-up amount, payment method, agreed spending cap and a clear switch to disable the feature. Retain the version of the authorization accepted by the customer.
3. When the available wallet balance reaches the chosen threshold, create one durable recharge job. Recheck consent, limits and account status before charging.
4. Request the approved saved-method payment from the provider. A threshold crossing or a browser redirect is not proof of payment.
5. After provider verification of successful payment, post one wallet credit and receipt. Duplicate events and simultaneous calls must not cause repeated credits or duplicate charges.
6. On decline, insufficient funds or required customer authentication, notify the customer and offer ordinary checkout. Do not invent credit or bypass normal insufficient-balance call controls.
7. Revocation disables future automatic attempts. Keep an audit trail of preferences, consent, attempts, successful payments and cancellations.

Example: a customer chooses **below USD20 → add USD100**. A successful USD100 charge adds USD100 to the service wallet. If the customer's bank requires another authorization, the payment remains incomplete until they finish it.

Monthly subscriptions and threshold-based recharges are different triggers. Do not substitute a calendar subscription for the customer's low-balance rule. Confirm merchant enablement, supported methods, international saved-card charging and applicable limits with the provider before activating live recharges.

### 14.4 Private smaller payments

Normal public checkout and API endpoints must enforce USD100 as the minimum. A staff member cannot bypass this simply by changing the amount in a browser request.

For an approved lower later top-up, create a one-time exception bound to the customer, permitted amount, currency and expiry, with the owner's reason and approval recorded. It can enable a private payment request if supported, or a documented bank-transfer credit after actual receipt. Consume the exception once.

Manual entry means recording a verified paid amount with its evidence and unique payment reference. Free promotional credit is a separate explicit owner action with a separate ledger type. Neither grants a referral commission merely because a balance changed.

### 14.5 Transfers and USD settlement

Existing Payoneer accounts can serve as optional transfer routes only under their actual receiving-account instructions and approved business usage. US ACH, UK local transfers and international SWIFT are distinct rails; do not reuse an ACH-only route for a SWIFT transfer.

Ordinary wire transfers are initiated by the customer. Their bank details or a prior wire do not grant Nerix authority to pull future money from their account. Bank debits require a specifically supported payment method and valid authorization; the initial automatic top-up proposal uses provider-approved saved-card payments.

The owner wants **PKR settlement into Meezan**. Safepay's public Services Agreement, clause 17.2, specifies PKR settlement and the acquiring bank's transaction-date exchange rate for non-PKR transactions. Confirm the actual merchant's enabled checkout currencies, FX charges/rate, fees, reserve and bank eligibility. Preserve customer USD credits, original charged currency/amount and PKR settlement records separately.

### 14.6 Launch gates

Before live payments, obtain merchant approval for the correct proprietor identity and each business, the appropriate Meezan account/certificate and FBR documents, USD charging/settlement terms, and saved-method top-up approval. Build and test manual hosted payments and their verified credit/refund ledger first, then enable automatic recharge once duplicate-charge prevention, customer consent, authentication/decline handling and limits are verified.

This update records requirements and design. It has not opened accounts, submitted registrations, built a licensed processor or deployed payment code.

## 15. Currency selection, PKR settlement and full unused-credit refunds — 11 October 2026

### 15.1 Confirmed requirements

| Area | Requirement |
|---|---|
| Base pricing | Service rates, wallet balances and normal minimum funding amounts remain in USD. |
| Minimum | First and normal later top-ups buy at least USD100 of credit. Existing privately approved smaller later exceptions remain separate. |
| Currency selector | Initial scope confirmed by the owner: PKR, USD, GBP, EUR, CAD, AED and SAR. Show country/currency names, ISO codes and currency symbols. Pakistan must be selectable as PKR (₨). Broader worldwide currency visibility is deferred. |
| Local payment equivalent | For a USD100 credit purchase, show the selected currency's equivalent at the accepted quote and charge that amount where the merchant/provider supports that currency. |
| Merchant receipts | Settle into the approved Meezan account in PKR under the Safepay merchant arrangement. |
| Refund amount | Return the full approved unused **paid** credit amount. A customer with USD100 of entirely unused paid credit receives a refund corresponding to that USD100; Nerix does not subtract its original processing fees. |
| Who bears costs | Safepay charges the merchant. The owner prefers recovering processing costs from customers, but a separate customer surcharge remains conditional on provider/network permission and an approved checkout/refund policy (section 16). Original fees must not be subtracted from the promised full unused-paid-credit refund. Customer-bank charges are separate. |

A local-currency checkout still purchases USD service credit. For example, choosing PKR changes the payment quote and charge currency, not the USD100 minimum or the service rate stored in the wallet.

### 15.2 Confirmed launch currency scope

The owner has accepted **PKR, USD, GBP, EUR, CAD, AED and SAR** as sufficient for the initial customer base. This supersedes the earlier requirement to show all world currencies at launch. A worldwide estimate catalogue is not required for the first release.

[Safepay's Money API documentation](https://safepay-docs.netlify.app/concepts/money/) lists these seven currencies. Obtain the merchant's definitive enabled currency list before activating live checkout; published API support does not itself prove approval for every currency on this merchant account.

- Offer the seven agreed currencies where enabled for the relevant payment method.
- Show country/currency names, ISO codes and symbols; a symbol alone is ambiguous. Examples include “Pakistan — PKR (₨)”, “United States — USD ($)”, and “United Kingdom — GBP (£)”.
- Currency selection is manual; location detection may suggest a choice but must not force it.
- Keep USD wallet credits and the selected payment currency distinct, with the accepted amount shown before charging.
- Defer additional currencies until the owner requests them and provider support is confirmed.

### 15.3 Conversion quote and accounting design

Use a trusted rate source or a provider-approved quote. Show the USD credit being purchased, actual charge amount/currency, conversion rate and any customer-paid charges before confirmation. Give the quote a timestamp and expiry. Requote an expired price instead of silently changing the charged amount.

The server must validate USD-equivalent minimums and the accepted quote. Do not trust an amount or exchange rate supplied only by the browser. Use the proper minor units and rounding for the selected currency.

Store:

- USD credit amount and service wallet entry;
- original charged currency and amount;
- accepted conversion quote, rate, timestamp and reference;
- provider payment and refund references;
- PKR settlement, applied acquiring-bank rate, fees and taxes.

The quote used to sell USD credit and the provider's later settlement FX are separate accounting facts. Do not promise that a generic mid-market conversion will equal the net Meezan payout. A PKR checkout may already be a local-currency charge; non-PKR transactions are converted for PKR settlement under the provider's terms.

### 15.4 Refund operation

[Safepay's current charges/refunds policy](https://safepay.helpscoutdocs.com/article/174-what-happens-to-safepay-charges-when-i-issue-a-refund), effective 1 August 2026, says the original charges and applicable taxes remain payable and no separate refund fee is charged. The customer's full requested refund is recovered from the merchant's future settlements.

Nerix initiates the approved refund through the supported provider API/dashboard; a customer request alone does not send funds automatically. Keep sufficient merchant cash available to fund the full refund even after settlement and fees have been deducted.

Recommended operation:

1. Stop automatic recharges for an account being closed and prevent the requested credit from being spent during refund processing.
2. Reconcile active/reserved call charges and identify the unused paid balance and its original funding transactions. Promotional credit is not a cash deposit.
3. Approve and reserve the refund amount. Allocate it to the original payments; prevent concurrent requests from refunding the same credit twice.
4. Refund using the original payment method/currency where supported, using the recorded original quote and payment amounts. Confirm multi-currency refund behavior with Safepay rather than applying a fresh arbitrary FX rate.
5. Keep a pending status until provider confirmation, then reconcile the wallet, transaction and receipt. Resolve failures without losing the customer's balance or resubmitting duplicate refunds.

A full unused single payment should be returned in full in its original charged currency. A partial wallet refund must map proportionately to its funding transaction(s). Bank/issuer conversion rates or separate bank charges can affect the customer's statement outcome; promise the original charged amount to the extent supported, not a guaranteed reimbursement of every issuer charge.

### 15.5 Refund limits to confirm

[The Refund API documentation](https://safepay-docs.netlify.app/modify-payments/refund/) supports full and partial refunds and describes a 90-day card-refund limit. An older [dashboard guide](https://safepay.helpscoutdocs.com/article/141-how-to-refund-car-new), updated in 2023, describes 60 days and manual processing beyond it. Confirm the applicable window and approved route for older unused balances.

The old guide also says its PayFast/NIFT bank-refund entry did not itself send the money back. Newer payment-method documentation may differ. Verify refund support by actual enabled method; do not treat a bookkeeping entry as a completed customer reimbursement.

These processing limits do not silently remove the owner's full-unused-paid-credit refund commitment. Agree a permitted process before publishing or enabling refunds, especially for older payments and non-card methods.

### 15.6 Domestic/international rates and FX

[Safepay's published card pricing](https://safepay.pk/pricing) lists domestic cards at **2.9% + PKR30**, with **0.3 percentage points extra for international cards**, excluding applicable taxes. The international-card addition is not a published FX conversion fee.

[Services Agreement clause 17.2](https://safepay.pk/legal/content/services-agreement) specifies PKR settlement and the acquiring bank's transaction-date FX rate for non-PKR transactions. The reviewed public pricing does not establish a separate fixed FX percentage. Obtain written confirmation of the applied rate, any spread or conversion charge, and other bank deductions before calculating margins.

### 15.7 Automatic recharge in a selected currency

The low-balance threshold and USD credit amount remain USD-based. Charge the approved customer's selected eligible currency at an agreed quote, only where Safepay supports merchant-initiated payments in that currency.

[Safepay's tokenization documentation](https://safepay-docs.netlify.app/concepts/tokenization/introduction/) explicitly supports low-balance automatic top-ups; [payment modes](https://safepay-docs.netlify.app/concepts/payment-modes/) describe merchant-initiated saved-card payments. Merchant enablement, card eligibility, currency coverage and any required bank authentication still need confirmation.

Customer authorization must explain how a USD recharge converts into a variable local-currency debit, with a spending cap and an easy disable switch. If the selected currency cannot be used for automatic charging, explain the available method and obtain authorization; do not silently switch the currency.

### 15.8 Safepay onboarding questions

Confirm the seven launch checkout currencies/countries/cards, PKR settlement into the selected Meezan account, exact FX rate/spread and deductions, and automatic recharge permissions for each intended currency. Also confirm original-currency full/partial refunds, applicable refund windows, how to fund refunds after settlement, refund support for every enabled payment method, and whether any disclosed customer surcharge is permitted (section 16).

This update records approved business direction and proposed implementation details. The payment integration, currency selector and refund flow have not yet been deployed.

## 16. Customer bank charges versus Safepay merchant fees — 11 October 2026

### 16.1 Two separate costs

| Cost | Who is charged | Effect |
|---|---|---|
| Customer's issuing-bank costs | Customer, under their own bank/card terms | FX conversion, overseas-payment fees or applicable taxes can make their account debit exceed the checkout amount. These costs are not paid to Nerix. |
| Safepay merchant processing costs | Nerix, under its merchant agreement | Deducted from gross customer payments when calculating the net PKR settlement. Customer-bank charges do not cover or cancel these costs. |

[Safepay Services Agreement clause 8.1](https://safepay.pk/legal/content/services-agreement) makes the merchant responsible for service charges. Its [settlement report documentation](https://safepay-docs.netlify.app/setup-safepay/operations/settlement-file/) defines the net merchant payout after deductions. The customer's issuing bank and the merchant's processor therefore must be accounted for separately.

### 16.2 Illustrative USD100 payment

For an ordinary USD100 international-card checkout, [published standard pricing](https://safepay.pk/pricing) has a 3.2% merchant percentage fee plus PKR30 and applicable taxes. The percentage component alone is USD3.20 equivalent, leaving USD96.80 equivalent before the fixed PKR30, taxes and FX effects. This is an illustration, not an exact Meezan payout quote.

The customer still purchases USD100 of service credit. Their own bank may additionally charge them. Nerix's wallet credit, gross payment and net PKR settlement must not be treated as the same amount.

### 16.3 Owner's cost-recovery preference — conditional

The owner prefers customers to bear processing costs so Nerix retains the intended deposit proceeds. Safepay does not automatically transfer its merchant-fee liability to the customer. Record this preference as pending confirmation, not as an implemented checkout surcharge.

Before adopting an extra customer fee, obtain Safepay's written confirmation of the permitted approach, including acquiring-bank/network requirements (Services Agreement clause 9.2), eligible cards/countries, disclosure, limits, tax treatment, refunds and saved-card recharge authorization. Do not assume a fee is permitted for every debit or credit card worldwide.

Pricing can instead include payment costs within the service's commercial margin. A separate fee, if permitted and chosen, would increase the actual checkout total above the credited amount and requires explicit disclosure. Its calculation must account for the percentage fee applying to the total collected, as well as fixed costs and taxes.

The existing commitment to refund full unused paid service credit remains in force. Do not subtract retained merchant processing costs from that credit. Decide and disclose how any separately charged customer fee would be handled on cancellation before introducing it; do not silently alter the refund policy.

### 16.4 Foreign-currency refund example

The owner reported paying PKR8,900 for a GBP charge and receiving PKR8,100 when the same GBP amount was refunded. Possible explanations include conversion-rate differences, spreads and issuing-bank fees/taxes that were not reversed. The original and refund statements are needed to identify the actual split.

The PKR refund does not establish what the overseas merchant originally received after its own processing fees. A full refund of the merchant's original GBP charge is distinct from reimbursement of every bank charge or a guaranteed identical PKR credit. This distinction applies to Nerix's own refunds too.

### 16.5 Launch scope and status

Initial currencies are confirmed as PKR, USD, GBP, EUR, CAD, AED and SAR. USD wallet pricing, USD100 first/normal-top-up minimums and private approved smaller later exceptions are unchanged. Broader currency visibility is deferred. No payment code, customer surcharge or pricing change has been deployed by this update.

## 17. Foundation application release — 11 October 2026

### 17.1 Deliverable and scope

**Nerix-Global-App-0.1.0.zip** implements the first practical milestone in section 12. It is a portable React/TypeScript, Node/Express and PostgreSQL application for a new Replit project. The ZIP contains source, dependency lockfile, built frontend, the supplied Nerix logo, sample CSV/XLSX imports, setup instructions, this roadmap, release status and the activation plan.

This is a working foundation with **simulated calling and payment demonstrations**, not the completed live telephone/payment platform. Existing Nerix marketing and Dentive/Sarah files, deployments and DNS have not been changed.

### 17.2 Included working behavior

- Real owner/customer authentication, invitations, scoped organization/company/location access, internal team assignments, suspension/revocation and audit records.
- Customer dashboards, leads with CSV/XLSX mapping and preview, preserved human-call context, recipient-local campaign eligibility, retries, durable suppression and follow-up tasks.
- Separate Alex/Sarah agent profiles. Alex identifies Nerix Global and uses a friendly, permission-based approach. Sarah's style/privacy text was reused from the actual supplied Sarah 0.6.16 source. Voice/model settings are preferences; no live speech is generated by this release.
- Exact micro-USD wallet ledger, service-rate snapshots, atomic reservations, idempotent simulation events, no ringing-only charge and abandoned-reservation recovery. Demo funds have no cash value.
- USD100 minimum and one-use private smaller later-deposit approvals; seven-currency illustrative quotes; owner-verified manual receipt bookkeeping; original-currency unused-paid-credit refund allocation and reconciliation. Bookkeeping does not itself transfer money.
- Disabled automatic-recharge preferences, customer support tickets, staff meeting requests, referral review and payout-reference recording. Proposed waiting/contribution conditions remain proposals, pending owner-approved commercial terms.
- Consistent backup/guarded restore and persistent embedded PostgreSQL for preview. A dedicated external PostgreSQL database is required for pilot/production configuration.

The proposed architecture named Better Auth. This implementation uses the supplied Sarah-style Node scrypt and hashed server-session approach instead. The authentication and rollout limitations are documented in the README.

### 17.3 Verification at packaging

TypeScript check and frontend production build passed. **24 automated tests passed** (21 actual database/API tests and 3 DOM workflows), including tenant isolation, access revocation, CSRF, precise billing, concurrency/idempotency, import suppression, timezone/DST checks, deposits, refund accounting, backup restore and persistence. DOM tests exercise owner setup, navigation, profile/lead changes, test checkout and the 90-second simulation through the real API.

A fresh-database built-asset server smoke check passed for startup, health/setup status, authentication protection, CSP and asset/sample downloads. The dependency audit reported zero known vulnerabilities at packaging. Full evidence is included in `TEST-RESULTS.txt`.

No interactive browser layout review, hosted Replit acceptance, external PostgreSQL or live provider transaction was tested. Passing simulations does not validate actual voice quality, phone routing, payments or business profitability.

### 17.4 Next steps

1. Follow `START-HERE.md` in a new Replit project: extract the ZIP, install dependencies, Run, open a new tab, and create the owner account using the Console setup key.
2. Review the two isolated demo workspaces, sample imports, separate tones, team access and billing examples; complete actual laptop/mobile browser acceptance on Replit.
3. Follow `docs/ACTIVATION-PLAN.md` to implement and validate live browser voice, one-carrier calling, real warm transfers/calendar tools and Safepay after merchant approval.
4. Complete production authentication, monitoring, provider reconciliation and controlled acceptance gates before paid onboarding or larger call concurrency.

Live OpenAI Realtime media, SIP/DTMF/inbound routing, private closer briefing and transfer bridging, confirmed external calendar bookings, Safepay checkout/webhooks/refunds, live FX and saved-card automatic recharge all require remaining code and tests as well as approved accounts/credentials. Adding API keys alone does not enable them. The full owner roadmap remains in force beyond this foundation release.

## 18. Website AI/human chat and brand update — 12 October 2026

### 18.1 Confirmed owner requirements

Add a fixed round Nerix-logo website chat launcher. Sarah answers support questions first; a visitor requesting a person gives the reason before contact details. An available human accepts the chat. If nobody joins, save name, email, phone, reason, transcript and contact permission for follow-up. Continue useful AI/help responses while waiting, but stop automatic replies after a human joins. Alex remains the lead-generation agent; Sarah is support. Both website example headers must identify Nerix Global's AI assistant.

The owner also wants to offer chat services to clients alongside voice. Include independent client sites with approved knowledge, supported sales/support tone, domain and workspace/company/location scope. Chat pricing is a separate decision; voice-minute rates do not automatically price chat.

### 18.2 Delivered implementation

**Nerix-Global-App-0.2.0.zip** contains the implemented text-chat OpenAI Responses adapter, saved conversations, scoped staff inbox, reason-first human requests, availability/capacity, atomic competing claims, continued help while waiting, suppression of late automatic replies after human acceptance, and recovery to follow-up when an agent disappears or a wait expires. Customer/internal access and removal still use real server permissions and session revocation. Migration 002 preserves the foundation data. Chat history and follow-ups are included in guarded backups; restored visitor tokens and active staff claims are invalidated, and v0.1.0 backups remain compatible.

**Nerix-Global-Cloudflare-v1.0.2.zip** preserves the previous website and adds the fixed-logo widget, website-chat service/enquiry copy, corrected Alex/Sarah examples and Nerix identity, updated privacy information, site/organization structured data, canonical/sitemap signals and static path redirects. No DNS or published account was changed. Both existing live homepage hosts returned HTTP200 and the existing robots file allowed crawling. These checks do not verify Google's private indexing/ranking state or guarantee a result position. See `docs/SEO-CHECK.md`.

The website must be connected to the actual hosted backend through `chat-config.js`. Its URL is initially blank because no new app deployment exists yet. Disconnected help is explicitly local FAQ/email-draft behavior; it never pretends that the inbox received contact details. A disconnected client widget does not substitute Nerix prices for that client's facts.

Text AI is now implemented, but requires the owner's server-only `OPENAI_API_KEY`, `CHAT_AI_ENABLED=true`, selected model and successful real provider acceptance. The initial text model is `gpt-4.1-mini`, separate from voice models. A durable daily request limit, bounded output/history and labeled provider-failure/quota fallback are included. Request limits are not fixed dollar caps. Human availability requires an open inbox with heartbeats; messages use five-second polling. Automatic email/phone outreach, push notifications, large-scale chat delivery, final client pricing and automatic chat billing remain separate work.

### 18.3 Validation and next steps

All 38 automated application tests passed, along with TypeScript/build, website checks, actual local HTTP startup and a zero-reported-vulnerability dependency audit. The evidence is in `TEST-RESULTS.txt`: foundation, chat security/races/capacity, backup compatibility, visitor-widget-to-staff-inbox workflows and website tabs/calculator/metadata. OpenAI's HTTP contract is tested with a controlled response; no paid external OpenAI transaction or live voice/card transaction was made. Browser layout and hosted cross-domain Replit/Cloudflare acceptance still need owner review.

Follow **Nerix-Global-Chat-Upload-Guide.md** (also `docs/CHAT-SETUP.md` in the app): install the new Replit app, test the human inbox, enable and accept text AI, host a persistent backend with PostgreSQL/HTTPS, put that real app URL into the Cloudflare widget configuration, then deploy the website update into the existing Pages project. Use scoped client sites only with approved staffing, privacy and commercial arrangements.

The remainder of the voice/SIP/warm-transfer/calendar and Safepay roadmap is unchanged in scope and still requires implementation and acceptance. This chat release does not activate those services.


## 19. Pre-upload correction review — 12 October 2026

App 0.2.1 and Cloudflare website 1.0.3 replace the previously delivered ZIP contents. The review preserves the website design and all approved business requirements. It fixes post-restore chat-message collisions, older follow-ups hidden beyond 100 recent chats, human replies disappearing on refresh, stale responses crossing new conversations, expired-session restart, private exception wording in public AI knowledge, public USD100 calculator minimum, client fallback contact/privacy behavior, and deployment/host/origin validation.

Verification: 45 application tests pass, with regressions for the reproduced issues; TypeScript and production build pass. Website structure/DOM checks pass. Exact packaging and fresh-install results are recorded in the app’s TEST-RESULTS.txt and docs/RELEASE-REVIEW.md. No live provider, production database, account or domain was changed.

Next: owner uploads the app to the separate Replit project, completes owner setup, tests the inbox, adds server-only OpenAI settings, hosts a persistent Node backend with a dedicated PostgreSQL database and HTTPS APP_ORIGIN, then enters that actual origin into the Cloudflare chat-config.js and uploads it to the existing Pages project. Live voice and Safepay adapters remain separate implementation/activation milestones.

## 20. Dentive internal company account — 12 October 2026

The owner has installed the app in Replit and created a separate Dentive company login. Dentive AI should become an owned internal company, with no Nerix service charges, credit requirement or deposit. Keep its existing account, people, leads, campaigns, Alex/Sarah profiles and history. The owner explicitly requests an update-only ZIP for this existing project, followed by Shell commands; do not replace the project with a complete application ZIP.

**Nerix-Global-App-0.2.2-Update.zip** contains only new or changed files relative to the installed 0.2.1 base. Migration 003 adds a customer/internal billing classification without automatically changing any company. Only the Nerix platform owner can convert an owned demonstration workspace through **Nerix administration → Customers → Make internal company**, or create a new owned internal workspace. Existing Dentive login credentials remain valid. Conversion removes the remaining fictional credit with an auditable ledger entry, disables recharge and invalidates old checkout quotes. Real customer funds and active simulations prevent conversion.

The converted dashboard shows **Internal company**, $0 Nerix service charges and no top-up or recharge controls. Alex simulations work at a zero balance with a zero Nerix charge while retaining opt-outs, pause controls and concurrency limits. Other customers retain their normal rates and USD100 first/normal deposit minimum. A customer or public signup cannot grant its own fee exemption.

Verification: TypeScript, all 53 application tests and the production build pass. Tests cover the actual conversion UI, existing logins/team/data, paid-fund protection, stale checkout blocking, zero-fee accounting and backup compatibility with older releases. The patch payload is checked against the original ZIP so it includes only changed/new files and reconstructs the verified source and frontend when overlaid. No hosted Replit deployment or live provider transaction is validated by these local tests.

Follow **Nerix-Global-Dentive-Internal-Account-Guide.md** (also `docs/INTERNAL-COMPANIES.md`). Stop the app, back up its existing data, upload the update into the same project, extract it, install locked dependencies, apply migrations, build and Run. Then sign into the original Nerix platform admin and convert the existing Dentive pilot; reload the workspace selector once.

OpenAI, carrier/telephone-number and hosting bills still apply through the owner's provider accounts. Live voice/Realtime, SIP/carrier and warm-transfer adapters remain separate implementation and acceptance work; the internal exemption does not activate real calling. The existing Cloudflare website 1.0.3 and original Sarah application require no change for this update.

## 21. Replit visitor-chat connection correction — 12 October 2026

The owner applied app 0.2.2 and successfully converted Dentive to an owned internal company. While testing the global Nerix chat, the staff inbox showed one available person but the visitor test page displayed **live connection offline** and offered an unsent email draft. The supplied visitor URL is the app's own `/chat-demo.html?site=nerix-global` page on Replit, rather than the Cloudflare marketing site.

Review found that all widget requests omitted browser credentials, including the self-hosted test page. A controlled private-preview proxy reproduced failure without its sign-in cookie. **Nerix-Global-App-0.2.3-Update.zip** adds an explicit same-origin credential opt-in to the test page; public embeds keep credential omission, and the opt-in cannot send cookies to a different API origin. Public chat tokens, origins, staff permissions and Dentive's fee exemption remain in force. Connection errors now explain sign-in/access pages or invalid chat responses instead of silently showing only offline FAQ help.

All 56 tests, TypeScript and the production build pass. New regressions cover the protected-preview case, saving contact details and a human request with OpenAI disabled, cross-origin credential isolation and visible login-page errors. The existing internal billing, backup and chat workflow tests also pass. Direct access to the owner's protected preview was unavailable, so this is a reproduced local defect and tested correction; it does not prove that the owner's hosted connection is accepted yet.

Apply this changed-files-only ZIP to the existing 0.2.2 project using `docs/CHAT-CONNECTION-FIX.md`: Stop, back up, upload, extract, install locked dependencies, build and Run. No new database migration is required. Retest **Live chat inbox → Go available → Test visitor widget** in the same signed-in browser, request a human and confirm an inbox reply reaches the visitor. If still offline, collect the new visible error or the public site-config response before changing settings.

Then activate and accept server-side OpenAI text chat, arrange the persistent public backend and connect the Cloudflare widget. A protected temporary development preview is not that public backend. Live voice/carrier and Safepay work continue as separate milestones. The existing website and original Sarah project are not modified by this app patch.

## 22. Prepared customer FAQ expansion and Search Console review — 12 October 2026

The owner applied 0.2.3, confirmed that a human could join the Replit visitor test and reply, and chose to expand prepared help without requiring OpenAI. **Nerix-Global-App-0.2.4-Update.zip** is a changed-files-only update for that same 0.2.3 project. It adds forty approved public topics, a browsable menu and clearer intentional FAQ labeling. The connected API and bundled standalone widget use the same content. Unknown questions are referred to the team; no free-form AI reasoning is claimed.

Topics cover services, Alex/Sarah, early access, setup, prices, USD100 normal deposits, minutes, planned currencies/payments, fees, proposed unused-paid-credit refunds, recharge, lead imports, calling rules, follow-ups, transfers, numbers, integrations, capacity, team scope, human availability, account assistance, privacy and contact. Unimplemented or unapproved services remain explicit. Private deposit exceptions, internal-company exemptions, provider secrets and commission amounts are not exposed in the public catalog. Other client sites retain their own scope and do not substitute Nerix prices or the global catalog.

**Nerix-Global-Cloudflare-v1.0.4.zip** contains the matching widget and a clarified FAQ privacy notice while preserving the homepage, design, logo, pricing examples, canonical, sitemap, robots and redirect rules. Preserve any configured public backend origin when deploying. With the original empty backend value, prepared global FAQs work locally, but human details only prepare an unsent email draft. A persistent public HTTPS backend is still required for actual website inbox delivery.

Verification: all 63 application tests, TypeScript and production build pass. New tests cover every selectable topic through the actual API without OpenAI calls or AI quota/usage, common-query selection, pending-feature truthfulness, client isolation, the offline FAQ browser and connected FAQ labeling. The existing preview, human handoff, backup and Dentive zero-rate tests also pass. Source/build payloads and the static website are checked during packaging; no real provider transaction or remote deployment is performed.

Search Console screenshots show one indexed URL and one excluded redirect URL, plus routine report links. They do not identify the homepage status, excluded example URL or redirect destination. Official Google guidance allows intentional alternate redirects to remain excluded and separates index eligibility from query ranking. LinkedIn/Facebook results alone do not establish a website indexing block. Public live-site retrieval was unavailable in this review; it is not treated as evidence that Google cannot access the site.

Use `docs/FAQ-UPDATE.md` for installation and `docs/SEARCH-CONSOLE-CHECK.md` for diagnosis. The remaining SEO evidence is the **excluded example URL** from Pages → Page with redirect and the **homepage URL Inspection result**, including its Google-selected canonical. No DNS, live redirect rule, Search Console account, social profile, original Sarah app or paid-provider setting is changed by these deliverables. OpenAI remains optional for this website chat; live voice and real payments remain separate milestones.


## 23. Public service wording and package SEO audit — 12 October 2026

The owner asked about “Voice pilot starting rates” and requested an SEO check before uploading the website. Public FAQ and marketing pricing now say **Voice service starting rates** or **Starting service rate**. Related public copy uses service/setup language while retaining explicit development and pending activation limits. The actual rates and USD100 normal minimum are unchanged. Internal APP_MODE names and completed historical pilot records remain technical implementation details.

**Nerix-Global-App-0.2.5-Update.zip** is a cumulative changed-files-only update for the existing 0.2.3 or 0.2.4 application. It contains the forty-topic FAQ expansion and previous preview correction; no new schema or billing logic is introduced. Dentive remains an owned internal company without Nerix fees. Existing saved chat messages are not rewritten.

**Nerix-Global-Cloudflare-v1.0.5.zip** contains the complete static website for the same Pages project. The audit retains the canonical homepage/privacy routes, crawl permissions, sitemap, existing real 404 page and intentional alias redirects. Titles/descriptions are aligned for search/share metadata, structured website identity stays Nerix Global, internal links go directly to canonical routes, and a code-drawn square NG favicon replaces the unsuitable non-square browser icon. The original headset logo, layout, voice examples and calculations are preserved. No social links, registration status, office address, review ratings or Google ranking promises are invented.

Public-domain retrieval was unavailable in this session; this is a package audit, not proof of the deployed domain’s status or Google’s private canonical decision. After deployment inspect **https://nerixglobal.com/** and **https://nerixglobal.com/privacy** in Search Console, verify successful fetch and the canonical, and retain intended alternate-URL redirects. Preserve the public backend setting before upload. Use `SERVICE-WORDING-SEO.md` and `WEBSITE-SEO-REVIEW.md`.
