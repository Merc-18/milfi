import { addAmounts, compareAmounts, hasFractionalCent, normalizeAmount, percentageOf, subtractAmounts } from './amounts.js';
import { calculateDistribution } from './distribution.js';
import { FINANCIAL_RULES } from './financialRules.js';
import { isValidPeriod } from './models.js';
import { periodKey } from './fiorellaSession.js';

function fractionParts(value) {
  const [whole, decimals = ''] = value.split('.');
  return [BigInt(whole + decimals), 10n ** BigInt(decimals.length)];
}

function rational(numerator, denominator) {
  let a = numerator; let b = denominator;
  while (b) [a, b] = [b, a % b];
  const n = numerator / a; const d = denominator / a;
  let rest = d; let twos = 0; let fives = 0;
  while (rest % 2n === 0n) { rest /= 2n; twos++; }
  while (rest % 5n === 0n) { rest /= 5n; fives++; }
  let decimal = null;
  if (rest === 1n) {
    const scale = Math.max(twos, fives);
    const digits = (n * (10n ** BigInt(scale)) / d).toString().padStart(scale + 1, '0');
    const tail = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
    decimal = scale ? `${digits.slice(0, -scale)}${tail ? `.${tail}` : ''}` : digits;
  }
  return { numerator: n.toString(), denominator: d.toString(), decimal };
}

/** Excel Simulador F28/F29: target / months; then / savings-to-couple + GF cap.
 * Exact fractions preserve non-terminating results without selecting rounding.
 */
export function estimateSavingsGoal(input = {}) {
  const { target, months } = input ?? {};
  if (target === '' || months === '') return { status: 'incomplete' };
  const amount = typeof target === 'string' ? normalizeAmount(target) : null;
  const count = typeof months === 'string' && /^\d+$/.test(months) ? Number(months) : NaN;
  if (amount === null || compareAmounts(amount, '0') <= 0) return { status: 'invalid', reason: 'INVALID_TARGET' };
  if (!Number.isSafeInteger(count) || count <= 0) return { status: 'invalid', reason: 'INVALID_MONTH_COUNT' };
  const [n, d] = fractionParts(amount);
  const [rateN, rateD] = fractionParts(percentageOf(percentageOf('1', FINANCIAL_RULES.savingsPercentage), FINANCIAL_RULES.coupleSavingsPercentage));
  const [gfN, gfD] = fractionParts(FINANCIAL_RULES.fixedExpenseCap);
  const m = BigInt(count);
  const monthlyContribution = rational(n, d * m);
  const requiredIncome = rational(n * rateD * gfD + gfN * d * m * rateN, d * m * rateN * gfD);
  return { status: 'estimated', target: amount, months: count, monthlyContribution, requiredIncome,
    assumedFixedExpense: FINANCIAL_RULES.fixedExpenseCap,
    requiresRoundingDecision: [monthlyContribution, requiredIncome].some(value => value.decimal === null || hasFractionalCent(value.decimal)) };
}

function inspectScenario(record) {
  if (!record || record.origin !== 'simulated' || record.validationStatus !== 'pending' || record.moduleId !== 'fiorella'
    || record.provenance?.type !== 'manual-simulation' || !isValidPeriod(record.period) || typeof record.id !== 'string' || !record.id.trim()) {
    return { status: 'invalid', reason: 'HYPOTHETICAL_SCENARIO_REQUIRED' };
  }
  return calculateDistribution({ income: record.distribution?.income, fixedExpense: record.distribution?.fixedExpense });
}

const metrics = Object.freeze([
  ['income', 'Ingreso'], ['fixedExpense', 'GF'], ['variable.total', 'GV'], ['savings.total', 'Ahorro total'],
  ['savings.personal', 'Ahorro personal'], ['savings.couple', 'Ahorro de pareja'],
  ['variable.categories.salud', 'Salud'], ['variable.categories.ocio', 'Ocio'],
]);
const metricValue = (distribution, key) => key.split('.').reduce((value, part) => value[part], distribution);

