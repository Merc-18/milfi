import { FINANCIAL_RULES } from '../domain/financialRules.js';

// The applied GF is always the official cap. Months saved without one are read
// with the cap, in memory only; a different stored value is kept as it is until
// its owner edits the month (the form then saves the cap). Nothing is written here.
export const withFixedCap = records => records.map(record => record.kind === 'monthly-plan' && record.appliedFixedExpense == null
  ? { ...record, appliedFixedExpense: FINANCIAL_RULES.fixedExpenseCap } : record);
