import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticControlXlsx } from './helpers/xlsxBuilder.js';
import { readControlWorkbook } from '../src/application/controlPreimport.js';
import { applyControlDecisions } from '../src/application/historicalLoad.js';
import { inspectLedger, prepareControlEntry, prepareControlEntryReview, prepareControlPlanAssignment, prepareImportedReview } from '../src/domain/controlLedger.js';

// Invented workbook only (Control geometry): dirty month labels, mixed dates,
// dollar amounts written as text, an inexact "$200+" and a zero deposit.
const dirty = () => syntheticControlXlsx({ overrides: { A5: ' 1Enero', A6: '1Febrero', A7: ' 1 Marzo', D7: 0, C14: '$7.5', C15: '$200+' } });
const DECISIONS = { reviewedBy: 'milton', zeroAmounts: 'omit', resolutions: [
  { field: 'contributorId', value: 'milton', match: { kind: 'deposit', purpose: 'expenses' }, reason: 'Columna de gastos', evidenceReference: 'Encabezado' },
  { field: 'contributorId', value: 'fiorella', match: { kind: 'deposit', purpose: 'savings' }, reason: 'Columna de ahorros', evidenceReference: 'Encabezado' },
  { field: 'currency', value: 'PEN', match: { amountInterpreted: true }, reason: 'Montos sin símbolo en soles', evidenceReference: 'Hoja' },
] };

test('month labels with the number stuck to the name are read; dates of both kinds and dollar text stay as they are', async () => {
  const read = await readControlWorkbook(dirty());
  assert.equal(read.ok, true);
  const deposits = read.records.filter(record => record.kind === 'deposit');
  assert.deepEqual([...new Set(deposits.map(record => `${record.period?.year}-${record.period?.month}`))], ['2031-1', '2031-2', '2031-3']);
  const withdrawals = read.records.filter(record => record.kind === 'withdrawal');
  // A serial date and a text date dd/mm/aaaa are both read; dollar text is never turned into an amount.
  assert.ok(withdrawals.find(record => record.provenance.cells.date === 'A13').effectiveDate);
  assert.equal(withdrawals.find(record => record.provenance.cells.date === 'A14').effectiveDate, '2031-02-15');
  assert.deepEqual(withdrawals.filter(record => ['$7.5', '$200+'].includes(record.provenance.original.amount)).map(record => record.amount), [null, null]);
});

test('owner decisions: contributor by column, PEN only for plain numbers, zero deposits omitted, dollar text left for review', async () => {
  const read = await readControlWorkbook(dirty());
  const result = applyControlDecisions(read, DECISIONS, '2031-04-01T12:00:00.000Z');
  assert.equal(result.ok, true);
  assert.equal(result.counts.omittedZero, 1);
  assert.ok(result.records.every(record => record.amount !== '0'), 'a zero deposit is neither loaded nor reviewed');
  const text = result.records.filter(record => record.amount === null);
  assert.deepEqual(text.map(record => [record.currency, record.provenance.original.amount]), [[null, '$7.5'], [null, '$200+']]);
  const entries = inspectLedger(result.records.map(record => ({ ...record, householdId: 'invented' })));
  for (const entry of entries.filter(item => item.record.amount === null)) {
    assert.equal(entry.status, 'pending');
    assert.ok(entry.pendingReasons.includes('UNRESOLVED_MONEY'), JSON.stringify(entry.pendingReasons));
  }
  assert.ok(entries.filter(entry => entry.record.kind === 'deposit').every(entry => entry.status === 'imported'));
  // Without "omit" a zero deposit keeps its explicit policy reason.
  const plain = applyControlDecisions(read, { ...DECISIONS, zeroAmounts: undefined }, '2031-04-01T12:00:00.000Z');
  assert.ok(plain.records.some(record => record.amount === '0'));
  assert.equal(applyControlDecisions(read, { ...DECISIONS, zeroAmounts: 'keep' }, '2031-04-01T12:00:00.000Z').errors[0], 'INVALID_DECISIONS_FILE');
});

test('"imported" only counts with no review reason left on the row', async () => {
  const read = await readControlWorkbook(dirty());
  const result = applyControlDecisions(read, DECISIONS, '2031-04-01T12:00:00.000Z');
  const deposit = result.records.find(record => record.kind === 'deposit' && record.purpose === 'savings');
  const ledger = record => inspectLedger([{ ...record, householdId: 'invented' }])[0];
  assert.equal(ledger(deposit).status, 'imported');
  // The same prepared decision with an unresolved field is not counted.
  assert.deepEqual([ledger({ ...deposit, currency: null }).status, ledger({ ...deposit, currency: null }).pendingReasons], ['pending', ['UNRESOLVED_MONEY']]);
});

