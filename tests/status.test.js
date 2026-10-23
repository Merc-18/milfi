import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { remainingToSpend, savingsStatus, usageStatus } from '../src/presentation/status.js';

// Invented values only.
let sequence = 0;
const period = { year: 2045, month: 3 };
const command = (kind, fields) => ({ id: `status-${++sequence}`, eventId: `status-event-${sequence}`, kind, period, expectedRevision: 0,
  occurredAt: '2045-03-01T12:00:00.000Z', ...fields });
const monthWith = (...commands) => {
  const store = createMilfiStore();
  for (const [kind, fields] of commands) assert.equal(store.getState().saveFiorellaDemo(command(kind, fields)).ok, true);
  return summarizeFiorella(store.getState().fiorellaDemoRecords, period);
};

test('usage status: ok below 90 %, aviso from 90 % to 100 %, excedido above, exact at the edges', () => {
  assert.equal(usageStatus('89.99', '100'), 'ok');
  assert.equal(usageStatus('90', '100'), 'aviso');
  assert.equal(usageStatus('100', '100'), 'aviso');
  assert.equal(usageStatus('100.0001', '100'), 'excedido');
  // 90 % of 0.1 is 0.09 exactly; binary floating point would misplace this edge.
  assert.equal(usageStatus('0.09', '0.1'), 'aviso');
  assert.equal(usageStatus('0.089999999999999999', '0.1'), 'ok');
  assert.equal(usageStatus('0', '0'), 'neutral');
  assert.equal(usageStatus('0.01', '0'), 'excedido');
  assert.equal(usageStatus(null, '100'), null);
  assert.equal(usageStatus('1', null), null);
});

test('couple savings status is ok once the plan is reached and neutral before, never aviso', () => {
  assert.equal(savingsStatus('600', '600'), 'ok');
  assert.equal(savingsStatus('600.01', '600'), 'ok');
  assert.equal(savingsStatus('599.99', '600'), 'neutral');
  assert.equal(savingsStatus(null, '600'), 'neutral');
  assert.equal(savingsStatus('10', null), 'neutral');
});

test('remaining to spend uses the applied GF as limit and tells what is missing', () => {
  assert.deepEqual(remainingToSpend(monthWith()), { status: 'missing-income', amount: null });
  assert.deepEqual(remainingToSpend(monthWith(['monthly-plan', { income: '', appliedFixedExpense: '1200' }])), { status: 'missing-income', amount: null });
  assert.deepEqual(remainingToSpend(monthWith(['monthly-plan', { income: '4000', appliedFixedExpense: '' }])), { status: 'missing-fixed', amount: null });
  assert.deepEqual(remainingToSpend(monthWith(['monthly-plan', { income: '1000', appliedFixedExpense: '1500' }])), { status: 'deficit', amount: null });
  // Complete: GV 40 % of 2,500 = 1,000; nothing spent yet and no GF actual registered.
  assert.deepEqual(remainingToSpend(monthWith(['monthly-plan', { income: '4000', appliedFixedExpense: '1500' }])), { status: 'remaining', amount: '2500' });
  // Partial detail: budgets above the applied GF do not change the figure; only actuals count.
  const partial = monthWith(['monthly-plan', { income: '4000', appliedFixedExpense: '1500' }],
    ['fixed-budget', { categoryId: 'servicios-gas', budgetAmount: '2000', actualAmount: '120.10' }],
    ['variable-expense', { categoryId: 'salud', effectiveDate: '2045-03-04', description: 'Inventado', amount: '30.005' }]);
  assert.deepEqual(remainingToSpend(partial), { status: 'remaining', amount: '2349.895' });
});

test('remaining to spend can be negative when overspending exceeds what is left elsewhere', () => {
  const over = monthWith(['monthly-plan', { income: '2000', appliedFixedExpense: '1500' }],
    ['fixed-budget', { categoryId: 'servicios-luz', budgetAmount: null, actualAmount: '1400' }],
    ['variable-expense', { categoryId: 'ocio', effectiveDate: '2045-03-09', description: 'Inventado', amount: '350' }]);
  // GV 200 − 350 = −150; GF 1,500 − 1,400 = +100; total −50.
  assert.deepEqual(remainingToSpend(over), { status: 'over', amount: '50' });
  const equal = monthWith(['monthly-plan', { income: '2000', appliedFixedExpense: '1500' }],
    ['variable-expense', { categoryId: 'ocio', effectiveDate: '2045-03-09', description: 'Inventado', amount: '200' }],
    ['fixed-budget', { categoryId: 'servicios-luz', budgetAmount: null, actualAmount: '1500' }]);
  assert.deepEqual(remainingToSpend(equal), { status: 'equal', amount: '0' });
});
