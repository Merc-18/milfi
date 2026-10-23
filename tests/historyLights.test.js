import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { fiorellaEvolution } from '../src/domain/fiorellaDashboard.js';
import { withFixedCap } from '../src/presentation/fixedCap.js';
import { historyLights } from '../src/presentation/historyLights.js';

const words = lights => [lights.fixed.word, lights.variable.word];
const tones = lights => [lights.fixed.light, lights.variable.light];

test('history lights use the usage thresholds and say "Sin datos" without real or limit', () => {
  assert.deepEqual(words(historyLights({ fixedActual: '1349.99', appliedFixed: '1500', variableActual: '900', variablePlanned: '1000' })), ['Bien', 'Cerca']);
  assert.deepEqual(words(historyLights({ fixedActual: '1500', appliedFixed: '1500', variableActual: '1000.01', variablePlanned: '1000' })), ['Cerca', 'Excedido']);
  assert.deepEqual(tones(historyLights({ fixedActual: '1600', appliedFixed: '1500', variableActual: '1', variablePlanned: '1000' })), ['rojo', 'verde']);
  assert.deepEqual(words(historyLights({ fixedActual: null, appliedFixed: '1500', variableActual: '5', variablePlanned: null })), ['Sin datos', 'Sin datos']);
  assert.deepEqual(tones(historyLights({ fixedActual: null, appliedFixed: '1500', variableActual: null, variablePlanned: '10' })), ['gris', 'gris']);
});

test('GF compares with the applied GF of that month: the cap when none was stored, the stored value when different', () => {
  const store = createMilfiStore();
  let sequence = 0;
  const save = (period, kind, fields) => assert.equal(store.getState().saveFiorellaDemo({ id: `light-${++sequence}`, eventId: `light-e-${sequence}`, kind, period,
    expectedRevision: 0, occurredAt: '2020-01-01T12:00:00.000Z', ...fields }).ok, true);
  const old = { year: 2047, month: 1 };
  const plain = { year: 2047, month: 2 };
  // An old month kept with GF 1,200 and a month saved without GF, both with GF real 1,300.
  save(old, 'monthly-plan', { income: '4000', appliedFixedExpense: '1200' });
  save(plain, 'monthly-plan', { income: '4000', appliedFixedExpense: '' });
  for (const period of [old, plain]) save(period, 'fixed-budget', { categoryId: 'servicios-luz', budgetAmount: '', actualAmount: '1300' });
  const rows = fiorellaEvolution(withFixedCap(store.getState().fiorellaDemoRecords), 'simulated');
  assert.deepEqual(rows.map(row => row.appliedFixed), ['1200', '1500']);
  // 1,300 > 1,200 exceeds the stored GF; against the cap 1,300 / 1,500 = 86.7 % is fine.
  assert.deepEqual(rows.map(row => historyLights(row).fixed.word), ['Excedido', 'Bien']);
});
