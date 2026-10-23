import { formatAmount } from '../../presentation/format.js';

// "S/ 80.00 de S/ 100.00", saying in words which side is still unregistered.
export function pairText(actual, budget) {
  if (actual == null && budget == null) return 'Sin registrar';
  if (budget == null) return `${formatAmount(actual)}, presupuesto sin registrar`;
  if (actual == null) return `Gasto sin registrar, presupuesto ${formatAmount(budget)}`;
  return `${formatAmount(actual)} de ${formatAmount(budget)}`;
}

export const isMissing = record => record?.budgetAmount == null || record?.actualAmount == null;
