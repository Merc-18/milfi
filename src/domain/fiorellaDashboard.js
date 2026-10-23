import { addAmounts } from './amounts.js';
import { periodKey, summarizeFiorella } from './fiorellaSession.js';
import { summarizeLedger } from './controlLedger.js';
import { isValidPeriod } from './models.js';
import { FIXED_CATEGORIES } from './fiorellaCategories.js';

// Read-only views for the dashboards. Every figure comes from the existing
// summaries (official distribution, recorded amounts, reviewed Control
// movements); nothing here adds a formula, a balance or a rounding rule.
const total = values => { const present = values.filter(value => typeof value === 'string'); return present.length ? present.reduce(addAmounts, '0') : null; };

/**
 * Money actually spent in a month, from one summarizeFiorella() result: GF real
 * is the sum of recorded actualAmount (NULL stays unregistered, 0 counts), GV
 * real the sum of the month's variable expenses, and the total adds each record
 * once. Budgets, GV allocations, planned savings and Control deposits are never
 * part of it. The total is partial while some GF subcategories lack an actual.
 */
export function summarizeExpenses(summary) {
  const fixed = summary.actual;
  const variable = { amount: total(summary.variable.map(record => record.amount)), count: summary.variable.length };
  const parts = [fixed.amount, variable.amount].filter(value => value !== null);
  return { fixed, variable,
    total: { amount: parts.length ? parts.reduce(addAmounts, '0') : null, partial: fixed.status !== 'complete' } };
}

/** The 19 GF subcategories by group, each with its record (or null) and the group's recorded budget/actual subtotals. */
export function fixedGroups(summary) {
  return FIXED_CATEGORIES.map(group => {
    const rows = group.children.map(category => ({ category, record: summary.fixed.find(item => item.categoryId === category.id) ?? null }));
    return { id: group.id, name: group.name, rows,
      budget: total(rows.map(row => row.record?.budgetAmount)), actual: total(rows.map(row => row.record?.actualAmount)) };
  });
}

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
      variableActual: summarizeExpenses(summary).variable.amount, variableCount: summary.variable.length,
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
