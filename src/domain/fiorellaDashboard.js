import { addAmounts } from './amounts.js';
import { periodKey, summarizeFiorella } from './fiorellaSession.js';
import { summarizeLedger } from './controlLedger.js';
import { isValidPeriod } from './models.js';

// Read-only views for the dashboards. Every figure comes from the existing
// summaries (official distribution, recorded amounts, reviewed Control
// movements); nothing here adds a formula, a balance or a rounding rule.
const total = values => { const present = values.filter(value => typeof value === 'string'); return present.length ? present.reduce(addAmounts, '0') : null; };

/** One row per month with Fiorella data, oldest first. */
export function fiorellaEvolution(records, origin) {
  const periods = new Map(records.filter(record => record.moduleId === 'fiorella' && record.origin === origin && isValidPeriod(record.period))
    .map(record => [periodKey(record.period), record.period]));
  return [...periods.keys()].sort().map(key => {
    const summary = summarizeFiorella(records, periods.get(key), origin);
    const distribution = summary.calculation.status === 'calculated' ? summary.calculation.distribution : null;
    return { key, period: periods.get(key), projected: summary.monthly?.planStatus === 'projected',
      income: summary.monthly?.income ?? null, appliedFixed: summary.monthly?.appliedFixedExpense ?? null,
      fixedBudget: summary.budget.amount, fixedActual: summary.actual.amount, fixedActualRegistered: summary.actual.registered,
      variableActual: total(summary.variable.map(record => record.amount)), variableCount: summary.variable.length,
      variablePlanned: distribution?.variable.total ?? null,
      couplePlanned: distribution?.savings.couple ?? null, personalPlanned: distribution?.savings.personal ?? null };
  });
}

/**
 * Savings deposits actually registered in Control for one contributor and month,
 * per currency (reviewed or imported as prepared), kept apart from planned savings.
 */
export function registeredSavingsDeposits(entries, period, contributorId) {
  const summary = summarizeLedger(entries, period);
  if (summary.status !== 'ledger') return { groups: [], pending: 0 };
  return { groups: summary.groups.filter(group => group.kind === 'deposit' && group.purpose === 'savings' && group.contributorId === contributorId),
    pending: summary.entries.filter(entry => entry.status === 'pending' && entry.record.kind === 'deposit' && entry.record.purpose === 'savings'
      && (entry.record.contributorId === contributorId || entry.record.contributorId == null)).length };
}

/** Control month by month: reviewed totals per currency, kind and destination; pending counts apart. */
export function controlEvolution(entries) {
  const periods = new Map(entries.filter(entry => isValidPeriod(entry.record.period)).map(entry => [periodKey(entry.record.period), entry.record.period]));
  return [...periods.keys()].sort().reverse().map(key => {
    const summary = summarizeLedger(entries, periods.get(key));
    const byCurrency = new Map();
    for (const group of summary.groups) {
      const row = byCurrency.get(group.currency) ?? { currency: group.currency, depositsExpenses: null, depositsSavings: null, withdrawals: null };
      const field = group.kind === 'withdrawal' ? 'withdrawals' : group.purpose === 'savings' ? 'depositsSavings' : 'depositsExpenses';
      row[field] = row[field] === null ? group.total : addAmounts(row[field], group.total);
      byCurrency.set(group.currency, row);
    }
    return { key, period: periods.get(key), currencies: [...byCurrency.values()], pending: summary.pending, movements: summary.entries.length };
  });
}
