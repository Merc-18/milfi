import { addAmounts, normalizeAmount } from './amounts.js';
import { isKnownCurrency, partitionMovements } from './models.js';

// Contract-level sum for an explicit scope. No net balance, currency conversion,
// overdraft rule, import, persistence or confirmation operation is provided.
export function sumConfirmedMovements(records, { currency, householdId, purpose, kind } = {}) {
  if (!isKnownCurrency(currency) || typeof householdId !== 'string' || !householdId.trim()
    || !['expenses', 'savings'].includes(purpose) || !['deposit', 'withdrawal'].includes(kind)) {
    return { status: 'blocked', reason: 'EXPLICIT_SCOPE_REQUIRED', total: null };
  }
  const groups = partitionMovements(records);
  const selected = groups.confirmed.filter(record => record.householdId === householdId
    && record.purpose === purpose && record.kind === kind);
  if (selected.some(record => record.currency !== currency)) {
    return { status: 'blocked', reason: 'MIXED_CURRENCIES', total: null };
  }
  if (!selected.length) return { status: 'unavailable', currency, total: null };
  return {
    status: 'available', currency,
    total: selected.reduce((total, record) => addAmounts(total, normalizeAmount(record.amount)), '0'),
  };
}
