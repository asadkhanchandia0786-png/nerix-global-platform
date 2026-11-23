import { SERVICES, calculateTime, buildEnquiry } from './website-utils.js';

// Navigation works on both the marketing homepage and the small information pages.
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.navigation');
function closeMenu() {
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', 'Open navigation');
  nav?.classList.remove('is-open');
}
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  nav?.classList.toggle('is-open', open);
});
nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener('click', e => {
  if (menu?.getAttribute('aria-expanded') === 'true' && !e.target.closest('.site-header')) closeMenu();
});
window.matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);

// Accessible example tabs: arrows, Home and End switch and focus the selected example.
const tabs = [...document.querySelectorAll('.example-tabs [role="tab"]')];
function selectTab(tab, focus = false) {
  tabs.forEach(t => {
    const active = t === tab;
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = !active;
  });
  const name = document.querySelector('[data-example-agent]');
  if (name) name.textContent = tab.id === 'tab-support' ? 'Sarah' : 'Alex';
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', e => {
    const last = tabs.length - 1;
    const target = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + last) % tabs.length,
      Home: 0,
      End: last
    }[e.key];
    if (target !== undefined) { e.preventDefault(); selectTab(tabs[target], true); }
  });
});

// This estimates service time; it is not a real wallet or payment flow.
const creditInput = document.getElementById('calculator-credit');
const serviceInput = document.getElementById('calculator-service');
const minutesOutput = document.getElementById('calculator-minutes');
const rateOutput = document.getElementById('calculator-rate');
const calculatorError = document.getElementById('calculator-error');
function updateCalculator() {
  if (!creditInput || !serviceInput) return;
  const rate = SERVICES[serviceInput.value]?.rate;
  const time = calculateTime(creditInput.valueAsNumber, rate);
  calculatorError.hidden = Boolean(time);
  creditInput.setAttribute('aria-invalid', String(!time));
  if (!time) {
    creditInput.setAttribute('aria-describedby', 'calculator-error');
    minutesOutput.textContent = '—';
    rateOutput.textContent = 'Enter a valid credit amount';
    return;
  }
  creditInput.removeAttribute('aria-describedby');
  const minutes = new Intl.NumberFormat('en-US').format(time.minutes);
  minutesOutput.textContent = `${minutes} min${time.seconds ? ` ${time.seconds} sec` : ''}`;
  rateOutput.textContent = `of AI time at $${rate.toFixed(2)} / minute`;
}
creditInput?.addEventListener('input', updateCalculator);
serviceInput?.addEventListener('change', updateCalculator);
updateCalculator();

// Service buttons carry the visitor's choice into the contact form.
const enquiryService = document.getElementById('enquiry-service');
document.querySelectorAll('[data-interest]').forEach(link => {
  link.addEventListener('click', () => {
    if (enquiryService) enquiryService.value = link.dataset.interest;
  });
});

// Prepare an email draft; there is deliberately no pretend form submission.
const form = document.getElementById('enquiry-form');
const fallback = document.getElementById('email-fallback');
const draftLink = document.getElementById('email-draft-link');
const preview = document.getElementById('enquiry-preview');
const copyButton = document.getElementById('copy-enquiry');
const formStatus = document.getElementById('form-status');
form?.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const required = ['name', 'company', 'email', 'message'];
  for (const name of required) {
    const field = form.elements.namedItem(name);
    field.setCustomValidity(String(data[name] ?? '').trim() ? '' : 'Please enter a value.');
  }
  if (!form.reportValidity()) return;
  const enquiry = buildEnquiry(data);
  draftLink.href = enquiry.mailto;
  preview.value = `To: info@nerixglobal.com\nSubject: ${enquiry.subject}\n\n${enquiry.body}`;
  fallback.hidden = false;
  copyButton.textContent = 'Copy enquiry';
  formStatus.textContent = "Your email draft is ready. It has not been sent. If your email app didn't open, use the options below.";
  try { window.location.href = enquiry.mailto; } catch { /* The visible draft remains available. */ }
});
form?.querySelectorAll('input,textarea').forEach(field => {
  field.addEventListener('input', () => field.setCustomValidity(''));
});
copyButton?.addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(preview.value);
    copyButton.textContent = 'Copied';
    formStatus.textContent = 'Enquiry copied. Paste it into your email app and send it to info@nerixglobal.com.';
  } catch {
    preview.focus();
    preview.select();
    formStatus.textContent = 'Select and copy the prepared enquiry below, then send it to info@nerixglobal.com.';
  }
});

document.querySelectorAll('[data-year]').forEach(el => { el.textContent = String(new Date().getFullYear()); });