test('imported rows are corrected and accepted (or rejected) in the app; the original stays in provenance', async () => {
  const read = await readControlWorkbook(dirty());
  const records = applyControlDecisions(read, DECISIONS, '2031-04-01T12:00:00.000Z').records.map((record, index) => ({ ...record, householdId: 'invented', revision: index + 1 }));
  const dollar = records.find(record => record.provenance.original.amount === '$7.5');
  const review = fields => prepareImportedReview({ id: dollar.id, expectedRevision: dollar.revision, reviewedBy: 'milton', reason: 'Comprobado en el extracto',
    evidenceReference: 'Extracto inventado', ...fields }, records);
  assert.deepEqual(review({ decision: 'accepted' }).errors.sort(), ['MISSING_CONFIRMED_PERIOD', 'UNRESOLVED_MONEY']);
  const accepted = review({ decision: 'accepted', corrections: { amount: '7.50', currency: 'USD', period: { year: 2031, month: 2 } } });
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors));
  assert.deepEqual([accepted.record.amount, accepted.record.currency, accepted.record.provenance.original.amount], ['7.5', 'USD', '$7.5']);
  const after = inspectLedger(records.map(record => record.id === dollar.id ? { ...accepted.record, manualReviews: [{ ...accepted.review, id: 'r1' }] } : record))
    .find(entry => entry.record.id === dollar.id);
  assert.equal(after.status, 'reviewed');
  const rejected = review({ decision: 'rejected' });
  assert.equal(rejected.ok, true);
  const gone = inspectLedger([{ ...dollar, manualReviews: [{ ...rejected.review, id: 'r2' }] }])[0];
  assert.equal(gone.status, 'rejected');
  assert.deepEqual(review({ decision: 'accepted', corrections: { amount: 'x' } }).errors, ['INVALID_AMOUNT']);
  assert.deepEqual(review({ decision: 'accepted', corrections: { origin: 'simulated' } }).errors, ['INVALID_CORRECTION']);
});

const manual = (input, records = []) => prepareControlEntry({ id: input.id ?? crypto.randomUUID(), householdId: 'invented', expectedRevision: 0, operationId: crypto.randomUUID(),
  kind: 'deposit', effectiveDate: '2031-03-02', period: { year: 2031, month: 3 }, currency: 'PEN', amount: '120', contributorId: 'fiorella',
  purpose: 'savings', description: '', provenanceNote: 'Registrado en MilFi', actorId: 'milton', ...input }, records);

test('a new savings deposit may leave its plan unassigned (never inferred); others carry none', () => {
  assert.equal(manual({}).value.planPeriod, null);
  assert.deepEqual(manual({ planPeriod: { year: 2031, month: 2 } }).value.planPeriod, { year: 2031, month: 2 });
  assert.equal(manual({ purpose: 'expenses', contributorId: 'milton', planPeriod: { year: 2031, month: 2 } }).value.planPeriod, null);
  assert.deepEqual(manual({ planPeriod: { year: 2031, month: 13 } }).errors, ['INVALID_PLAN_PERIOD']);
});

test('the plan month is an allocation: assigning it never makes a review stale', async () => {
  const saved = { ...manual({ planPeriod: { year: 2031, month: 2 } }).value, revision: 1 };
  const review = prepareControlEntryReview({ id: saved.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton', reason: 'Visto', evidenceReference: 'Voucher' }, [saved]);
  const reviewed = { ...review.record, manualReviews: [{ ...review.review, id: 'r', reviewedBy: 'milton', reviewedAt: '2031-03-03T00:00:00.000Z', evidenceReference: 'Voucher' }] };
  assert.equal(inspectLedger([reviewed])[0].status, 'reviewed');
  const moved = prepareControlPlanAssignment({ id: saved.id, expectedRevision: 1, planPeriod: { year: 2031, month: 3 } }, [reviewed]);
  assert.equal(moved.ok, true);
  assert.deepEqual([inspectLedger([moved.value])[0].status, moved.value.planPeriod], ['reviewed', { year: 2031, month: 3 }]);
  // Imported savings deposits get their plan month the same way; other movements cannot.
  const read = await readControlWorkbook(dirty());
  const imported = applyControlDecisions(read, DECISIONS, '2031-04-01T12:00:00.000Z').records.map(record => ({ ...record, householdId: 'invented', revision: 1 }));
  const savings = imported.find(record => record.kind === 'deposit' && record.purpose === 'savings');
  assert.equal(prepareControlPlanAssignment({ id: savings.id, expectedRevision: 1, planPeriod: { year: 2031, month: 1 } }, imported).ok, true);
  const withdrawal = imported.find(record => record.kind === 'withdrawal');
  assert.deepEqual(prepareControlPlanAssignment({ id: withdrawal.id, expectedRevision: 1, planPeriod: { year: 2031, month: 1 } }, imported).errors, ['SAVINGS_DEPOSIT_REQUIRED']);
  assert.equal(prepareControlPlanAssignment({ id: savings.id, expectedRevision: 1, planPeriod: null }, imported).value.planPeriod, null);
});

test('month prefixes are accepted exactly as requested; empty future rows never become movements', async () => {
  for (const label of [' 1Enero', '1Enero', ' 1 Marzo']) {
    const read = await readControlWorkbook(syntheticControlXlsx({ overrides: { A5: label, A7: 'Diciembre', B7: 2099,
      D7: { f: '', v: undefined } } }));
    assert.equal(read.ok, true);
    assert.equal(read.records.find(record => record.provenance.operation.amountRef === 'C5').period.month, label.includes('Marzo') ? 3 : 1);
    assert.ok(read.records.every(record => record.period?.year !== 2099), 'future month with no deposit is absent, including empty formula cells');
  }
});
