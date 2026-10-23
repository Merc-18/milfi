import assert from 'node:assert/strict';
import test from 'node:test';
import { createMilfiStore } from '../src/store/useStore.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { formatAmount } from '../src/presentation/format.js';
import { cumulativeVariableSeries, daysInMonth, groupByDay, pacePhrase, topSubcategories, variablePace } from '../src/presentation/variablePace.js';

// Invented values only. Income 4000 − GF 1500 → GV 1,000 (Salud 500, Ocio 500).
let sequence = 0;
const month = (period, income, expenses) => {
  const store = createMilfiStore();
  const save = (kind, fields) => assert.equal(store.getState().saveFiorellaDemo({ id: `pace-${++sequence}`, eventId: `pace-event-${sequence}`, kind, period,
    expectedRevision: 0, occurredAt: '2045-01-01T12:00:00.000Z', allowSimilar: true, ...fields }).ok, true);
  if (income) save('monthly-plan', { income, appliedFixedExpense: '1500' });
  for (const [day, categoryId, amount, subcategory] of expenses) {
    save('variable-expense', { categoryId, effectiveDate: `${period.year}-${String(period.month).padStart(2, '0')}-${day}`, description: 'Inventado', amount, subcategory });
  }
  return summarizeFiorella(store.getState().fiorellaDemoRecords, period);
};
const april = { year: 2045, month: 4 };
const phrase = (summary, today, category = 'all', period = april) => pacePhrase(variablePace(cumulativeVariableSeries(summary, period, category, today)), formatAmount);

test('days per month include leap years', () => {
  assert.deepEqual([daysInMonth({ year: 2045, month: 4 }), daysInMonth({ year: 2044, month: 2 }), daysInMonth({ year: 2100, month: 2 }), daysInMonth({ year: 2000, month: 2 })], [30, 29, 28, 29]);
});

test('cumulative series: past month to its last day, same-day expenses added exactly, category filter', () => {
  const summary = month(april, '4000', [['03', 'salud', '10.10'], ['03', 'ocio', '0.205'], ['20', 'salud', '5']]);
  const all = cumulativeVariableSeries(summary, april, 'all', '2045-06-01');
  assert.deepEqual([all.timing, all.referenceDay, all.days, all.allocation, all.actual], ['past', 30, 30, '1000', '15.305']);
  assert.deepEqual(all.points.slice(1, 3), [{ day: 2, actual: '0' }, { day: 3, actual: '10.305' }]);
  assert.equal(all.points[29].actual, '15.305');
  const ocio = cumulativeVariableSeries(summary, april, 'ocio', '2045-06-01');
  assert.deepEqual([ocio.allocation, ocio.actual, ocio.points[19].actual], ['500', '0.205', '0.205']);
});

test('cumulative series: current month line stops at today, later expenses are scheduled; a future month has no actual line', () => {
  const summary = month(april, '4000', [['02', 'salud', '7'], ['20', 'salud', '9'], ['20', 'ocio', '0.5'], ['28', 'ocio', '1.25']]);
  const current = cumulativeVariableSeries(summary, april, 'all', '2045-04-15');
  // Everything registered in the month counts, as in the cards and the total.
  assert.deepEqual([current.timing, current.referenceDay, current.upToToday, current.scheduled, current.actual], ['current', 15, '7', '10.75', '17.75']);
  assert.deepEqual([current.points[14].actual, current.points[15].actual], ['7', null]);
  assert.deepEqual(current.later, [{ day: 20, actual: '16.5' }, { day: 28, actual: '17.75' }]);
  const salud = cumulativeVariableSeries(summary, april, 'salud', '2045-04-15');
  assert.deepEqual([salud.scheduled, salud.actual], ['9', '16']);
  const none = cumulativeVariableSeries(month(april, '4000', [['02', 'salud', '7'], ['15', 'salud', '3']]), april, 'all', '2045-04-15');
  assert.deepEqual([none.upToToday, none.scheduled, none.actual, none.later], ['10', '0', '10', []]);
  const past = cumulativeVariableSeries(summary, april, 'all', '2045-06-01');
  assert.deepEqual([past.scheduled, past.actual, past.later], ['0', '17.75', []]);
  const future = cumulativeVariableSeries(summary, april, 'all', '2045-03-10');
  assert.deepEqual([future.timing, future.referenceDay, future.actual, future.points.every(point => point.actual === null)], ['future', 0, '0', true]);
  assert.equal(phrase(summary, '2045-03-10'), 'Este mes aún no empieza: tendrás S/ 1,000.00 para 30 días.');
});

test('cumulative series without allocation keeps the actual line and gives no pace', () => {
  const summary = month(april, null, [['05', 'ocio', '12']]);
  const series = cumulativeVariableSeries(summary, april, 'all', '2045-04-15');
  assert.deepEqual([series.allocation, series.actual], [null, '12']);
  assert.deepEqual(variablePace(series), { status: 'no-allocation' });
  assert.equal(phrase(summary, '2045-04-15'), null);
});

