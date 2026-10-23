import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { currentPeriodInput, formatAmount, formatPeriod, parsePeriodInput } from '../src/presentation/format.js';

const example = {
  id: 'synthetic-simulation', period: { year: 2030, month: 6 },
  income: '4000.01', fixedExpense: '1500', createdAt: '2030-06-03T12:00:00Z',
};

test('new stores contain official rules but no workbook data or legacy mocks', () => {
  const state = createMilfiStore().getState();
  assert.deepEqual(state.fiorellaRecords, []);
  assert.deepEqual(state.controlMovements, []);
  assert.deepEqual(state.simulations, []);
  assert.deepEqual(state.historyStatus, { fiorella: 'awaiting_updated_source', control: 'awaiting_import' });
  assert.equal('agregarIngresoMensual' in state, false);
  assert.equal('currentUser' in state, false);
});

test('saving a simulation does not mutate real history, Control or an earlier simulation', () => {
  const store = createMilfiStore();
  const first = store.getState().saveSimulation(example);
  assert.equal(first.ok, true);
  assert.equal(store.getState().simulations[0].origin, 'simulated');
  assert.equal(store.getState().simulations[0].requiresRoundingDecision, true);
  first.value.distribution.income = '1';
  assert.equal(store.getState().simulations[0].distribution.income, '4000.01');
  assert.equal(store.getState().saveSimulation({ ...example, id: 'another-synthetic', income: '5000' }).ok, true);
  assert.equal(store.getState().simulations.length, 2);
  assert.equal(store.getState().simulations[1].distribution.income, '4000.01');
  assert.deepEqual(store.getState().fiorellaRecords, []);
  assert.deepEqual(store.getState().controlMovements, []);
  assert.equal(createMilfiStore().getState().simulations.length, 0);
});

test('duplicates and invalid simulations cannot overwrite existing data', () => {
  const store = createMilfiStore();
  store.getState().saveSimulation(example);
  const before = store.getState().simulations;
  assert.deepEqual(store.getState().saveSimulation(example), { ok: false, errors: ['DUPLICATE_SIMULATION_ID'] });
  assert.equal(store.getState().saveSimulation({ ...example, id: 'invalid', fixedExpense: '-1' }).ok, false);
  assert.equal(store.getState().simulations, before);
});

test('display preserves exact decimals and periods, including Lima month boundaries', () => {
  assert.equal(formatAmount('1500.006'), 'S/ 1,500.006');
  assert.equal(formatAmount('900'), 'S/ 900.00');
  assert.equal(formatAmount(null), '—');
  assert.equal(currentPeriodInput(new Date('2030-07-01T02:00:00Z')), '2030-06');
  assert.deepEqual(parsePeriodInput('2030-06'), { year: 2030, month: 6 });
  assert.equal(parsePeriodInput('2030-13'), null);
  assert.match(formatPeriod({ year: 2030, month: 6 }), /junio.*2030/);
});
