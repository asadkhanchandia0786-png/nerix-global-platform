export const SERVICES = { outbound: { name: 'Lead generation', rate: 300000 }, basic: { name: 'Reception & support', rate: 500000 }, advanced: { name: 'Advanced support', rate: 750000 } } as const;
export type Service = keyof typeof SERVICES;
export const CURRENCIES = [
  ['USD', 'United States', '$'], ['PKR', 'Pakistan', '₨'], ['GBP', 'United Kingdom', '£'],
  ['EUR', 'Euro area', '€'], ['CAD', 'Canada', 'C$'], ['AED', 'United Arab Emirates', 'د.إ'], ['SAR', 'Saudi Arabia', '﷼']
] as const;
export const DISPOSITIONS = ['New', 'No answer', 'Busy', 'IVR reached', 'Email provided', 'Decision maker unavailable', 'Callback requested', 'Interested', 'Meeting booked', 'Transferred', 'Not interested', 'Do not call', 'Invalid number', 'Failed'] as const;
export const ROLES = ['owner', 'manager', 'staff', 'viewer'] as const;
export const INTERNAL_ROLES = ['operations', 'support', 'closer', 'partner'] as const;
export const USD = 1000000;
export const money = (micros: number | string, digits = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(micros) / USD);
