import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { sessionCommand } from '../src/presentation/fiorellaSession.js';
import { fixedExpenseTotal } from '../src/presentation/fixedEntry.js';

test('fixed expense total adds to the month (empty or not) or replaces it, exactly', () => {
  assert.equal(fixedExpenseTotal(null, '80'), '80');
  assert.equal(fixedExpenseTotal('80', '80'), '160');
  assert.equal(fixedExpenseTotal('0.1', '0.205', 'add'), '0.305');
  assert.equal(fixedExpenseTotal('80', '45.5', 'replace'), '45.5');
  assert.equal(fixedExpenseTotal(null, '0', 'replace'), '0');
  for (const amount of ['', '-1', 'abc', null]) assert.equal(fixedExpenseTotal('80', amount), null);
});

test('saving the new total keeps the budget exactly as it was', () => {
  const period = { year: 2046, month: 3 };
  const store = createMilfiStore();
  const fixed = id => summarizeFiorella(store.getState().fiorellaDemoRecords, period).fixed.find(record => record.categoryId === id) ?? null;
  const save = (id, amount, mode) => {
    const record = fixed(id);
    return store.getState().saveFiorellaDemo(sessionCommand('fixed-budget', period, record,
      { categoryId: id, budgetAmount: record?.budgetAmount ?? '', actualAmount: fixedExpenseTotal(record?.actualAmount ?? null, amount, mode) }));
  };
  // Adding to an empty month creates the actual without inventing a budget.
  assert.equal(save('servicios-luz', '80', 'add').ok, true);
  assert.deepEqual([fixed('servicios-luz').budgetAmount, fixed('servicios-luz').actualAmount], [null, '80']);
  assert.equal(save('servicios-luz', '80', 'add').ok, true);
  assert.equal(fixed('servicios-luz').actualAmount, '160');
  // With a budget: adding and replacing never touch it.
  assert.equal(store.getState().saveFiorellaDemo(sessionCommand('fixed-budget', period, fixed('servicios-luz'),
    { categoryId: 'servicios-luz', budgetAmount: '150', actualAmount: '160' })).ok, true);
  assert.equal(save('servicios-luz', '12.5', 'add').ok, true);
  assert.deepEqual([fixed('servicios-luz').budgetAmount, fixed('servicios-luz').actualAmount], ['150', '172.5']);
  assert.equal(save('servicios-luz', '99', 'replace').ok, true);
  assert.deepEqual([fixed('servicios-luz').budgetAmount, fixed('servicios-luz').actualAmount], ['150', '99']);
});