export function compareScenarios(left, right) {
  const a = inspectScenario(left); const b = inspectScenario(right);
  if (a.status !== 'calculated' || b.status !== 'calculated') return { status: 'blocked', reason: 'UNRESOLVED_SCENARIO' };
  if (left.id.trim() === right.id.trim()) return { status: 'blocked', reason: 'SAME_SCENARIO' };
  return { status: 'compared', requiresRoundingDecision: a.requiresRoundingDecision || b.requiresRoundingDecision,
    rows: metrics.map(([key, label]) => {
      const from = metricValue(a.distribution, key); const to = metricValue(b.distribution, key);
      const direction = compareAmounts(to, from);
      return { key, label, left: from, right: to, direction: direction > 0 ? 'higher' : direction < 0 ? 'lower' : 'equal',
        difference: direction < 0 ? subtractAmounts(from, to) : subtractAmounts(to, from) };
    }) };
}

// Explicit selected periods only. Never fill gaps, repeat a scenario or use a
// partial sum when any selected period is unresolved. Alternatives are not added.
export function projectScenarios(records) {
  if (!Array.isArray(records) || !records.length) return { status: 'incomplete', reason: 'SELECT_PERIODS' };
  const ids = new Set(); const periods = new Set(); const rows = [];
  for (const record of records) {
    const result = inspectScenario(record);
    if (result.status !== 'calculated') return { status: 'blocked', reason: 'UNRESOLVED_SCENARIO' };
    if (ids.has(record.id.trim())) return { status: 'blocked', reason: 'DUPLICATE_SCENARIO' };
    if (periods.has(periodKey(record.period))) return { status: 'blocked', reason: 'ALTERNATIVES_SHARE_PERIOD' };
    ids.add(record.id.trim()); periods.add(periodKey(record.period));
    rows.push({ id: record.id, period: { ...record.period }, distribution: result.distribution, requiresRoundingDecision: result.requiresRoundingDecision });
  }
  rows.sort((a, b) => periodKey(a.period).localeCompare(periodKey(b.period)));
  let couple = '0'; let personal = '0';
  for (const row of rows) {
    couple = addAmounts(couple, row.distribution.savings.couple);
    personal = addAmounts(personal, row.distribution.savings.personal);
    row.cumulativeCouple = couple;
  }
  return { status: 'projected', rows, couple, personal, requiresRoundingDecision: rows.some(row => row.requiresRoundingDecision) };
}

export function compareGoalCapacity(goal, records) {
  if (goal?.origin !== undefined && goal.origin !== 'simulated'
    || goal?.validationStatus !== undefined && goal.validationStatus !== 'pending'
    || goal?.scope !== undefined && goal.scope !== 'couple') return { status: 'blocked', reason: 'HYPOTHETICAL_GOAL_REQUIRED' };
  const estimate = estimateSavingsGoal(goal);
  if (estimate.status !== 'estimated') return estimate;
  const projection = projectScenarios(records);
  if (projection.status !== 'projected') return { status: projection.status, reason: projection.reason };
  if (projection.rows.length !== estimate.months) return { status: 'incomplete', reason: 'HORIZON_MISMATCH', selected: projection.rows.length, required: estimate.months };
  const serials = projection.rows.map(row => row.period.year * 12 + row.period.month);
  if (serials.some((serial, index) => index > 0 && serial !== serials[index - 1] + 1)) return { status: 'decision_required', reason: 'GOAL_TIMELINE_PENDING' };
  const direction = compareAmounts(projection.couple, estimate.target);
  return { status: 'compared', capacity: projection.couple, personalExcluded: projection.personal,
    outcome: direction < 0 ? 'shortfall' : direction > 0 ? 'above' : 'equal',
    difference: direction < 0 ? subtractAmounts(estimate.target, projection.couple) : subtractAmounts(projection.couple, estimate.target),
    requiresRoundingDecision: estimate.requiresRoundingDecision || projection.requiresRoundingDecision };
}
