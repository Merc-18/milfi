import { compareAmounts, normalizeAmount } from '../domain/amounts.js';
import { fiorellaEvolution } from '../domain/fiorellaDashboard.js';
import { estimateSavingsGoal } from '../domain/savingsPlanning.js';
import { periodKey } from '../domain/fiorellaSession.js';

// Exact decimal string → [numerator, denominator] as BigInt.
const rational = amount => {
  const [whole, fraction = ''] = amount.split('.');
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
};
const ceilDivide = (numerator, denominator) => (numerator + denominator - 1n) / denominator;

/** ⌈numerator / denominator⌉ to the céntimo, as an exact decimal string (display only). */
export function ceilCents(numerator, denominator) {
  const cents = ceilDivide(BigInt(numerator) * 100n, BigInt(denominator));
  return normalizeAmount(`${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`);
}

/** period + count months (count may be 0). */
export function addMonths({ year, month }, count) {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * C: couple savings of the selected month's calculated distribution, else of the
 * most recent earlier month that has one. `from` is the month it comes from.
 */
export function couplePlanCapacity(records, selected, origin = 'simulated') {
  const key = periodKey(selected);
  const rows = fiorellaEvolution(records, origin).filter(row => row.couplePlanned != null && row.key <= key);
  const row = rows.at(-1);
  return row ? { status: 'ready', amount: row.couplePlanned, from: row.period } : { status: 'empty', amount: null, from: null };
}

/** M = ⌈target / C⌉ for C > 0, else null. */
export function monthsToReach(target, capacity) {
  if (capacity == null || compareAmounts(capacity, '0') <= 0) return null;
  const [tN, tD] = rational(target);
  const [cN, cD] = rational(capacity);
  return Number(ceilDivide(tN * cD, tD * cN));
}

/**
 * One goal against capacity C, starting in the current month (Lima): the M-th
 * contribution falls in current + M − 1, and the goal's own term ends in
 * current + months − 1. N = target / months (exact); ok when C ≥ N, otherwise the
 * monthly shortfall X = N − C. N, X and the required income are rounded up to the
 * céntimo only for display.
 * status: ok | aviso | no-estimate (no C) | no-capacity (C = 0) | invalid
 */
export function goalPlan(goal, capacity, current) {
  const estimate = estimateSavingsGoal({ target: goal.target, months: goal.months });
  if (estimate.status !== 'estimated') return { status: 'invalid' };
  const n = BigInt(estimate.monthlyContribution.numerator);
  const d = BigInt(estimate.monthlyContribution.denominator);
  const base = { target: estimate.target, termMonths: estimate.months, deadline: addMonths(current, estimate.months - 1),
    needed: ceilCents(n, d), requiredIncome: ceilCents(estimate.requiredIncome.numerator, estimate.requiredIncome.denominator) };
  if (capacity == null) return { ...base, status: 'no-estimate' };
  if (compareAmounts(capacity, '0') <= 0) return { ...base, status: 'no-capacity' };
  const months = monthsToReach(estimate.target, capacity);
  const [cN, cD] = rational(capacity);
  const onTime = cN * d >= n * cD;
  return { ...base, status: onTime ? 'ok' : 'aviso', months, arrival: addMonths(current, months - 1),
    shortfall: onTime ? null : ceilCents(n * cD - cN * d, d * cD) };
}
