// Approved configuration only. No workbook transaction data belongs in this file.
export const FINANCIAL_RULES = Object.freeze({
  version: 'fiorella-official-v1',
  source: 'fiorella-configuration-2026',
  fixedExpenseCap: '1500',
  variablePercentage: 40,
  savingsPercentage: 60,
  personalSavingsPercentage: 60,
  coupleSavingsPercentage: 40,
  variableCategories: Object.freeze([
    Object.freeze({ id: 'salud', name: 'Salud', percentage: 50 }),
    Object.freeze({ id: 'ocio', name: 'Ocio', percentage: 50 }),
  ]),
});
