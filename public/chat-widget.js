/* NERIX_FAQ_BUNDLE_START */
(function(){const exports={};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAQ_TOPICS = void 0;
exports.matchFAQ = matchFAQ;
exports.answerFAQ = answerFAQ;
exports.FAQ_TOPICS = [
    { id: 'about', group: 'Services', question: 'What does Nerix Global do?', priority: 10, patterns: [/\b(nerix|company|business)\b.*\b(do|offer|provide|about)\b/i, /\b(what|which)\b.*\bservices\b/i, /\babout (you|nerix)\b/i], answer: 'Nerix Global is building AI voice and website-chat services for businesses. Alex focuses on friendly lead generation and follow-ups; Sarah focuses on reception and customer support. We welcome early-access enquiries and agree each service\'s supported features before activation.' },
    { id: 'alex', group: 'Services', question: 'What does Alex handle?', priority: 30, patterns: [/\b(alex|lead generation|cold call(?:ing|s)?|outbound|prospecting)\b/i], answer: 'Alex is Nerix Global\'s outreach assistant for introducing an approved offer, checking interest and capturing useful contact details. His style is friendly, smart and relaxed, with no aggressive selling or guaranteed results. Live calling and telephone routing still need service activation.' },
    { id: 'sarah', group: 'Services', question: 'What does Sarah handle?', priority: 25, patterns: [/\b(sarah|receptionist|reception|inbound|customer support)\b/i], answer: 'Sarah is Nerix Global\'s support assistant for answering approved questions and helping visitors reach the right person. Website FAQ help, human chat and saved follow-ups are available when the chat backend is connected. Voice reception, bookings and telephone transfers need their own agreed activation.' },
    { id: 'chat', group: 'Services', question: 'Can you provide chat services for my website?', priority: 55, patterns: [/\b(chatbot|chat services|website chat|chat service|live chat|text chat)\b/i, /\b(chat|chatting)\b/i], answer: 'Yes, website chat can be arranged alongside voice services. A connected widget can offer approved help, collect a reason and contact details, and let an available team member join. Each client needs its own approved content, website connection, staffing and privacy arrangements; chat pricing is agreed separately.' },
    { id: 'basic-advanced', group: 'Services', question: 'What is the difference between basic and advanced support?', priority: 70, patterns: [/\b(basic|advanced)\b.*\b(support|difference|service|reception)\b/i, /\bdifference\b.*\b(support|basic|advanced)\b/i], answer: 'Basic support focuses on routine reception and approved questions. Advanced support may involve more complex routing or supported business-system connections. We define and test the actual workflow with you; advanced support does not mean every CRM or booking system is already connected.' },
    { id: 'countries', group: 'Services', question: 'Can businesses in Pakistan, the UK and the US use your services?', priority: 70, patterns: [/\b(pakistan|pakistani|countries|country|international clients|uk|usa|united states|united kingdom)\b/i], answer: 'We welcome business enquiries from Pakistan, the UK, the US and other countries. Service availability depends on the required workflow, languages, telephone destinations and provider permissions. Tell our team where you operate so the supported setup can be confirmed before an agreement.' },
    { id: 'customization', group: 'Services', question: 'Can I choose the agent name, voice, language and tone?', priority: 75, patterns: [/\b(language|languages|urdu|english|voice|accent|multilingual|tone|customi[sz]e|agent name)\b/i], answer: 'Agent names, conversation styles, preferred voices, language preferences and approved business instructions can be configured separately. Alex\'s outreach style and Sarah\'s calm support style are independent. Live language and voice performance must be tested for your setup; the preset FAQ helper uses prepared replies rather than freely translating conversations.' },
    { id: 'live-status', group: 'Getting started', question: 'Is the full calling platform live today?', priority: 80, patterns: [/\b(live today|available today|launch date|ready now|ready today|already live|start calling|real calls|place calls|dial now)\b/i], answer: 'The platform is in development and welcomes early-access enquiries. The dashboard, FAQ/human chat and saved workflows can be explored, but this release does not place real telephone calls or take live card payments. We confirm the accepted voice, carrier, calendar and payment connections before a paid calling service is activated.' },
    { id: 'onboarding', group: 'Getting started', question: 'How do I get started with Nerix Global?', priority: 60, patterns: [/\b(get started|sign up|signup|register|onboard|join nerix|start using|create (an? )?account)\b/i], answer: 'Use “Talk to our team” or email info@nerixglobal.com with your business, country, preferred service and expected usage. We review your needs, explain the supported setup and agree rates and any separate charges. A demo registration or chat enquiry does not activate live calls or charge your card.' },
    { id: 'setup', group: 'Getting started', question: 'What information do you need to set up my service?', priority: 70, patterns: [/\b(set.?up|onboarding)\b.*\b(information|details|documents|need|require)\b/i, /\bwhat (do you|information).*need\b/i], answer: 'Prepare your business name, website, approved offer or FAQs, target countries and languages, opening hours and team contact destinations. For calling, discuss your authorized prospect list, telephone provider and any calendar or CRM connection. Do not put passwords, API keys, card details or identity-document scans into chat or lead notes.' },
    { id: 'demo', group: 'Getting started', question: 'Can I try a demonstration before paying?', priority: 75, patterns: [/\b(demo|demonstration|trial|test (the|your) (service|agent|app)|free credit|test credit)\b/i], answer: 'Ask the team for a guided demonstration of the available workflows. Simulated calls do not dial real numbers, and demonstration credit has no cash or refund value. We confirm the scope of any live trial separately; this chat does not grant free paid calling minutes.' },
    { id: 'pricing', group: 'Pricing and credit', question: 'What are your starting voice service rates?', priority: 85, patterns: [/\b(pric(?:e|es|ing)|costs?|rates?|charges?|qeemat|keemat)\b/i], answer: 'Voice service starting rates are $0.30 per billable minute for outbound, $0.50 for basic reception/support and $0.75 for advanced support. Your agreed industry or customer rate is confirmed before activation. Telephone numbers, carrier usage, taxes and separately scoped connections may add costs; chat pricing is separate.' },
    { id: 'chat-pricing', group: 'Pricing and credit', question: 'How much does website chat cost?', priority: 100, patterns: [/\b(chat|chatbot|website)\b.{0,50}\b(pric(?:e|ing)|cost|rates?|fees?|charges?)\b/i, /\b(pric(?:e|ing)|cost|rates?|fees?)\b.{0,50}\b(chat|chatbot|website)\b/i], answer: 'Website-chat pricing is agreed separately based on the chosen FAQ or AI mode, expected usage, human staffing and setup. The $0.30/$0.50/$0.75 voice-minute rates do not automatically price text chat. Preset FAQ replies do not use OpenAI, while enabled AI replies can incur API usage costs.' },
    { id: 'setup-fee', group: 'Pricing and credit', question: 'Is there a setup fee or a monthly AI package?', priority: 99, patterns: [/\b(set.?up fee|maintenance fee|monthly (fee|plan|package|subscription)|subscription|unlimited (calls|minutes))\b/i], answer: 'Nerix\'s stated service plan has no setup fee and uses prepaid, pay-as-you-go AI service credit. It is not an unlimited calling package. Recurring number rental, carrier services and any separately agreed integration costs are disclosed in your quote. Other businesses\' own products may have different terms.' },
    { id: 'deposit', group: 'Pricing and credit', question: 'What is the minimum first deposit and later top-up?', priority: 99, patterns: [/\b(minimum|min(?:imum)? deposit|first deposit|initial deposit|top.?up|add (money|credit)|deposit|recharge minimum)\b/i], answer: 'The first deposit and every normal later top-up must be at least USD100. You can add more; the service wallet and base prices use USD. Payment is only made through an approved method after your supported service and terms are confirmed. This FAQ does not create a payment or credit your account.' },
    { id: 'minutes', group: 'Pricing and credit', question: 'How much AI time does $100 buy?', priority: 99, patterns: [/\b(how (much|many)|100)\b.*\b(minutes|ai time|calling time)\b/i, /\bminutes\b.*\b(100|buy|get)\b/i], answer: 'At the starting AI service rates, $100 corresponds to about 333 minutes 20 seconds outbound, 200 minutes basic support, or 133 minutes 20 seconds advanced support. This is a rate calculation, not a promised number of successful calls. Separate carrier, number and other agreed costs are excluded.' },
    { id: 'billing', group: 'Pricing and credit', question: 'When does billable AI time start?', priority: 90, patterns: [/\b(bill(?:ed|ing|able)|per second|round(?:ing)?|ring(?:ing)?|answer(?:ed)? time|pay.as.you.go)\b/i], answer: 'The intended calling plan bills connected AI time by the second, beginning after the call is answered and the AI attaches. Ringing-only time is not billed as AI conversation time. Listening and connected IVR handling can count while the AI remains attached; a separately agreed carrier may have its own billing rules. Current dashboard calls are labeled simulations.' },
    { id: 'balance', group: 'Pricing and credit', question: 'What happens when my balance runs low or reaches zero?', priority: 80, patterns: [/\b(low balance|zero|runs? out|no (money|credit)|out of credit|remaining (balance|credit)|balance)\b/i], answer: 'The prepaid plan is designed to stop new paid calling when available credit is exhausted. Your dashboard shows credit and usage; active reservations also affect availability. Live cutoff enforcement is part of carrier integration acceptance. Automatic card recharge is not active in this release.' },
    { id: 'payments', group: 'Payments and refunds', question: 'Can I pay by Visa, Mastercard or Safepay?', priority: 85, patterns: [/\b(visa|mastercard|master card|safepay|debit card|credit card|card payment|payment method|how (do|can) i pay|make (a )?payment|payments?)\b/i], answer: 'The planned card checkout uses Safepay, subject to merchant approval and tested integration. Live card checkout is not active in this release, so we cannot promise that a particular bank or card is accepted yet. Our team confirms approved payment instructions before payment. Never send card numbers, CVV or banking passwords through chat.' },
    { id: 'currencies', group: 'Payments and refunds', question: 'Which currencies can I select?', priority: 95, patterns: [/\b(currency|currencies|pkr|rupees?|usd|gbp|pounds?|eur|euros?|cad|aed|sar|dollars?|conversion|exchange rate|fx)\b/i], answer: 'Base service pricing and wallet credit use USD. The planned initial checkout choices are PKR, USD, GBP, EUR, CAD, AED and SAR, subject to supported merchant approval. Preview conversion rates are illustrative, not live market quotes; the actual currency amount and applicable costs must be confirmed before paying.' },
    { id: 'bank-transfer', group: 'Payments and refunds', question: 'Can I pay by bank transfer or wire?', priority: 96, patterns: [/\b(bank transfer|wire|swift|ach|payoneer|bank details|bank account)\b/i], answer: 'A bank or wire transfer may be used only when the Nerix team supplies and approves instructions for your payment. Credit is recorded after cleared funds are verified, not from a transfer screenshot. Your bank or an intermediary may charge separately. Do not use unverified account details or assume another company\'s receiving account is suitable.' },
    { id: 'payment-fees', group: 'Payments and refunds', question: 'Will my bank charge extra fees?', priority: 98, patterns: [/\b(bank|processing|transaction|conversion|foreign|international)\b.*\b(fees?|charges?|costs?)\b/i, /\b(extra fee|surcharge)\b/i], answer: 'Your card-issuing bank may add its own foreign-currency fees, exchange-rate spread or taxes. These are separate from Nerix\'s merchant processing costs and the service credit advertised in an approved quote. We do not promise a fee-free bank statement or add an undisclosed surcharge; ask our team to confirm the final payment terms.' },
    { id: 'recharge', group: 'Payments and refunds', question: 'Can my balance recharge automatically?', priority: 100, patterns: [/\b(auto(?:matic)?[ -]?(?:recharge|top.?up)|saved card|save my card|charge my card automatically|threshold)\b/i, /\b(top.?up|recharge)\b.{0,40}\bautomatically\b/i], answer: 'Automatic recharge is planned as an optional feature with a chosen threshold, recharge amount, monthly cap and explicit customer authorization. Saving preferences does not activate a charge. The provider authorization and saved-payment integration are not active in this release.' },
    { id: 'refunds', group: 'Payments and refunds', question: 'Can I get a refund of unused paid credit?', priority: 100, patterns: [/\b(refund|money back|reimburse|cancel(?:lation)?|unused (credit|balance|money))\b/i], answer: 'Our proposed policy returns approved unused paid service credit through the original payment method and charged currency, without deducting Nerix\'s merchant processing costs from that credit. Consumed service time and demonstration credit are not unused paid funds. Requests are reviewed and reconciled first; your bank\'s fees or conversion may affect its statement. Confirm the applicable published terms before payment.' },
    { id: 'leads', group: 'Calling and workflow', question: 'Can I upload my own leads?', priority: 80, patterns: [/\b(upload|import|csv|xlsx|excel|spreadsheet|lead list|my own leads)\b/i], answer: 'The dashboard supports CSV/XLSX lead imports with a preview and column mapping. Supply valid country-code phone numbers, the recipient timezone and approved contact information. Use your own authorized list; the example leads are fictional and must not be dialed. This service does not automatically supply a verified prospect database.' },
    { id: 'calling-rules', group: 'Calling and workflow', question: 'How do calling hours, retries and opt-outs work?', priority: 90, patterns: [/\b(calling hours|calling windows?|time.?zone|retries|retry|attempts|opt.?out|do not call|stop (calling|contacting)|suppression|calling permission)\b/i], answer: 'Campaign rules use the recipient\'s timezone, allowed days/hours, attempt limits and retry spacing. Recorded opt-outs are excluded from future campaign calls. You must agree an authorized outreach approach and any relevant local requirements before live calling is activated; this FAQ is not permission to call every number.' },
    { id: 'followups', group: 'Calling and workflow', question: 'Can Alex follow up and arrange callbacks or meetings?', priority: 80, patterns: [/\b(follow.?up|callback|meeting|appointment|booking|calendar)\b/i], answer: 'Lead history, dispositions, callbacks and meeting requests can be recorded in the dashboard. A stored request is not a confirmed external calendar booking or an automatic telephone callback. Supported calendar connections, staff availability and actual calling are tested and activated separately.' },
    { id: 'transfers', group: 'Calling and workflow', question: 'How will warm transfers to my team work?', priority: 90, patterns: [/\b(warm transfer|transfer (a |the |my )?call|call transfer|press 1|press 2|handover|bridge)\b/i], answer: 'The planned warm-transfer flow captures the caller\'s name and reason, briefs the staff member privately, and connects only after acceptance. The AI leaves after the bridge is confirmed. If staff decline or are unavailable, a callback can be recorded. Real telephone transfers still require the carrier and transfer integration to be accepted for your setup.' },
    { id: 'numbers', group: 'Calling and workflow', question: 'Can I keep my current number and caller ID?', priority: 85, patterns: [/\b(current|existing|own|keep)\b.*\b(number|phone|carrier)\b/i, /\b(caller id|sip|voip|phone numbers?|number rental|did)\b/i], answer: 'We check number forwarding, supported SIP/carrier arrangements, authorized caller ID and any new number rental with you. Keeping an existing public number may be possible through a supported setup, but compatibility and destination costs must be confirmed. Numbers and transfer legs can have charges separate from the AI service rate.' },
    { id: 'integrations', group: 'Calling and workflow', question: 'Can you connect my CRM, dialer or booking system?', priority: 90, patterns: [/\b(crm|dialer|integration|pms|carestack|dentrix|open dental|asterisk|booking system|connect.*system)\b/i], answer: 'Discuss the exact provider and workflow with our team. We assess its supported API/SIP options, access requirements and separate integration scope; we do not claim universal compatibility. External calendar, CRM, PMS and live carrier connections are not automatically activated by creating an account or saving a profile.' },
    { id: 'capacity', group: 'Calling and workflow', question: 'How many calls can run at the same time?', priority: 90, patterns: [/\b(concurrent|concurrency|simultaneous|bulk calls|calls per day|call capacity|channels|high volume)\b/i, /\bhow many calls\b/i], answer: 'Call capacity depends on the accepted carrier channels, voice integration and safe billing limits. We start with controlled testing and agree tested concurrency before increasing it. The current simulation workflow is limited; we do not promise unlimited calls, a fixed daily volume or guaranteed sales.' },
    { id: 'locations-team', group: 'Dashboard and team', question: 'Can I manage multiple locations and team members?', priority: 85, patterns: [/\b(multiple|multi)\b.*\b(locations?|branches|companies|users)\b/i, /\b(team members?|staff access|roles|permissions|manager|dashboard|branches|locations)\b/i], answer: 'Workspaces support companies, locations and individual team invitations. An owner can manage access; staff and managers see the areas permitted by their role and assignment. Customers have separate private workspaces. Invite people through their own accounts rather than sharing the owner\'s login.' },
    { id: 'human-help', group: 'Support and privacy', question: 'How do I speak to a human agent?', priority: 110, patterns: [/\b(human|real (person|agent)|live agent|representative|talk to (someone|a person)|speak to (someone|a person))\b/i], answer: 'Choose “Talk to our team”. Give the reason first, then your name, email, phone with country code and contact permission. An available team member can accept the chat; if nobody joins, a connected chat saves a follow-up. You can keep using preset help while waiting.' },
    { id: 'availability', group: 'Support and privacy', question: 'What if nobody is available, and when will you reply?', priority: 95, patterns: [/\b(nobody|no one|unavailable|busy|opening hours|business hours|24.?7|support hours|response time|when.*reply|how long.*wait)\b/i], answer: 'Human availability depends on the team shown in the connected chat. If nobody joins, your agreed contact details, reason and conversation are saved for follow-up; staff contact you manually. We do not promise a response time, 24/7 human staffing or automatic outreach. You can continue asking preset questions while waiting.' },
    { id: 'account-help', group: 'Support and privacy', question: 'Can you help with login, account or billing problems?', priority: 100, patterns: [/\b(login|log in|sign in|password|account problem|account issue|cannot access|can.t access|billing problem|billing issue)\b/i], answer: 'Use the Support area in your dashboard or request our team in chat, explaining the problem and the email associated with your account. Public FAQ help cannot inspect private balances, change passwords or make refunds. Staff need to verify access before investigating; never share your password, API key or complete card details.' },
    { id: 'privacy', group: 'Support and privacy', question: 'How do you handle my chat details and privacy?', priority: 105, patterns: [/\b(privacy|data protection|gdpr|hipaa|confidential|personal data|retention|delete my data|recording|recorded|transcript|store.*data)\b/i, /\b(data|messages)\b.{0,70}\b(openai|stored|kept|retention|shared|deleted)\b/i], answer: 'A connected chat stores messages and consented contact details for support and follow-up by authorized staff. Preset FAQ mode does not send questions to OpenAI; enabled AI replies use the configured provider. Follow the Privacy link for the website notice and contact info@nerixglobal.com about access, correction or deletion. Do not send sensitive records; we do not claim automatic HIPAA/GDPR certification or active call recording.' },
    { id: 'ai-faq', group: 'Support and privacy', question: 'Am I chatting with AI, preset help or a person?', priority: 100, patterns: [/\b(are you (ai|human|a robot)|chatgpt|openai|api|artificial intelligence|preset|faq|bot or human|real ai|free chatbot)\b/i], answer: 'The chat labels its current mode. Preset FAQ help uses prepared replies without OpenAI. If AI is enabled, it generates replies from approved knowledge; when a person joins, the chat identifies that person and automatic replies pause. A disconnected widget cannot save a team request and clearly offers an unsent email draft instead.' },
    { id: 'results', group: 'Support and privacy', question: 'Do you guarantee sales, appointments or Google rankings?', priority: 95, patterns: [/\b(guarantee|guaranteed|sales results|conversions|google|seo|rank(?:ing)?|index(?:ing)?)\b/i], answer: 'We do not guarantee sales, appointments, Google indexing or search positions. Outcomes depend on the offer, audience, approved workflow and other factors. The website describes planned and available services; our team confirms your actual service scope and expected measurements before activation.' },
    { id: 'referral', group: 'Support and privacy', question: 'Can I refer clients or become a partner?', priority: 90, patterns: [/\b(referral|refer (a |my )?client|partner|commission|affiliate|sales agent)\b/i], answer: 'Ask the Nerix team for the current written partner terms before arranging referrals. A reward depends on a genuinely new, qualifying paid business and review; a meeting, demo registration or unused deposit alone is not a qualifying sale. This chat does not approve or automatically pay commissions.' },
    { id: 'contact', group: 'Support and privacy', question: 'How can I contact Nerix Global?', priority: 75, patterns: [/\b(contact|email|phone number|telephone|reach you|address|registered|registration|legal identity)\b/i], answer: 'Email info@nerixglobal.com, call +44 7537 158202 (UK) or +1 213 510 7178 (US), or choose “Talk to our team”. Ask the team for the legal billing identity, registration documents and applicable terms before entering an agreement or making a payment.' }
];
const normalize = (value) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?!.]+$/, '');
function matchFAQ(message) {
    const value = normalize(message.slice(0, 1800));
    const exact = exports.FAQ_TOPICS.find(item => normalize(item.question) === value);
    if (exact)
        return exact;
    return exports.FAQ_TOPICS.filter(item => item.patterns.some(pattern => pattern.test(value))).sort((a, b) => b.priority - a.priority)[0];
}
function answerFAQ(message) {
    if (/^(hi|hello|hey|salam|assalamualaikum|good (morning|afternoon|evening))[! .]*$/i.test(message.trim()))
        return 'Hello! I can help with common Nerix Global questions using prepared FAQ replies. Choose “Browse FAQs” to see the topics, or “Talk to our team” to request a person.';
    return matchFAQ(message)?.answer || 'I do not have a confirmed preset answer to that question. Choose “Browse FAQs” for services, pricing, payments, calling, setup and privacy, or “Talk to our team” for help with your specific situation.';
}

