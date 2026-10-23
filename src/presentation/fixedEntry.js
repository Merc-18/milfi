import { addAmounts, normalizeAmount } from '../domain/amounts.js';

/**
 * New monthly GF actual for a subcategory: 'add' sums the amount to what is
 * registered (an unregistered total starts from the amount), 'replace' sets it.
 * Exact decimals; null while the amount is not a valid non-negative amount.
 */
export function fixedExpenseTotal(current, amount, mode = 'add') {
  const value = typeof amount === 'string' ? normalizeAmount(amount) : null;
  if (value === null) return null;
  return mode === 'replace' || current == null ? value : addAmounts(current, value);
}
