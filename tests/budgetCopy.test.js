import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { applyBudgetCopy, copyPreviousBudgets, previousPeriod } from '../src/presentation/budgetCopy.js';

// Invented values only.
let sequence = 0;
const storeWith = (...budgets) => {
  const store = createMilfiStore();
  for (const [period, categoryId, budgetAmount, actualAmount = ''] of budgets) {
    assert.equal(store.getState().saveFiorellaDemo({ id: `copy-${++sequence}`, eventId: `copy-event-${sequence}`, kind: 'fixed-budget', period,
      categoryId, budgetAmount, actualAmount, expectedRevision: 0, occurredAt: '2020-01-01T12:00:00.000Z' }).ok, true);
  }
  return store;
};
const march = { year: 2045, month: 3 };
const february = { year: 2045, month: 2 };
const fixedOf = (store, period, id) => summarizeFiorella(store.getState().fiorellaDemoRecords, period).fixed.find(record => record.categoryId === id);

test('previous period crosses the year from January to December', () => {
  assert.deepEqual(previousPeriod({ year: 2045, month: 1 }), { year: 2044, month: 12 });
  assert.deepEqual(previousPeriod(march), february);
});

test('copy fills only empty budgets, never overwrites, never copies actuals and keeps unregistered actuals null', async () => {
  const store = storeWith([february, 'servicios-gas', '50', '45'], [february, 'servicios-luz', '0', '12'], [february, 'servicios-agua', '33.333'],
    [march, 'servicios-gas', '70'], [march, 'servicios-luz', '', '8.5']);
  const plan = copyPreviousBudgets(store.getState().fiorellaDemoRecords, march);
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.items.map(item => [item.category.id, item.amount]), [['servicios-luz', '0'], ['servicios-agua', '33.333']]);
  assert.equal(plan.total, '33.333');
  const result = await applyBudgetCopy(plan.items, march, input => store.getState().saveFiorellaDemo(input));
  assert.deepEqual([result.saved.length, result.failed.length], [2, 0]);
  assert.deepEqual([fixedOf(store, march, 'servicios-gas').budgetAmount, fixedOf(store, march, 'servicios-gas').actualAmount], ['70', null]);
  assert.deepEqual([fixedOf(store, march, 'servicios-luz').budgetAmount, fixedOf(store, march, 'servicios-luz').actualAmount], ['0', '8.5']);
  // '' is stored as unregistered (null), not as zero.
  assert.deepEqual([fixedOf(store, march, 'servicios-agua').budgetAmount, fixedOf(store, march, 'servicios-agua').actualAmount], ['33.333', null]);
  assert.equal(fixedOf(store, february, 'servicios-gas').budgetAmount, '50');
  assert.equal(copyPreviousBudgets(store.getState().fiorellaDemoRecords, march).status, 'nothing-to-copy');
});

test('copy is unavailable with an empty previous month or a complete current month, and crosses the year', async () => {
  assert.equal(copyPreviousBudgets(storeWith([march, 'servicios-gas', '1']).getState().fiorellaDemoRecords, march).status, 'previous-empty');
  assert.equal(copyPreviousBudgets(storeWith([february, 'servicios-gas', '', '20']).getState().fiorellaDemoRecords, march).status, 'previous-empty');
  const { FIXED_SUBCATEGORIES } = await import('../src/domain/fiorellaCategories.js');
  const complete = storeWith([february, 'servicios-gas', '1'], ...FIXED_SUBCATEGORIES.map(category => [march, category.id, '2']));
  assert.equal(copyPreviousBudgets(complete.getState().fiorellaDemoRecords, march).status, 'current-complete');
  const january = { year: 2046, month: 1 };
  const crossed = copyPreviousBudgets(storeWith([{ year: 2045, month: 12 }, 'comida-proteinas', '210']).getState().fiorellaDemoRecords, january);
  assert.deepEqual([crossed.status, crossed.from, crossed.items.map(item => item.amount)], ['ready', { year: 2045, month: 12 }, ['210']]);
});

test('partial failures are reported item by item without rollback', async () => {
  const store = storeWith([february, 'servicios-gas', '50'], [february, 'servicios-luz', '60'], [february, 'servicios-agua', '70']);
  const plan = copyPreviousBudgets(store.getState().fiorellaDemoRecords, march);
  const result = await applyBudgetCopy(plan.items, march, async input => {
    if (input.categoryId === 'servicios-luz') return { ok: false, errors: ['PERSISTENCE_ERROR'] };
    if (input.categoryId === 'servicios-agua') throw new Error('network');
    return store.getState().saveFiorellaDemo(input);
  });
  assert.deepEqual(result.saved.map(item => item.category.id), ['servicios-gas']);
  assert.deepEqual(result.failed.map(item => [item.category.id, item.result.errors[0]]), [['servicios-luz', 'PERSISTENCE_ERROR'], ['servicios-agua', 'PERSISTENCE_ERROR']]);
  assert.equal(fixedOf(store, march, 'servicios-gas').budgetAmount, '50');
  assert.equal(fixedOf(store, march, 'servicios-luz'), undefined);
});