window.NERIX_FAQ=exports;})();
/* NERIX_FAQ_BUNDLE_END */
(function(){
  'use strict';
  if(document.getElementById('nrx-chat-root'))return;
  const script=document.currentScript;
  const options=window.NERIX_CHAT||{};
  const faq=window.NERIX_FAQ;
  const assetBase=new URL('.',script?.src||location.href).href;
  const siteKey=String(options.siteKey||'nerix-global');
  let apiBase=String(options.apiBase||'').replace(/\/$/,'');
  try{const u=new URL(apiBase);if(u.origin!==apiBase||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))apiBase='';}catch{apiBase='';}
  // Only the self-hosted test page opts into browser credentials for a private
  // preview proxy. Public website embeds continue to use opaque chat tokens.
  const credentials=options.previewCredentials===true&&apiBase===location.origin?'same-origin':'omit';
  const contactEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.contactEmail||'')?options.contactEmail:siteKey==='nerix-global'?'info@nerixglobal.com':'';
  const storageKey=`nerix-chat:${apiBase}:${siteKey}`;
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=assetBase+'chat-widget.css';document.head.append(stylesheet);
  const root=document.createElement('div');root.id='nrx-chat-root';
  root.innerHTML=`<button class="nrx-launcher" type="button" aria-label="Chat with Nerix Global" aria-controls="nrx-panel" aria-expanded="false"><img alt="" width="42" height="42"><span class="nrx-unread" hidden>New</span></button>
    <section class="nrx-panel" id="nrx-panel" aria-label="Nerix Global website chat" hidden>
      <header class="nrx-header"><img alt="" width="38" height="38"><div><strong class="nrx-title">Nerix Global</strong><span class="nrx-subtitle">Let’s talk</span></div><button class="nrx-close" type="button" aria-label="Minimize chat">×</button></header>
      <div class="nrx-status" role="status">Connecting when you open chat…</div>
      <div class="nrx-log" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions"></div>
      <div class="nrx-handoff" hidden></div>
      <div class="nrx-error" role="alert" hidden></div>
      <div class="nrx-compose"><form class="nrx-message-form"><label class="nrx-sr" for="nrx-message">Your message</label><textarea id="nrx-message" placeholder="Ask us a question…" rows="2" maxlength="1800" required></textarea><button type="submit" class="nrx-send" aria-label="Send message">Send</button></form></div>
      <div class="nrx-actions"><button type="button" class="nrx-faq" hidden>Browse FAQs</button><button type="button" class="nrx-human">Talk to our team</button><button type="button" class="nrx-new">New chat</button><button type="button" class="nrx-reconnect" hidden>Reconnect</button></div>
      <p class="nrx-privacy">Please don’t share card details or passwords. <a href="https://nerixglobal.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></p>
    </section>`;
  document.body.append(root);
  const find=selector=>root.querySelector(selector);
  root.querySelectorAll('img').forEach(img=>{img.src=options.logoUrl||assetBase+'assets/nerix-logo.png';});
  if(options.privacyUrl)find('.nrx-privacy a').href=options.privacyUrl;
  const launcher=find('.nrx-launcher'),panel=find('.nrx-panel'),log=find('.nrx-log'),status=find('.nrx-status'),error=find('.nrx-error'),input=find('#nrx-message'),send=find('.nrx-send'),compose=find('.nrx-compose'),handoff=find('.nrx-handoff');
  let stored=null;try{stored=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  let token=stored?.token||'',conversationId=stored?.conversationId||'',conversation=null,connected=false,opening=false,busy=false,reason='',pendingMessage=null,configuration=null,rendered='',revision=0,polling=false;
  const save=()=>{try{if(token&&conversationId)sessionStorage.setItem(storageKey,JSON.stringify({token,conversationId}));else sessionStorage.removeItem(storageKey);}catch{}};
  const showError=message=>{error.textContent=message;error.hidden=!message;};
  const uuid=()=>crypto.randomUUID();
  const appendLocal=(sender,name,body)=>{if(!conversation)conversation={status:'ai',messages:[]};conversation.messages.push({id:uuid(),sender,sender_name:name,body,kind:'faq',created_at:new Date().toISOString()});render();};
  function render(){
    const c=conversation;if(!c)return;
    const states={ai:configuration?.helpLabel||'Automatic FAQ help',waiting:'Waiting for a person · automatic help continues',human:`${c.humanName||'A team member'} · human agent`,follow_up:'Follow-up saved · automatic help continues',closed:'Conversation ended'};
    status.textContent=connected?(states[c.status]||states.ai):token?'Live connection offline · reconnect or contact the team':'Automatic FAQ help · live connection offline';
    find('.nrx-title').textContent=configuration?.name||'Nerix Global';
    find('.nrx-subtitle').textContent=connected&&c.status==='human'?'You’re chatting with a person':configuration?.aiReady?`${configuration.agentName} · Nerix Global’s AI assistant`:connected?'Preset FAQ help':'Nerix help · live connection offline';
    find('.nrx-faq').hidden=siteKey!=='nerix-global'||!faq||connected&&['human','closed'].includes(c.status);
    find('.nrx-faq').disabled=busy||c.busy;
    if(connected&&['human','closed'].includes(c.status)&&handoff.classList.contains('nrx-faq-view'))hideHandoff();
    input.disabled=c.status==='closed'||busy||c.busy;send.disabled=input.disabled;find('button.nrx-human').hidden=connected&&(c.status==='human'||c.status==='closed'||!!c.contactSaved);find('button.nrx-human').disabled=busy;
    const signature=JSON.stringify(c.messages.map(m=>m.id));
    if(signature===rendered)return;
    const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<70,previousScroll=log.scrollTop;
    const previousIds=new Set([...log.querySelectorAll('[data-message]')].map(n=>n.dataset.message));
    for(const m of c.messages){if(previousIds.has(m.id))continue;const entry=document.createElement('div');entry.className='nrx-bubble nrx-'+m.sender;entry.dataset.message=m.id;const label=document.createElement('small');label.textContent=m.sender_name;const body=document.createElement('p');body.textContent=m.body;entry.append(label,body);log.append(entry);}
    rendered=signature;if(atBottom)log.scrollTop=log.scrollHeight;else log.scrollTop=previousScroll;
    if(panel.hidden&&c.messages.length)find('.nrx-unread').hidden=false;
  }
  async function request(path,method='GET',body){
    const r=await fetch(apiBase+'/chat-api/sites/'+encodeURIComponent(siteKey)+path,{method,credentials,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(method==='GET'?{}:{'Content-Type':'application/json','X-Nerix-Chat':'widget'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
    let data;
    try{data=await r.json();}catch{
      const e=new Error(r.status===401||r.status===403||r.redirected?'The chat server returned a sign-in or access page. For a protected preview, keep your Replit sign-in active in this browser and reconnect.':'The chat server did not return a chat response. Check that the app is running and the website connection points to the app.');
      e.status=r.status;throw e;
    }
    if(!r.ok){const e=new Error(data.error||'Chat could not connect.');e.status=r.status;throw e;}return data;
  }
  function localReply(message){
    if(siteKey!=='nerix-global')return 'The live chat connection is offline, so I cannot confirm this business’s information or prices. '+(contactEmail?'Choose “Talk to our team” to prepare an email draft. It will not be sent automatically.':'Please use the contact information on this business’s website.');
    if(faq)return faq.answerFAQ(message);
    const value=message.toLowerCase();
    if(/human|person|live agent|representative/.test(value))return 'Choose “Talk to our team”. Tell us the reason first, then your contact details. While the live connection is offline, we can prepare an email draft for you to send.';
    if(/price|pricing|cost|deposit|rate|credit/.test(value))return 'Voice pilot rates start at $0.30/minute for outbound, $0.50 for basic support and $0.75 for advanced support. The normal prepaid minimum is $100. Chat pricing is agreed separately; carrier and separately scoped integrations may cost extra.';
    if(/chat|sarah|support/.test(value))return 'Sarah is Nerix Global’s support assistant. Website chat can answer questions, request a person and collect follow-up details with your permission. Alex handles lead generation and follow-ups.';
    if(/alex|lead|outbound|sales/.test(value))return 'Alex handles friendly lead generation and follow-ups. Sarah handles customer support. The voice platform is in development; contact the team to discuss a pilot.';
    return 'Nerix Global provides AI voice and website-chat services. This is automatic FAQ help while the live connection is offline. You can ask about pricing, Alex or Sarah, or prepare a message for our team.';
  }
  async function initialize(){
    if(opening||busy)return;opening=true;busy=true;revision++;input.disabled=true;send.disabled=true;showError('');
    try{
      if(!apiBase)throw new Error('Chat server is not connected yet.');
      configuration=await request('/config');
      if(token&&conversationId){try{conversation=await request('/conversations/'+conversationId);}catch(e){if(e.status!==401)throw e;token='';conversationId='';conversation=null;pendingMessage=null;save();log.replaceChildren();rendered='';}}
      if(!token){const data=await request('/conversations','POST',{});token=data.token;conversationId=data.conversation.id;conversation=data.conversation;save();log.replaceChildren();rendered='';}
      connected=true;find('.nrx-reconnect').hidden=true;render();
    }catch(e){
      connected=false;configuration=null;status.textContent='Automatic FAQ help · live connection offline';find('.nrx-reconnect').hidden=!apiBase;
      if(!conversation)appendLocal('assistant','Nerix help','Hi! Automatic FAQ help is available. The live chat connection is offline, so messages are not being saved to the team inbox. You can prepare an email draft if you need a person.');
      else showError('Live connection is offline. Your saved chat can resume when it reconnects. New messages cannot be delivered right now.');
      if(apiBase)showError(e.message||'Chat could not connect. Check that the app is running, then reconnect.');
      render();
    }finally{opening=false;busy=false;render();}
  }
  async function sendMessage(value){
    if(busy||!value.trim())return;showError('');busy=true;revision++;render();
    try{
      if(connected){
        if(!pendingMessage||pendingMessage.body!==value)pendingMessage={body:value,requestKey:uuid()};
        conversation=await request('/conversations/'+conversationId+'/messages','POST',pendingMessage);pendingMessage=null;
      }else if(!token){appendLocal('visitor','You',value);appendLocal('assistant','Nerix help',localReply(value));}
      else throw new Error('Please reconnect before sending, or prepare an email with “Talk to our team”.');
      input.value='';render();
    }catch(e){if(e.status===401){connected=false;find('.nrx-reconnect').hidden=false;}showError(e.message||'Your message could not be delivered. Try again.');}
    finally{busy=false;render();input.focus();}
  }
  find('.nrx-message-form').addEventListener('submit',e=>{e.preventDefault();if(input.value.trim())sendMessage(input.value.trim());});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(input.value.trim())sendMessage(input.value.trim());}});
  function showReason(){
    log.hidden=false;handoff.classList.remove('nrx-faq-view');
    if(busy)return;
    if(!connected&&!contactEmail){showError('Live chat is offline and no email contact is configured. Please use the contact information on this business’s website.');return;}
    handoff.hidden=false;compose.hidden=true;handoff.replaceChildren();
    const title=document.createElement('h3');title.textContent='What would you like help with?';
    const note=document.createElement('p');note.textContent='Share the reason first so the right person can help. You can also ask our automatic assistant before requesting a person.';
    const form=document.createElement('form'),label=document.createElement('label');label.textContent='Reason for contacting our team';
    const field=document.createElement('textarea');field.rows=3;field.maxLength=2000;field.required=true;field.value=reason;label.append(field);
    const next=document.createElement('button');next.type='submit';next.className='nrx-primary';next.textContent='Continue to contact details';
    const ask=document.createElement('button');ask.type='button';ask.className='nrx-text';ask.textContent='Ask the assistant about this first';
    ask.addEventListener('click',()=>{if(!form.reportValidity())return;reason=field.value.trim();hideHandoff();sendMessage(reason.slice(0,1800));});
    const cancel=document.createElement('button');cancel.type='button';cancel.className='nrx-text';cancel.textContent='Back to chat';cancel.addEventListener('click',hideHandoff);
    form.append(label,next,ask,cancel);form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;reason=field.value.trim();showContact();});handoff.append(title,note,form);field.focus();
  }
  function hideHandoff(){handoff.hidden=true;compose.hidden=false;log.hidden=false;handoff.classList.remove('nrx-faq-view');input.focus();}
  function showContact(){
    handoff.replaceChildren();const title=document.createElement('h3');title.textContent='How can our team reach you?';const note=document.createElement('p');note.textContent=connected?'If an available person accepts, they’ll join this chat. Otherwise your details and reason will be saved for follow-up.':'The live connection is offline. We’ll prepare an email draft for you to send; this does not save a request to the team inbox.';
    const form=document.createElement('form');
    for(const [name,text,type,placeholder]of [['name','Your name','text',''],['email','Email address','email','you@company.com'],['phone','Phone with country code','tel','+92 …']]){const label=document.createElement('label');label.textContent=text;const field=document.createElement('input');field.name=name;field.type=type;field.placeholder=placeholder;field.required=true;field.maxLength=name==='phone'?29:name==='email'?254:100;field.autocomplete=name==='phone'?'tel':name;label.append(field);form.append(label);}
    const consent=document.createElement('label');consent.className='nrx-consent';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='consent';checkbox.required=true;consent.append(checkbox,document.createTextNode('I agree to be contacted about this request.'));
    const submit=document.createElement('button');submit.type='submit';submit.className='nrx-primary';submit.textContent=connected?'Request a human agent':'Prepare email draft';const back=document.createElement('button');back.type='button';back.className='nrx-text';back.textContent='Back to reason';back.addEventListener('click',showReason);form.append(consent,submit,back);
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy||!form.reportValidity())return;showError('');const data=Object.fromEntries(new FormData(form));const payload={reason,name:String(data.name).trim(),email:String(data.email).trim(),phone:String(data.phone).trim(),consent:checkbox.checked};
      submit.disabled=true;busy=true;revision++;render();
      try{
        if(connected){conversation=await request('/conversations/'+conversationId+'/handoff','POST',payload);hideHandoff();render();}
        else{
          if(!contactEmail)throw new Error('Please use the contact information on this business’s website.');
          const subject='Website chat request';const body=`Name: ${payload.name}\nEmail: ${payload.email}\nPhone: ${payload.phone}\nReason: ${reason}\n\nPlease contact me about this request.`;
          handoff.replaceChildren();const p=document.createElement('p');p.textContent='Your email draft is ready. It has not been sent or saved to the team inbox.';const link=document.createElement('a');link.className='nrx-primary';link.href=`mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;link.textContent='Open my email draft';const returnButton=document.createElement('button');returnButton.className='nrx-text';returnButton.textContent='Back to chat';returnButton.addEventListener('click',hideHandoff);handoff.append(p,link,returnButton);
        }
      }catch(e){showError(e.message||'The request was not saved. Please try again.');}
      finally{submit.disabled=false;busy=false;render();}
    });handoff.append(title,note,form);form.querySelector('input').focus();
  }
  find('button.nrx-human').addEventListener('click',showReason);
  find('.nrx-faq').addEventListener('click',()=>{
    if(busy||!faq||siteKey!=='nerix-global'||connected&&['human','closed'].includes(conversation?.status))return;
    showError('');handoff.replaceChildren();handoff.hidden=false;handoff.classList.add('nrx-faq-view');compose.hidden=true;log.hidden=true;
    const title=document.createElement('h3');title.textContent='Frequently asked questions';handoff.append(title);
    const note=document.createElement('p');note.textContent='Choose a topic for a prepared answer. For help with your account or a specific setup, talk to our team.';handoff.append(note);
    for(const group of [...new Set(faq.FAQ_TOPICS.map(item=>item.group))]){
      const heading=document.createElement('h4');heading.textContent=group;handoff.append(heading);
      for(const item of faq.FAQ_TOPICS.filter(item=>item.group===group)){
        const button=document.createElement('button');button.type='button';button.className='nrx-faq-question';button.textContent=item.question;
        button.addEventListener('click',()=>{hideHandoff();sendMessage(item.question);});handoff.append(button);
      }
    }
    const back=document.createElement('button');back.type='button';back.className='nrx-text';back.textContent='Back to chat';back.addEventListener('click',hideHandoff);handoff.append(back);
    handoff.querySelector('button')?.focus();
  });
  function closePanel(){panel.hidden=true;launcher.setAttribute('aria-expanded','false');launcher.focus();}
  launcher.addEventListener('click',async()=>{if(!panel.hidden){closePanel();return;}panel.hidden=false;launcher.setAttribute('aria-expanded','true');find('.nrx-unread').hidden=true;if(!conversation||!connected)await initialize();input.focus();});
  find('.nrx-close').addEventListener('click',closePanel);
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();closePanel();}});
  find('.nrx-reconnect').addEventListener('click',initialize);
  find('.nrx-new').addEventListener('click',async()=>{
    if(busy)return;showError('');busy=true;revision++;render();
    try{if(connected&&token)await request('/conversations/'+conversationId+'/close','POST',{});}catch(e){if(e.status!==401){showError('Could not end the saved chat. Reconnect and try again.');busy=false;render();return;}}
    token='';conversationId='';conversation=null;configuration=null;pendingMessage=null;reason='';connected=false;save();log.replaceChildren();rendered='';hideHandoff();busy=false;await initialize();
  });
  setInterval(async()=>{
    if(polling||busy||!connected||!token||!conversationId||document.hidden||conversation?.status==='closed')return;
    const expectedRevision=revision,expectedId=conversationId;polling=true;
    try{
      const snapshot=await request('/conversations/'+expectedId);
      if(revision!==expectedRevision||conversationId!==expectedId)return;
      conversation=snapshot;render();
    }catch(e){
      if(revision!==expectedRevision||conversationId!==expectedId)return;
      connected=false;showError(e.status===401?'This session expired. Start a new chat.':'Connection interrupted. Reconnect to resume your saved conversation.');find('.nrx-reconnect').hidden=false;render();
    }finally{polling=false;}
  },5000);
})();