test('pace tolerance is max(S/ 5, 5 % of the allocation), strict and exact', () => {
  // Day 15 of 30 with 1,000 assigned: ideal 500, tolerance 50.
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '549.99']]), '2045-04-15'), 'Vas al ritmo.');
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '550']]), '2045-04-15'), 'Vas unos S/ 50 por encima del ritmo ideal.');
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '450.01']]), '2045-04-15'), 'Vas al ritmo.');
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '450']]), '2045-04-15'), 'Vas unos S/ 50 por debajo del ritmo ideal.');
  // 40 assigned (5 % = 2): the S/ 5 floor applies; ideal 20 at day 15.
  assert.equal(phrase(month(april, '1600', [['01', 'ocio', '24.99']]), '2045-04-15'), 'Vas al ritmo.');
  assert.equal(phrase(month(april, '1600', [['01', 'ocio', '25']]), '2045-04-15'), 'Vas unos S/ 5 por encima del ritmo ideal.');
  // The tolerance follows the selection: Salud alone has 500 assigned (tolerance 25, ideal 250).
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '274.99']]), '2045-04-15', 'salud'), 'Vas al ritmo.');
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '275']]), '2045-04-15', 'salud'), 'Vas unos S/ 25 por encima del ritmo ideal.');
});

test('expenses dated after today move the current pace from below to above', () => {
  // Day 15 of 30 with 1,000 assigned: ideal 500, tolerance 50.
  assert.equal(phrase(month(april, '4000', [['10', 'salud', '400']]), '2045-04-15'), 'Vas unos S/ 100 por debajo del ritmo ideal.');
  assert.equal(phrase(month(april, '4000', [['10', 'salud', '400'], ['25', 'ocio', '180']]), '2045-04-15'), 'Vas unos S/ 80 por encima del ritmo ideal.');
  assert.equal(phrase(month(april, '4000', [['10', 'salud', '400'], ['25', 'ocio', '100']]), '2045-04-15'), 'Vas al ritmo.');
});

test('pace amount is rounded half-up to whole soles only for the phrase', () => {
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '600.50']]), '2045-04-15'), 'Vas unos S/ 101 por encima del ritmo ideal.');
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '600.49']]), '2045-04-15'), 'Vas unos S/ 100 por encima del ritmo ideal.');
  // May has 31 days: ideal at day 10 = 322.5806…; gaps 77.419… and 77.519…
  const may = { year: 2045, month: 5 };
  assert.equal(phrase(month(may, '4000', [['01', 'salud', '400']]), '2045-05-10', 'all', may), 'Vas unos S/ 77 por encima del ritmo ideal.');
  assert.equal(phrase(month(may, '4000', [['01', 'salud', '400.1']]), '2045-05-10', 'all', may), 'Vas unos S/ 78 por encima del ritmo ideal.');
  assert.equal(phrase(month(april, '4000', [['01', 'salud', '1000'], ['02', 'ocio', '2345.5']]), '2045-04-15'), 'Vas unos S/ 2,846 por encima del ritmo ideal.');
});

test('a finished month is described in the past', () => {
  assert.equal(phrase(month(april, '4000', [['10', 'ocio', '1100']]), '2045-05-02'), 'Terminaste el mes unos S/ 100 por encima de lo asignado.');
  assert.equal(phrase(month(april, '4000', [['10', 'ocio', '700']]), '2045-05-02'), 'Terminaste el mes unos S/ 300 por debajo de lo asignado.');
  assert.equal(phrase(month(april, '4000', [['10', 'ocio', '980']]), '2045-05-02'), 'Terminaste el mes al ritmo.');
});

test('top subcategories and day groups', () => {
  const summary = month(april, '4000', [['01', 'salud', '5', 'Farmacia'], ['02', 'salud', '7', 'Consulta'], ['03', 'salud', '2.5', 'Farmacia'],
    ['03', 'salud', '1', 'Vitaminas'], ['04', 'salud', '0.5', 'Óptica'], ['04', 'ocio', '50', 'Cine'], ['04', 'salud', '3']]);
  assert.deepEqual(topSubcategories(summary.variable, 'salud'), [{ name: 'Farmacia', amount: '7.5' }, { name: 'Consulta', amount: '7' }, { name: 'Vitaminas', amount: '1' }]);
  assert.deepEqual(topSubcategories(summary.variable, 'ocio', 3), [{ name: 'Cine', amount: '50' }]);
  const days = groupByDay(summary.variable, '2045-04-04');
  assert.deepEqual(days.map(day => [day.label, day.records.length]), [['Hoy', 3], ['Ayer', 2], ['2 abr', 1], ['1 abr', 1]]);
  assert.equal(groupByDay(summary.variable, '2045-05-01')[0].label, '4 abr');
});
