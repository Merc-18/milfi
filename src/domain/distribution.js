import { FINANCIAL_RULES } from './financialRules.js';
import { compareAmounts, hasFractionalCent, normalizeAmount, percentageOf, subtractAmounts } from './amounts.js';

/** Mathematical preview only. It never creates an income, deposit or real balance. */
export function calculateDistribution({ income, fixedExpense }) {
  if (income === '' || fixedExpense === '') return { status: 'incomplete' };
  const normalizedIncome = normalizeAmount(income);
  const normalizedFixed = normalizeAmount(fixedExpense);
  const issues = [];
  if (normalizedIncome === null) issues.push('INVALID_INCOME');
  if (normalizedFixed === null) issues.push('INVALID_FIXED_EXPENSE');
  if (issues.length) return { status: 'invalid', issues };
  if (compareAmounts(normalizedFixed, FINANCIAL_RULES.fixedExpenseCap) > 0) {
    return { status: 'invalid', issues: ['FIXED_EXPENSE_ABOVE_CAP'] };
  }

  const comparison = compareAmounts(normalizedIncome, normalizedFixed);
  if (comparison <= 0) {
    return {
      status: 'decision_required',
      reason: comparison < 0 ? 'DEFICIT_POLICY_PENDING' : 'ZERO_SURPLUS_POLICY_PENDING',
    };
  }

  const surplus = subtractAmounts(normalizedIncome, normalizedFixed);
  const variableTotal = percentageOf(surplus, FINANCIAL_RULES.variablePercentage);
  const savingsTotal = percentageOf(surplus, FINANCIAL_RULES.savingsPercentage);
  const categories = Object.fromEntries(FINANCIAL_RULES.variableCategories.map(category => [
    category.id, percentageOf(variableTotal, category.percentage),
  ]));
  const personal = percentageOf(savingsTotal, FINANCIAL_RULES.personalSavingsPercentage);
  const couple = percentageOf(savingsTotal, FINANCIAL_RULES.coupleSavingsPercentage);

  return {
    status: 'calculated',
    requiresRoundingDecision: [normalizedIncome, normalizedFixed, surplus, variableTotal,
      savingsTotal, personal, couple, ...Object.values(categories)].some(hasFractionalCent),
    distribution: {
      rulesVersion: FINANCIAL_RULES.version,
      income: normalizedIncome,
      fixedExpense: normalizedFixed,
      surplus,
      variable: { total: variableTotal, categories },
      savings: { total: savingsTotal, personal, couple },
    },
  };
}
