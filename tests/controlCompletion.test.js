import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceSeries, contributionHistory, monthlyRows, savingsBalance } from '../src/presentation/controlLedgerView.js';
import { controlWorkbookContrast } from '../src/presentation/controlWorkbookContrast.js';
import { prepareControlEntry, prepareControlEntryReview, inspectLedger } from '../src/domain/controlLedger.js';
import { syntheticControlXlsx } from './helpers/xlsxBuilder.js';
import { readControlWorkbook } from '../src/application/controlPreimport.js';
import { readXlsxCapture } from '../src/infrastructure/xlsx/workbook.js';
import { applyControlDecisions } from '../src/application/historicalLoad.js';
import { createMemoryControlPersistence } from '../src/application/memoryControlPersistence.js';

let sequence = 0;
const jan = { year: 2031, month: 1 };
const feb = { year: 2031, month: 2 };
const entry = (fields, status = 'reviewed', reasons = []) => ({ status, pendingReasons: reasons, errors: [], record: {
  id: `completion-${++sequence}`, kind: 'deposit', purpose: 'savings', currency: 'PEN', contributorId: 'fiorella', amount: '10',
  period: jan, planPeriod: null, effectiveDate: '2031-01-10', ...fields,
} });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('Control completion: separate PEN/USD balances, negative dollar balance and no conversion', () => {
  const entries = freeze([entry({ amount: '100.25' }), entry({ amount: '30.4', currency: 'USD' }),
    entry({ amount: '10.1', kind: 'withdrawal' }), entry({ amount: '40.5', kind: 'withdrawal', currency: 'USD' }),
    entry({ amount: '500', currency: 'USD' }, 'pending', ['IMPORT_REVIEW_REQUIRED']), entry({ amount: '999', purpose: 'expenses' })]);
  assert.deepEqual([savingsBalance(entries).amount, savingsBalance(entries).negative], ['90.15', false]);
  assert.deepEqual([savingsBalance(entries, 'USD').amount, savingsBalance(entries, 'USD').negative], ['10.1', true]);
  assert.equal(savingsBalance(entries, 'USD').deposits, '30.4');
  assert.equal(savingsBalance(entries, 'USD').withdrawals, '40.5');
});

test('Control completion: independent chart series and withdrawal markers, USD-only history is not a PEN series', () => {
  const entries = freeze([entry({ amount: '100' }), entry({ amount: '30.4', currency: 'USD', period: feb, effectiveDate: '2031-02-10' }),
    entry({ amount: '4.5', kind: 'withdrawal', currency: 'USD', period: feb, effectiveDate: '2031-02-12' })]);
  const pen = balanceSeries(entries, feb);
  const usd = balanceSeries(entries, feb, 'USD');
  assert.deepEqual(pen.steps.map(step => step.balance.amount), ['100', '100']);
  assert.deepEqual(usd.steps.map(step => step.balance.amount), ['25.9']);
  assert.equal(pen.withdrawals.length, 0);
  assert.equal(usd.withdrawals.length, 1);
  assert.equal(usd.withdrawals[0].currency, 'USD');
  assert.deepEqual(balanceSeries([entries[1]], feb).steps, []);
  assert.equal(balanceSeries([entries[1]], feb, 'USD').steps[0].balance.amount, '30.4');
});

test('Control completion: monthly summary already separates currencies and never lets USD cover a PEN plan', () => {
  const entries = freeze([entry({ amount: '100', period: feb, planPeriod: jan }),
    entry({ amount: '500', currency: 'USD', period: feb, planPeriod: jan }), entry({ amount: '7.5', kind: 'withdrawal', currency: 'USD', period: feb })]);
  const row = monthlyRows(entries, new Map([['2031-01', { amount: '500' }]])).find(row => row.key === '2031-02');
  assert.deepEqual(row.savings, [{ currency: 'PEN', amount: '100' }, { currency: 'USD', amount: '500' }]);
  assert.deepEqual(row.withdrawals, [{ currency: 'USD', amount: '7.5' }]);
  assert.deepEqual([row.referencePeriod, row.covered, row.light.word], [jan, '100', 'Parcial']);
});

test('Control completion: contributions accumulate by actual month, person, currency and destination without subtracting withdrawals', () => {
  const entries = freeze([entry({ amount: '20', period: feb, planPeriod: jan }), entry({ amount: '10.25' }),
    entry({ amount: '7', currency: 'USD' }), entry({ amount: '4', contributorId: 'milton', purpose: 'expenses' }),
    entry({ amount: '3', contributorId: 'milton', purpose: 'savings' }), entry({ amount: '9', contributorId: 'fiorella', purpose: 'expenses' }),
    entry({ amount: '1000', kind: 'withdrawal' }), entry({ amount: '999' }, 'pending', ['UNRESOLVED_MONEY']), entry({ amount: '888' }, 'rejected')]);
  const original = structuredClone(entries);
  const groups = contributionHistory(entries);
  assert.equal(groups.length, 5);
  const group = groups.find(item => item.key === 'fiorella:PEN:savings');
  assert.deepEqual([group.total, group.count], ['30.25', 2]);
  assert.deepEqual(group.months.map(month => [month.key, month.amount, month.cumulative]), [['2031-02', '20', '30.25'], ['2031-01', '10.25', '10.25']]);
  assert.equal(groups.find(item => item.key === 'fiorella:USD:savings').total, '7');
  assert.equal(groups.find(item => item.key === 'milton:PEN:expenses').total, '4');
  assert.deepEqual(entries, original);
});

