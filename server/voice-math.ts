// Prepaid-minutes math for inbound calls. All money is integer micro-USD (1 USD = 1,000,000).
// Pure functions: no database, no framework imports, so they can be tested anywhere.
export const MIN_START_SECONDS = 15;      // at least this much funded time is required to answer a call
export const FIRST_RESERVE_SECONDS = 60;  // credit held when a call is authorised
export const MAX_FUNDED_SECONDS = 3500;   // upper bound for one call's funded AI time
export const chargeMicros = (rate: number, seconds: number): number => Number((BigInt(Math.round(rate)) * BigInt(Math.round(seconds)) + 59n) / 60n);
export function secondsFor(availableMicros: number, rate: number): number {
  if (!(rate > 0)) return MAX_FUNDED_SECONDS;
  return Math.max(0, Math.min(MAX_FUNDED_SECONDS, Math.floor(Math.max(0, availableMicros) * 60 / rate)));
}
export function admissionBudget(availableMicros: number, rate: number) {
  const seconds = Math.min(FIRST_RESERVE_SECONDS, secondsFor(availableMicros, rate));
  return { seconds, allowed: seconds >= MIN_START_SECONDS, reserve: chargeMicros(rate, seconds) };
}
export function renewBudget(i: { rate: number; fundedSeconds: number; elapsedSeconds: number; detached: boolean; availableExcludingThisCall: number }) {
  // After the AI leaves a transferred call only its completed portion stays reserved; the staff leg never renews AI credit.
  const desired = i.detached ? Math.min(i.elapsedSeconds, i.fundedSeconds) : Math.max(i.fundedSeconds, Math.min(MAX_FUNDED_SECONDS, i.elapsedSeconds + 60));
  const seconds = Math.min(desired, secondsFor(i.availableExcludingThisCall, i.rate));
  return { seconds, reserve: chargeMicros(i.rate, seconds), stop: !i.detached && i.elapsedSeconds >= seconds, detached: i.detached };
}
export function settleBudget(i: { rate: number; fundedSeconds: number; actualSeconds: number; failed: boolean }) {
  const actual = i.failed ? 0 : Math.max(0, Math.ceil(i.actualSeconds));
  const billable = Math.min(actual, Math.max(0, i.fundedSeconds));
  return { billable, charge: chargeMicros(i.rate, billable), unfunded: Math.max(0, actual - billable) };
}
