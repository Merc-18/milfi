import { addAmounts, compareAmounts, percentageOf } from '../domain/amounts.js';
import { moneyDifference } from '../domain/fiorellaSession.js';
import { summarizeExpenses } from '../domain/fiorellaDashboard.js';

// Display states only, from exact decimal strings (no Number(), no rounding).
// ok < 90 % of the limit; aviso 90–100 %; excedido above it. A zero limit is
// neutral while nothing was spent and exceeded as soon as something was.
export function usageStatus(spent, limit) {
  if (spent == null || limit == null) return null;
  if (compareAmounts(limit, '0') === 0) return compareAmounts(spent, '0') > 0 ? 'excedido' : 'neutral';
  if (compareAmounts(spent, limit) > 0) return 'excedido';
  return compareAmounts(spent, percentageOf(limit, 90)) >= 0 ? 'aviso' : 'ok';
}

// Savings invert the logic: reaching the plan is good; below it is only neutral.
export function savingsStatus(deposited, planned) {
  if (deposited == null || planned == null) return 'neutral';
  return compareAmounts(deposited, planned) >= 0 ? 'ok' : 'neutral';
}

/**
 * "Te queda por gastar": (GV asignado − GV gastado) + (GF aplicado − GF real).
 * The applied GF is the limit, so it matches the distribution's surplus; an
 * unregistered GF actual counts as nothing spent yet. The result may be negative.
 * status: missing-income | missing-fixed | deficit | zero-surplus | remaining | over | equal
 */
export function remainingToSpend(summary) {
  const income = summary.monthly?.income ?? null;
  const applied = summary.monthly?.appliedFixedExpense ?? null;
  if (income === null) return { status: 'missing-income', amount: null };
  if (applied === null) return { status: 'missing-fixed', amount: null };
  if (summary.calculation.status !== 'calculated') {
    return { status: summary.calculation.reason === 'ZERO_SURPLUS_POLICY_PENDING' ? 'zero-surplus' : 'deficit', amount: null };
  }
  const allocated = summary.calculation.distribution.variable.total;
  const variableSpent = summarizeExpenses(summary).variable.amount ?? '0';
  const fixedSpent = summary.actual.amount ?? '0';
  const parts = [moneyDifference(allocated, variableSpent), moneyDifference(applied, fixedSpent)];
  const sum = status => parts.filter(part => part.status === status).map(part => part.amount).reduce(addAmounts, '0');
  const spent = addAmounts(variableSpent, fixedSpent);
  const limit = addAmounts(allocated, applied);
  return { ...moneyDifference(sum('remaining'), sum('over')), spent, limit, tone: usageStatus(spent, limit) };
}
