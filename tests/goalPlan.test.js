import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { addMonths, ceilCents, couplePlanCapacity, goalPlan, monthsToReach } from '../src/presentation/goalPlan.js';

// Invented values only. Couple savings = 24 % of income − GF.
let sequence = 0;
const recordsWith = (...months) => {
  const store = createMilfiStore();
  for (const [period, income, appliedFixedExpense] of months) {
    assert.equal(store.getState().saveFiorellaDemo({ id: `goal-${++sequence}`, eventId: `goal-event-${sequence}`, kind: 'monthly-plan', period,
      income, appliedFixedExpense, expectedRevision: 0, occurredAt: '2020-01-01T12:00:00.000Z' }).ok, true);
  }
  return store.getState().fiorellaDemoRecords;
};
const october = { year: 2026, month: 10 };

test('capacity comes from the selected month, else the most recent earlier month, else none', () => {
  const records = recordsWith([{ year: 2026, month: 7 }, '4000', '1500'], [{ year: 2026, month: 8 }, '4500', '1500'], [{ year: 2026, month: 11 }, '9000', '1500'],
    [{ year: 2026, month: 9 }, '1000', '1500']);
  // September is a deficit (no distribution): August is used, never the later November.
  assert.deepEqual(couplePlanCapacity(records, { year: 2026, month: 9 }), { status: 'ready', amount: '720', from: { year: 2026, month: 8 } });
  assert.deepEqual(couplePlanCapacity(records, { year: 2026, month: 8 }), { status: 'ready', amount: '720', from: { year: 2026, month: 8 } });
  assert.deepEqual(couplePlanCapacity(records, { year: 2026, month: 7 }).amount, '600');
  assert.deepEqual(couplePlanCapacity(records, { year: 2026, month: 6 }), { status: 'empty', amount: null, from: null });
  assert.deepEqual(couplePlanCapacity([], october), { status: 'empty', amount: null, from: null });
});

test('rounding up to the céntimo, including a repeating fraction', () => {
  assert.equal(ceilCents(5000n, 7n), '714.29');
  assert.equal(ceilCents(1n, 3n), '0.34');
  assert.equal(ceilCents(100n, 1n), '100');
  assert.equal(ceilCents(12345n, 1000n), '12.35');
  assert.equal(ceilCents(12340n, 1000n), '12.34');
  const plan = goalPlan({ target: '5000', months: '7' }, '700', october);
  assert.deepEqual([plan.needed, plan.status, plan.shortfall], ['714.29', 'aviso', '14.29']);
  // X = 5000/7 − 714.28 = 0.0057… → 0.01: never "a bit less".
  assert.equal(goalPlan({ target: '5000', months: '7' }, '714.28', october).shortfall, '0.01');
  assert.equal(goalPlan({ target: '5000', months: '7' }, '714.29', october).status, 'ok');
});

test('months to reach use the ceiling for exact and inexact divisions', () => {
  assert.equal(monthsToReach('1200', '100'), 12);
  assert.equal(monthsToReach('1200.01', '100'), 13);
  assert.equal(monthsToReach('1000', '0.3'), 3334);
  assert.equal(monthsToReach('50', '600'), 1);
  assert.equal(monthsToReach('50', '0'), null);
  assert.equal(monthsToReach('50', null), null);
});

test('arrival is current month + M − 1, crossing the year, and never before the current month', () => {
  assert.deepEqual(addMonths(october, 13), { year: 2027, month: 11 });
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  const one = goalPlan({ target: '500', months: '2' }, '600', october);
  assert.deepEqual([one.months, one.arrival], [1, october]);
  const fourteen = goalPlan({ target: '1400', months: '20' }, '100', october);
  assert.deepEqual([fourteen.months, fourteen.arrival, fourteen.deadline], [14, { year: 2027, month: 11 }, { year: 2028, month: 5 }]);
  // The capacity may come from a past month; the start is still the current month.
  const records = recordsWith([{ year: 2026, month: 3 }, '4000', '1500']);
  const capacity = couplePlanCapacity(records, { year: 2026, month: 3 });
  const plan = goalPlan({ target: '1200', months: '2' }, capacity.amount, october);
  assert.deepEqual([capacity.from, plan.months, plan.arrival], [{ year: 2026, month: 3 }, 2, { year: 2026, month: 11 }]);
});

test('status: on time when C ≥ N (equal included), short otherwise; no capacity and C = 0', () => {
  assert.deepEqual(goalPlan({ target: '1200', months: '12' }, '100', october).status, 'ok');
  assert.deepEqual(goalPlan({ target: '1200', months: '12' }, '100', october).shortfall, null);
  assert.deepEqual(goalPlan({ target: '1200', months: '12' }, '150', october).status, 'ok');
  const short = goalPlan({ target: '1200', months: '12' }, '99.995', october);
  assert.deepEqual([short.status, short.shortfall, short.months], ['aviso', '0.01', 13]);
  const none = goalPlan({ target: '1200', months: '12' }, null, october);
  assert.deepEqual([none.status, none.needed, none.deadline, none.arrival], ['no-estimate', '100', { year: 2027, month: 9 }, undefined]);
  const zero = goalPlan({ target: '1200', months: '12' }, '0', october);
  assert.deepEqual([zero.status, zero.months], ['no-capacity', undefined]);
  assert.equal(goalPlan({ target: '1200', months: '' }, '100', october).status, 'invalid');
});

test('required income is the workbook estimate rounded up to the céntimo', () => {
  // 1000 / (3 × 0.24) + 1500 = 2888.8…
  assert.equal(goalPlan({ target: '1000', months: '3' }, '100', october).requiredIncome, '2888.89');
  assert.equal(goalPlan({ target: '1200', months: '5' }, '100', october).requiredIncome, '2500');
});
