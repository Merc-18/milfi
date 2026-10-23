import { prepareFiorellaDemo } from '../../src/domain/fiorellaSession.js';
import { FIXED_SUBCATEGORIES } from '../../src/domain/fiorellaCategories.js';

// Invented data only; no workbook, credentials or network/database connection.
export function gfBudgetFixture() {
  const records = [];
  const add = fields => {
    const result = prepareFiorellaDemo({ id: crypto.randomUUID(), eventId: crypto.randomUUID(), expectedRevision: 0,
      occurredAt: '2038-04-01T12:00:00.000Z', period: { year: 2038, month: 4 }, ...fields }, records, [], { origin: 'real' });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    records.push(result.value);
  };
  for (const [index, category] of FIXED_SUBCATEGORIES.entries()) {
    add({ kind: 'fixed-budget', categoryId: category.id, budgetAmount: index === 3 ? '' : '60',
      actualAmount: index === 1 ? '0' : index === 4 ? '' : index === 2 ? '72.005' : '31.50' });
    add({ kind: 'fixed-budget', period: { year: 2038, month: 5 }, categoryId: category.id, budgetAmount: '1.01', actualAmount: '0' });
  }
  add({ kind: 'monthly-plan', income: '4000', appliedFixedExpense: '1500' });
  add({ kind: 'variable-expense', effectiveDate: '2038-04-15', categoryId: 'salud', description: 'Ejemplo sintético', amount: '12.30' });
  return { householdId: 'synthetic-only', fiorella: { ok: true, records, goals: [] }, control: { ok: true, records: [] } };
}
