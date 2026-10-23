import assert from 'node:assert/strict';
import test from 'node:test';
import { withFixedCap } from '../src/presentation/fixedCap.js';

test('months without an applied GF are read with the cap in memory; other values and records stay as they are', () => {
  const records = [
    { id: 'a', kind: 'monthly-plan', income: '4000', appliedFixedExpense: null },
    { id: 'b', kind: 'monthly-plan', income: '4000', appliedFixedExpense: '1200' },
    { id: 'c', kind: 'fixed-budget', categoryId: 'servicios-luz', budgetAmount: null, actualAmount: '10' },
  ];
  const frozen = structuredClone(records);
  const read = withFixedCap(records);
  assert.deepEqual(read.map(record => record.appliedFixedExpense), ['1500', '1200', undefined]);
  assert.equal(read[1], records[1]);
  assert.equal(read[2], records[2]);
  assert.deepEqual(records, frozen, 'nothing is written back');
});
