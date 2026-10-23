import { addAmounts } from '../domain/amounts.js';
import { FIXED_SUBCATEGORIES } from '../domain/fiorellaCategories.js';
import { summarizeFiorella } from '../domain/fiorellaSession.js';
import { sessionCommand } from './fiorellaSession.js';

export const previousPeriod = ({ year, month }) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

/**
 * Which GF budgets to copy from the previous month: only subcategories with a
 * previous budget (0 included) and no budget this month. Actuals are never copied.
 * status: ready | previous-empty | current-complete | nothing-to-copy
 */
export function copyPreviousBudgets(records, period, origin = 'simulated') {
  const from = previousPeriod(period);
  const previous = summarizeFiorella(records, from, origin).fixed.filter(record => record.budgetAmount != null);
  const current = summarizeFiorella(records, period, origin);
  const result = status => ({ status, from, items: [], total: null });
  if (!previous.length) return result('previous-empty');
  if (current.budget.status === 'complete') return result('current-complete');
  const items = FIXED_SUBCATEGORIES.flatMap(category => {
    const source = previous.find(record => record.categoryId === category.id);
    const record = current.fixed.find(item => item.categoryId === category.id) ?? null;
    return source && record?.budgetAmount == null ? [{ category, amount: source.budgetAmount, record }] : [];
  });
  if (!items.length) return result('nothing-to-copy');
  return { status: 'ready', from, items, total: items.map(item => item.amount).reduce(addAmounts, '0') };
}

/**
 * Saves each copied budget with the usual command, one per subcategory, keeping
 * the month's actual as it is ('' stays unregistered). No rollback: the caller
 * reports which were saved and which failed.
 */
export async function applyBudgetCopy(items, period, save) {
  const saved = [];
  const failed = [];
  for (const item of items) {
    let result;
    try {
      result = await save(sessionCommand('fixed-budget', period, item.record,
        { categoryId: item.category.id, budgetAmount: item.amount, actualAmount: item.record?.actualAmount ?? '' }));
    } catch {
      result = { ok: false, errors: ['PERSISTENCE_ERROR'] };
    }
    (result.ok ? saved : failed).push({ ...item, result });
  }
  return { saved, failed };
}
