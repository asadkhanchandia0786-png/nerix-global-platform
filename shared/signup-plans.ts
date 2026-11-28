export const SIGNUP_PLANS = {
  payg: { name: 'Pay as you go', perMinuteUsd: 0.37, prepaidUsd: 100 },
  starter: { name: 'Starter Monthly', monthlyUsd: 49, includedMinutes: 150 },
  growth: { name: 'Growth Monthly', monthlyUsd: 139, includedMinutes: 500 },
  scale: { name: 'Scale Monthly', monthlyUsd: 299, includedMinutes: 1200 },
} as const;

// Reference rates and rounding follow nerixglobal.com/#pricing (14 November 2026).
const SIGNUP_CURRENCIES = {
  USD: { symbol: '$', unitsPerUsd: 1, minuteDigits: 2, monthlyStep: 1, prepaidStep: 5 },
  GBP: { symbol: '£', unitsPerUsd: 0.754, minuteDigits: 2, monthlyStep: 1, prepaidStep: 5 },
  EUR: { symbol: '€', unitsPerUsd: 0.903, minuteDigits: 2, monthlyStep: 1, prepaidStep: 5 },
  CAD: { symbol: 'C$', unitsPerUsd: 1.39, minuteDigits: 2, monthlyStep: 1, prepaidStep: 5 },
  AUD: { symbol: 'A$', unitsPerUsd: 1.40, minuteDigits: 2, monthlyStep: 1, prepaidStep: 5 },
  AED: { symbol: 'AED ', unitsPerUsd: 3.6725, minuteDigits: 2, monthlyStep: 5, prepaidStep: 5 },
  SAR: { symbol: 'SAR ', unitsPerUsd: 3.75, minuteDigits: 2, monthlyStep: 5, prepaidStep: 5 },
  PKR: { symbol: 'Rs ', unitsPerUsd: 278, minuteDigits: 0, monthlyStep: 100, prepaidStep: 500 },
} as const;

type SignupPlan = keyof typeof SIGNUP_PLANS;
type SignupCurrency = keyof typeof SIGNUP_CURRENCIES;
export const DEFAULT_SIGNUP_CURRENCY: SignupCurrency = 'GBP';

export function readSignupPlan(value: unknown): SignupPlan | undefined {
  const plan = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(SIGNUP_PLANS, plan) ? plan as SignupPlan : undefined;
}

export function readSignupCurrency(value: unknown): SignupCurrency | undefined {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return Object.hasOwn(SIGNUP_CURRENCIES, currency) ? currency as SignupCurrency : undefined;
}

export function signupPlanDetails(plan: SignupPlan, currency: SignupCurrency): string {
  const selected = SIGNUP_PLANS[plan];
  const { symbol, unitsPerUsd, minuteDigits, monthlyStep, prepaidStep } = SIGNUP_CURRENCIES[currency];
  const format = (amount: number, digits = 0) => symbol + amount.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const round = (usd: number, step: number) => Math.round(usd * unitsPerUsd / step) * step;

  if ('perMinuteUsd' in selected) {
    const rate = format(selected.perMinuteUsd * unitsPerUsd, minuteDigits);
    const minimumCredit = format(round(selected.prepaidUsd, prepaidStep));
    return `${rate}/min · Prepaid credit from ${minimumCredit} · Billed per second`;
  }
  const price = format(round(selected.monthlyUsd, monthlyStep));
  const minutes = selected.includedMinutes.toLocaleString('en-US');
  return `${price}/month · ${minutes} included minutes`;
}
