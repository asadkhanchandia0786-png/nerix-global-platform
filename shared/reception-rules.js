// Shared by the telephone gateway and the portal API (single source of truth).
// Generic for any industry. Never resolve a telephone destination from
// caller-supplied digits or another workspace's staff list.
const tokens = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/\bdoctor\b/g, 'dr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);

export const STAFF_ROLES = ['manager', 'specialist', 'billing', 'support', 'receptionist', 'staff', 'other'];
const rolePhrases = {
  specialist: 'specialist', dr: 'specialist', doctor: 'specialist', dentist: 'specialist', lawyer: 'specialist', attorney: 'specialist',
  solicitor: 'specialist', advisor: 'specialist', adviser: 'specialist', consultant: 'specialist', technician: 'specialist',
  engineer: 'specialist', agent: 'specialist',
  manager: 'manager', 'office manager': 'manager', 'practice manager': 'manager', 'branch manager': 'manager', 'general manager': 'manager',
  billing: 'billing', 'billing team': 'billing', 'billing department': 'billing', accounts: 'billing', 'accounts team': 'billing',
  'accounts department': 'billing', accounting: 'billing',
  support: 'support', 'support team': 'support', 'customer support': 'support', 'customer service': 'support', 'service desk': 'support',
  helpdesk: 'support', 'help desk': 'support',
  reception: 'receptionist', receptionist: 'receptionist', 'front desk': 'receptionist', frontdesk: 'receptionist',
  staff: 'staff', team: 'staff'
};
export function requestedStaffRole(value) {
  return rolePhrases[tokens(value).filter((word, i) => i !== 0 || !['a', 'an', 'the'].includes(word)).join(' ')] || (['other'].includes(value) ? value : '');
}
export function roleOnlyRequest({ requestedName, requestedRole } = {}) { return !String(requestedName || '').trim() || !!requestedStaffRole(requestedName); }
export const CALLER_TYPES = ['customer', 'sales', 'business', 'personal', 'other'];
export function staffRole(target) {
  if (STAFF_ROLES.includes(target.role)) return target.role;
  const name = tokens(target.name);
  return name.some(w => ['dr', 'dentist', 'lawyer', 'attorney', 'advisor', 'consultant', 'technician', 'engineer'].includes(w)) ? 'specialist'
    : name.includes('manager') ? 'manager'
    : name.some(w => ['billing', 'accounts'].includes(w)) ? 'billing'
    : name.includes('support') ? 'support'
    : name.some(w => ['reception', 'receptionist', 'frontdesk'].includes(w)) || name.includes('front') && name.includes('desk') ? 'receptionist' : 'staff';
}
export function receptionFallback(targets) {
  const available = targets.filter(t => staffRole(t) === 'receptionist' && t.hasPhone !== false);
  const defaults = available.filter(t => t.defaultForRole === true);
  if (defaults.length === 1) return defaults[0];
  if (defaults.length > 1) return null;
  return available.find(t => t.id === 'reception') || (available.length === 1 ? available[0] : null);
}
function directTransferTarget(targets, requestedName = '', requestedRole = '') {
  const normalizedRole = requestedStaffRole(requestedRole);
  if (typeof requestedName !== 'string' || requestedName.length > 100 || requestedRole && !normalizedRole) return { found: false, reason: 'staff_name_required', instruction: 'Ask which person, role or team the caller wants to speak with.' };
  let words = tokens(requestedName), role = normalizedRole;
  if (['a', 'an', 'the'].includes(words[0])) words = words.slice(1);
  const implied = rolePhrases[words.join(' ')]; if (implied) { role ||= implied; words = []; }
  if (words.includes('dr')) { role ||= 'specialist'; words = words.filter(w => w !== 'dr'); }
  let matches = targets.filter(t => (words.length || role) && (!role || staffRole(t) === role) && words.every(word => tokens(t.name).includes(word)));
  if (!words.length && role && matches.length > 1) { const defaults = matches.filter(t => t.defaultForRole === true); if (defaults.length === 1) matches = defaults; }
  const summary = ({ id, name, ...t }) => ({ id, name, role: staffRole({ name, ...t }) });
  if (matches.length === 1) {
    const selected = matches[0];
    if (selected.hasPhone === false) {
      const fallback = receptionFallback(targets);
      if (!fallback) return { found: false, reason: 'staff_number_unavailable', requestedRecipient: selected.name, requestedRole: staffRole(selected), instruction: 'The named person has no configured direct number and no unique front-desk destination is available. Offer an agreed callback for the named person. Do not claim that their phone was tried.' };
      return { found: true, target: summary(fallback), requestedTarget: summary(selected), fallback: true, instruction: 'The requested person has no direct number. Tell the caller that you will check whether ' + fallback.name + ' can help with their request for ' + selected.name + '. Confirm that destination, caller name and reason before requesting the transfer. Do not imply that the requested person will answer.' };
    }
    return { found: true, target: summary(selected), instruction: 'Collect any missing caller name and short reason, and company for business/sales callers. Confirm the intended person and introduction with the caller before requesting the transfer.' };
  }
  matches = matches.map(summary);
  if (matches.length > 1) return { found: false, reason: !words.length && role ? 'role_default_missing' : 'staff_name_ambiguous', matches, instruction: !words.length && role ? 'No default contact is configured for this role. If the caller knows a name, clarify it; otherwise offer a callback for the role. Do not make them guess a staff name or choose a person yourself.' : 'Ask which of these people the caller means, then search again with their clarified name. Do not choose a person or dial yet.' };
  return { found: false, reason: 'staff_not_found', instruction: 'Ask for clarification if helpful. When a caller does not know a name and no default exists, offer a callback for the requested role. Do not invent a recipient. You may offer the configured front desk after explaining that the requested person is not listed; look up reception and confirm that alternative before dialing. This does not override the no-further-transfer rule after a decline or failed sales call.' };
}
export function findTransferTarget(targets, requestedName = '', requestedRole = '') {
  const result = directTransferTarget(targets, requestedName, requestedRole);
  if (result.found) return result;
  // An unresolved request goes to the one configured front desk, never to an
  // arbitrary person. Confirmation is enforced by the controller/API.
  if (typeof requestedName !== 'string' || requestedName.length > 100) return result;
  const fallback = receptionFallback(targets);
  if (!fallback) return result;
  return { found: true, fallback: true, fallbackReason: result.reason,
    target: { id: fallback.id, name: fallback.name, role: staffRole(fallback) },
    requestedRecipient: requestedName.trim(), requestedRole: requestedStaffRole(requestedRole) || requestedStaffRole(requestedName) || 'other',
    instruction: 'The requested destination could not be resolved. Explain briefly that the front desk can help, confirm that destination with the caller, then collect only missing name and reason. Do not claim the requested person is absent or that their phone was tried.' };
}
const placeholders = new Set(['caller', 'unknown', 'anonymous', 'n a', 'none', 'not provided', 'not supplied', 'withheld']);
export function transferIntake(input = {}, { maxReason = 400 } = {}) {
  const name = typeof input.callerName === 'string' ? input.callerName.trim() : '', reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const missing = [];
  if (!name || name.length > 120 || placeholders.has(tokens(name).join(' '))) missing.push('callerName');
  if (!reason || reason.length > maxReason || placeholders.has(tokens(reason).join(' '))) missing.push('reason');
  if (input.callerDetailsConfirmed !== true) missing.push('callerDetailsConfirmed');
  // Older clients may still send "patient"; it means an ordinary customer here.
  const callerType = input.callerType === 'patient' ? 'customer' : (input.callerType || 'other'), companyName = typeof input.companyName === 'string' ? input.companyName.trim() : '';
  if (!CALLER_TYPES.includes(callerType)) missing.push('callerType');
  if (input.companyName != null && typeof input.companyName !== 'string' || companyName.length > 200) missing.push('companyName');
  return missing.length ? { ok: false, reason: 'caller_details_required', missing, instruction: 'Ask one brief question for the first missing detail only; reuse details already given. Confirm the introduction once before acting. Never invent details or use placeholders.' } : { ok: true, callerName: name, reason, callerType, companyName };
}
export function callbackPolicy(attempts = []) {
  const failed = attempts.filter(t => ['declined', 'no_answer', 'failed'].includes(t.status));
  return { afterFailure: failed.length > 0, callbackOnly: failed.some(t => t.status === 'declined' || t.caller_type === 'sales') };
}
export const CALLBACK_INSTRUCTIONS = 'Briefly say that the requested person or role is unavailable; do not reveal a decline, a private name or a reason. Offer to take a callback request. If agreed, reuse the caller name and reason already collected. Call get_callback_number with no number to check incoming caller ID, or pass a callback number the caller already supplied. If a number is available, read it and ask whether staff should call that number or a different one. If unavailable, ask for a callback number. Local numbers are accepted: pass the digits to get_callback_number without inventing a country code. Use callbackCountry only when the caller specifies the country. Ask one question at a time for missing details; company only when relevant to business/sales. Confirm the prepared number once and get agreement before save_callback. Correct invalid or ambiguous numbers instead of giving up. Once saved, simply say "Thank you, I will pass that on." Do not narrate the process, promise a return time or guarantee a callback. Do not suggest another transfer after a decline or failed sales call.';
export const NAMED_TRANSFER_INSTRUCTIONS = `
STAFF TRANSFER — RECEPTIONIST FLOW
- Always call find_transfer_target for a request to speak to a person or team before claiming a direct connection is unavailable. For a role-only request, use requestedRole with an empty requestedName: office/branch manager means manager; billing/accounts team means billing; support/customer service means support; a professional such as a doctor, lawyer, advisor or technician means specialist. For other departments pass the caller's department words as requestedName with an empty requestedRole. Say only the requested role/department, never a name selected by the directory. For a named request use only the caller-supplied name; never replace it with a role default. A request to book an appointment with a named person is not automatically a request to telephone that person.
- If the destination is unclear, ask one brief clarification when useful. An unresolved name, department or role may return the configured front desk. Say briefly that reception can help and confirm that destination with the caller; use fallbackConfirmed:true only after agreement. Do not say the originally requested person will answer or is absent. If no unique front desk is configured, offer an agreed callback. Never list private staff names.
- Ask for only the missing caller name and short reason, one question at a time. Ask for company only when relevant to a business or sales enquiry. Do not ask a customer or friend for a company, or require a callback number to transfer a live call.
- Confirm the short introduction once, using the requested role or caller-supplied name. For example: "Alex, calling the manager about an invoice—is that right?" Use callerDetailsConfirmed:true only after agreement. Reuse confirmed details after a side question; recheck only a changed detail. If the caller declines, offer other help rather than repeating the questions.
- Pass the opaque targetId from the latest lookup to request_warm_transfer. Never use a caller-provided telephone destination. Include only the agreed name, brief reason and relevant company; callerType is customer, sales (someone selling to this business), business, personal or other. Do not assume a friend or business partner is a sales caller.
- The gateway handles the hold message, private introduction and staff acceptance. Do not narrate those mechanics to the caller or promise that staff will answer.
- After a decline, or after any failed sales transfer, offer a callback and do not try another staff member. For other failed attempts, offer a callback first; transfer to reception only if the caller explicitly requests it and the gateway allows it (alternativeRequested:true). Never automatically pass callers around.
- ${CALLBACK_INSTRUCTIONS}
`;
