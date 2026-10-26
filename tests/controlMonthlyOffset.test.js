import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceSeries, coveredSavings, monthlyRows, planLight, previousPlanPeriod, reviewTasks, savingsBalance } from '../src/presentation/controlLedgerView.js';
import { inspectLedger, prepareControlEntry, summarizeLedger } from '../src/domain/controlLedger.js';
import { fiorellaEvolution } from '../src/domain/fiorellaDashboard.js';
import { fiorellaHistory, prepareFiorellaDemo, summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { goalPlan } from '../src/presentation/goalPlan.js';
import { withFixedCap } from '../src/presentation/fixedCap.js';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { createDatabase, seedSynthetic } from './helpers/pgHarness.js';
import { createPgRestClient } from './helpers/pgRestClient.js';

// Every amount, period and movement in this file is invented.
const sep = { year: 2031, month: 9 };
const oct = { year: 2031, month: 10 };
const nov = { year: 2031, month: 11 };
const key = p => `${p.year}-${String(p.month).padStart(2, '0')}`;
let sequence = 0;
const entry = (fields = {}, status = 'imported', pendingReasons = []) => ({ status, pendingReasons, errors: [], record: {
  id: `offset-${++sequence}`, kind: 'deposit', purpose: 'savings', amount: '500', currency: 'PEN', contributorId: 'fiorella',
  effectiveDate: '2031-10-12', period: oct, planPeriod: null, provenance: { type: 'control-excel' }, ...fields,
} });
const rowFor = (entries, plans, period = oct) => monthlyRows(entries, plans).find(row => row.key === key(period));
const plans = () => new Map([['2031-09', { amount: '500', projected: false }]]);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const planMap = records => new Map(fiorellaEvolution(withFixedCap(records), 'real')
  .filter(row => row.couplePlanned != null).map(row => [row.key, { amount: row.couplePlanned, projected: row.projected }]));

function fiorellaRecords() {
  const records = [];
  for (const fields of [
    { kind: 'monthly-plan', period: sep, income: '4000', appliedFixedExpense: '1500' },
    { kind: 'monthly-plan', period: oct, income: '5000', appliedFixedExpense: '1500', planStatus: 'projected' },
    { kind: 'fixed-budget', period: sep, categoryId: 'servicios-luz', budgetAmount: '80', actualAmount: '35' },
    { kind: 'variable-expense', period: sep, categoryId: 'ocio', amount: '12.25', effectiveDate: '2031-09-15', description: 'Gasto inventado' },
  ]) {
    const result = prepareFiorellaDemo({ id: `fiorella-${records.length}`, eventId: `event-${records.length}`, expectedRevision: 0,
      occurredAt: '2031-09-01T00:00:00.000Z', ...fields }, records, [], { origin: 'real' });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    records.push(result.value);
  }
  return records;
}

test('1. Control shows the original September plan in October and validates period boundaries', () => {
  const receipt = freeze({ ...oct });
  assert.deepEqual(previousPlanPeriod(receipt), sep);
  assert.equal(previousPlanPeriod(null), null);
  assert.equal(previousPlanPeriod({ year: 2031, month: 13 }), null);
  assert.equal(previousPlanPeriod({ year: 1, month: 1 }), null);
  const row = rowFor([], plans());
  assert.deepEqual([row.period, row.referencePeriod, row.plan], [oct, sep, '500']);
  assert.equal(row.light.word, 'Pendiente');
  assert.deepEqual(row.savings, []);
});

test('2. December plan appears in January of the following year', () => {
  const december = { year: 2031, month: 12 };
  const january = { year: 2032, month: 1 };
  assert.deepEqual(previousPlanPeriod(january), december);
  const rows = monthlyRows([], new Map([['2031-12', { amount: '600', projected: false }]]));
  assert.deepEqual(rows.map(row => [row.period, row.referencePeriod, row.plan]), [[january, december, '600']]);
});

test('3. October deposits keep their original date, receipt period and explicit plan period', () => {
  const entries = freeze([entry({ planPeriod: sep })]);
  const original = structuredClone(entries);
  const row = rowFor(entries, plans());
  assert.deepEqual([row.savings, row.covered, row.light.word], [[{ currency: 'PEN', amount: '500' }], '500', 'Completo']);
  assert.deepEqual(entries, original);
  assert.deepEqual([entries[0].record.effectiveDate, entries[0].record.period, entries[0].record.planPeriod], ['2031-10-12', oct, sep]);
});

test('4. Matching unassigned deposits remain unassigned and pending even when the amount equals the plan', () => {
  const entries = freeze([entry()]);
  const row = rowFor(entries, plans());
  assert.deepEqual([row.plan, row.covered, row.light.word], ['500', null, 'Pendiente']);
  const tasks = reviewTasks(entries, plans());
  assert.deepEqual([tasks.total, tasks.withoutPlan[0].plan.exact], [1, true], 'suggested, never assigned by itself');
  assert.equal(entries[0].record.planPeriod, null);
});

test('5. A deposit received two months later covers its explicitly assigned original plan', () => {
  const entries = freeze([entry({ period: nov, effectiveDate: '2031-11-02', planPeriod: sep })]);
  const october = rowFor(entries, plans());
  const november = rowFor(entries, plans(), nov);
  assert.deepEqual([october.savings, october.covered, october.light.word], [[], '500', 'Completo']);
  assert.deepEqual(november.savings, [{ currency: 'PEN', amount: '500' }]);
  assert.equal(november.covered, null);
  assert.deepEqual(entries[0].record.period, nov);
});

test('6. Partial assignments across receipt months use exact monetary comparisons without changing plan status', () => {
  const entries = freeze([entry({ amount: '100.1', planPeriod: sep }),
    entry({ amount: '49.9', planPeriod: sep, period: nov, effectiveDate: '2031-11-01' })]);
  const row = rowFor(entries, plans());
  assert.equal(row.covered, '150');
  assert.deepEqual(row.light, planLight(coveredSavings(entries, sep), '500'));
  assert.equal(row.light.word, 'Parcial');
  assert.equal(row.savings[0].amount, '100.1');
});

test('7. PEN and USD stay separate; USD and pending review movements never cover PEN plans', () => {
  const usd = entry({ currency: 'USD', amount: '500', planPeriod: sep });
  const pending = entry({ amount: '999', planPeriod: sep }, 'pending', ['UNRESOLVED_MONEY']);
  const entries = freeze([entry({ amount: '100', planPeriod: sep }), usd, pending,
    entry({ kind: 'withdrawal', currency: 'USD', amount: '5' }), entry({ kind: 'withdrawal', amount: '10' })]);
  const row = rowFor(entries, plans());
  assert.deepEqual(row.savings, [{ currency: 'PEN', amount: '100' }, { currency: 'USD', amount: '500' }]);
  assert.deepEqual([row.covered, row.light.word], ['100', 'Parcial']);
  assert.deepEqual(row.withdrawals, [{ currency: 'USD', amount: '5' }, { currency: 'PEN', amount: '10' }]);
  assert.equal(rowFor([usd], plans()).covered, null);
  assert.equal(rowFor([usd], plans()).light.word, 'Pendiente');
  assert.deepEqual([savingsBalance(entries).amount, savingsBalance(entries).usdWithdrawn], ['90', '5']);
});

test('8. A future projected plan remains projected and never becomes received money', () => {
  const future = new Map([['2099-12', { amount: '750', projected: true }]]);
  const row = rowFor([], future, { year: 2100, month: 1 });
  assert.deepEqual([row.referencePeriod, row.plan, row.projected, row.covered, row.savings, row.light.word],
    [{ year: 2099, month: 12 }, '750', true, null, [], 'Pendiente']);
  assert.equal(savingsBalance([]).deposits, '0');
});

test('9. Receipt comparison shifts once; original plans and assignments are never shifted twice', () => {
  const references = new Map([['2031-08', { amount: '999' }], ['2031-09', { amount: '500' }], ['2031-10', { amount: '700' }]]);
  const entries = freeze([entry({ amount: '50', planPeriod: sep }), entry({ amount: '70', planPeriod: oct })]);
  const row = rowFor(entries, references);
  assert.deepEqual([row.referencePeriod, row.plan, row.covered], [sep, '500', '50']);
  assert.deepEqual(references.get('2031-09'), { amount: '500' });
  assert.equal(rowFor(entries, references, nov).covered, '70');
  assert.deepEqual(monthlyRows([], plans()).map(row => row.key), ['2031-10']);
});

test('10. Global deposits, withdrawals, balance and actual monthly totals are invariant', () => {
  const entries = freeze([entry({ amount: '500', planPeriod: sep }), entry({ amount: '30', kind: 'withdrawal' }),
    entry({ amount: '40', purpose: 'expenses', contributorId: 'milton' }), entry({ amount: '20', currency: 'USD' }),
    entry({ amount: '999' }, 'pending', ['IMPORT_REVIEW_REQUIRED'])]);
  const snapshot = () => ({ balance: savingsBalance(entries), series: balanceSeries(entries), totals: summarizeLedger(entries, oct) });
  const before = structuredClone(snapshot());
  const original = structuredClone(entries);
  monthlyRows(entries, plans());
  monthlyRows(entries, new Map([['2031-09', { amount: '600', projected: true }]]));
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(entries, original);
});

test('11. Fiorella income periods, GF/GV, distribution, savings, projection, goals and history are identical', () => {
  const records = freeze(fiorellaRecords());
  const original = structuredClone(records);
  const goal = freeze({ title: 'Meta inventada', target: '1200', months: '3' });
  const snapshot = () => ({ september: summarizeFiorella(records, sep, 'real'), october: summarizeFiorella(records, oct, 'real'),
    evolution: fiorellaEvolution(records, 'real'), history: fiorellaHistory(records, [], [], 'real'), goal: goalPlan(goal, '600', sep) });
  const before = structuredClone(snapshot());
  const rows = monthlyRows(freeze([entry({ planPeriod: sep })]), planMap(records));
  assert.equal(rows.find(row => row.key === '2031-10').plan, before.evolution.find(row => row.key === '2031-09').couplePlanned);
  assert.equal(rows.find(row => row.key === '2031-11').projected, true);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(records, original);
});

test('12. Reloading persisted synthetic data after Control comparison leaves both modules and their history unchanged', async () => {
  const db = await createDatabase();
  try {
    const users = await seedSynthetic(db);
    const persistence = identity => createMilfiPersistence(createPgRestClient(db, users[identity]), { householdId: users.household });
    const fiorella = persistence('fiorella');
    const milton = persistence('milton');
    for (const record of fiorellaRecords()) assert.equal((await fiorella.saveFiorellaRecord({ ...record, id: crypto.randomUUID() }, null)).ok, true);
    const prepared = prepareControlEntry({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), householdId: users.household,
      expectedRevision: 0, actorId: 'milton', kind: 'deposit', purpose: 'savings', contributorId: 'fiorella', currency: 'PEN', amount: '500',
      effectiveDate: '2031-10-12', period: oct, planPeriod: sep, description: 'Depósito inventado', provenanceNote: 'Prueba sintética' }, []);
    assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
    assert.equal((await milton.saveControlEntry(prepared.value, null)).ok, true);
    const before = { fiorella: await milton.loadFiorella(), control: await milton.loadControl(),
      fiorellaHistory: await milton.loadFiorellaHistory(), controlHistory: await milton.loadControlHistory() };
    assert.equal(before.fiorella.ok && before.control.ok, true);
    const entries = freeze(inspectLedger(before.control.records));
    const comparison = monthlyRows(entries, planMap(freeze(before.fiorella.records)));
    assert.equal(comparison.find(row => row.key === '2031-10').plan, '600');
    const reader = persistence('milton');
    assert.deepEqual({ fiorella: await reader.loadFiorella(), control: await reader.loadControl(),
      fiorellaHistory: await reader.loadFiorellaHistory(), controlHistory: await reader.loadControlHistory() }, before);
    const saved = before.control.records[0];
    assert.deepEqual([saved.period, saved.effectiveDate, saved.planPeriod, saved.amount], [oct, '2031-10-12', sep, '500']);
  } finally { await db.close(); }
});