const summaryCapture = values => ({ sheets: [{ name: 'Resumen inventado', cells: Object.fromEntries([
  'Total Depositado para Gastos (Milton)', 'Total Depositado para Ahorros (Fiorella)', 'Total Acumulado en Ahorros',
  'Total Retirado de Ahorros', 'Saldo Disponible en Ahorros',
].flatMap((label, index) => [[`A${index + 1}`, { type: 'text', value: label }], [`B${index + 1}`, { type: 'number', value: values[index], formula: '[fórmula]' }]])) }] });
function imported(fields, decision = true) {
  return { schemaVersion: 1, moduleId: 'control-mf', householdId: null, revision: 0, origin: 'real', validationStatus: 'pending', actorId: null,
    ...entry(fields).record, provenance: { type: 'control-excel', sourceId: 'synthetic', sourceFingerprint: 'a'.repeat(64),
      sheet: 'Resumen inventado', row: 10, cells: { amount: 'C10' }, original: { amount: '10' }, operation: { amountRef: 'C10' } },
    preimportDecisions: decision ? [{ decision: 'prepared' }] : [] };
}

test('Control completion: cached lower summaries are contrasted without becoming duplicated movements or applying rounding', () => {
  const records = [imported({ amount: '5', purpose: 'expenses', contributorId: 'milton' }),
    imported({ amount: '10' }), imported({ kind: 'withdrawal', amount: '3', contributorId: null }, false)];
  const capture = summaryCapture(['5', '10.0000000000001', '10', '3', '7']);
  const before = structuredClone({ records, capture });
  const result = controlWorkbookContrast(capture, records);
  assert.equal(result.recognized, 5);
  assert.equal(result.checks[1].comparison, 'SUBCENT_CACHE_DIFFERENCE');
  assert.equal(result.checks[1].sourceMatches, false, 'a cache precision difference is reported, never silently rounded');
  assert.equal(result.checks.find(check => check.code === 'SAVINGS_WITHDRAWALS').sourceMatches, true);
  assert.equal(result.checks.find(check => check.code === 'SAVINGS_WITHDRAWALS').ledgerMatches, null, 'source arithmetic is not a reviewed ledger balance');
  assert.deepEqual({ records, capture }, before);
});

test('Control completion: persisted demo records keep reviews, dates, assignments and audit history after generating both views', async () => {
  const persistence = createMemoryControlPersistence();
  const prepared = prepareControlEntry({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), householdId: persistence.householdId,
    expectedRevision: 0, actorId: 'milton', kind: 'deposit', purpose: 'savings', amount: '30.4', currency: 'USD',
    period: feb, planPeriod: jan, effectiveDate: '2031-02-10', contributorId: 'fiorella', description: '', provenanceNote: 'Inventado' });
  const saved = await persistence.saveControlEntry(prepared.value, null);
  const review = prepareControlEntryReview({ id: saved.value.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton', reason: 'Inventado', evidenceReference: 'Prueba' }, [saved.value]);
  await persistence.addControlReview(review.record, saved.value, review.review, review.changed);
  const before = await persistence.loadControl(); const history = await persistence.loadControlHistory();
  const entries = freeze(inspectLedger(before.records));
  contributionHistory(entries); balanceSeries(entries, feb, 'USD'); savingsBalance(entries, 'USD'); monthlyRows(entries);
  assert.deepEqual(await persistence.loadControl(), before);
  assert.deepEqual(await persistence.loadControlHistory(), history);
});

test('Control completion: exact synthetic Excel lower totals agree with derived contributions, with text amounts left unresolved', async () => {
  const bytes = syntheticControlXlsx({ overrides: {
    A25: 'Total Depositado para Gastos (Milton)', B25: { f: 'C8', v: '24' },
    A26: 'Total Depositado para Ahorros (Fiorella)', B26: { f: 'D8', v: '22.5' },
    A27: 'Total Acumulado en Ahorros', B27: { f: 'D8', v: '22.5' },
    A28: 'Total Retirado de Ahorros', B28: { f: 'SUM(C13:C16)', v: '13' },
    A29: 'Saldo Disponible en Ahorros', B29: { f: 'B27-B28', v: '9.5' },
  } });
  const read = await readControlWorkbook(bytes);
  const prepared = applyControlDecisions(read, { reviewedBy: 'milton', zeroAmounts: 'omit', resolutions: [
    { field: 'currency', value: 'PEN', match: { amountInterpreted: true }, reason: 'Inventado', evidenceReference: 'Prueba' },
    { field: 'contributorId', value: 'milton', match: { kind: 'deposit', purpose: 'expenses' }, reason: 'Inventado', evidenceReference: 'Prueba' },
    { field: 'contributorId', value: 'fiorella', match: { kind: 'deposit', purpose: 'savings' }, reason: 'Inventado', evidenceReference: 'Prueba' },
  ] }, '2031-03-01T12:00:00.000Z');
  assert.equal(prepared.ok, true);
  const count = prepared.records.length;
  const result = controlWorkbookContrast((await readXlsxCapture(bytes)).capture, prepared.records);
  assert.equal(result.complete, true);
  assert.ok(result.checks.every(check => check.comparison === 'EXACT_MATCH'));
  assert.ok(result.checks.filter(check => check.ledgerMatches !== null).every(check => check.ledgerMatches));
  assert.equal(result.unresolvedAmounts, 1);
  assert.equal(prepared.records.length, count, 'summary rows never create additional movements');
});
