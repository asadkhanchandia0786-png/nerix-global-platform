export const SERVICES = Object.freeze({
  outbound: { name: 'AI lead generation', rate: 0.30 },
  basic: { name: 'Reception & customer support', rate: 0.50 },
  advanced: { name: 'Advanced connected support', rate: 0.75 },
  both: { name: 'Outbound & inbound services' },
  unsure: { name: 'Help choosing the right setup' }
});

const setups = {
  unsure: 'Not sure yet',
  carrier: 'I have a carrier / SIP setup',
  crm: 'I use a dialer / CRM',
  complete: 'I need a complete setup'
};

export function calculateTime(credit, rate) {
  if (!Number.isFinite(credit) || !Number.isFinite(rate) || credit < 100 || credit > 100000 || rate <= 0) return null;
  // Round available time down to a complete second; never overstate the estimate.
  const seconds = Math.floor((credit * 60) / rate + 1e-8);
  return { minutes: Math.floor(seconds / 60), seconds: seconds % 60 };
}

function singleLine(value) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

export function buildEnquiry(data) {
  const company = singleLine(data.company);
  const subject = `Nerix Global enquiry — ${company}`;
  const body = [
    'Hello Nerix Global,',
    '',
    data.service === 'chat' ? "I'd like to discuss website AI and human chat for my business." : "I'd like to discuss an AI voice setup for my business.",
    '',
    `Name: ${singleLine(data.name)}`,
    `Company: ${company}`,
    `Email: ${singleLine(data.email)}`,
    `Service: ${(data.service === 'chat' ? 'Website AI + human chat' : SERVICES[data.service]?.name) ?? 'Please advise'}`,
    `Calling setup: ${setups[data.setup] ?? setups.unsure}`,
    '',
    'Requirements:',
    String(data.message ?? '').trim(),
    '',
    'Please let me know the next steps.'
  ].join('\n');
  return {
    body,
    subject,
    mailto: `mailto:info@nerixglobal.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  };
}
