import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectMovement, inspectMovementBatch, partitionMovements, validateMovement } from '../src/domain/models.js';
import { sumConfirmedMovements } from '../src/domain/movementTotals.js';
import { evidenceBinding, excelRange, sourceOperationKey } from '../src/domain/excelEvidence.js';
import { prepareEvidenceReview } from '../src/application/evidenceReview.js';
import { bindOperation, context, review, syntheticMovement } from './helpers/excelFixture.js';

// All records, captures and review references here are invented. Geometry-only
// regression below reproduces the layout inspected privately, never its records.
const scope = { currency: 'PEN', householdId: 'imaginary-household', purpose: 'savings', kind: 'deposit' };
const workbook = record => context.workbooks.get(record.provenance.sourceFingerprint.toLowerCase());
const sheet = record => workbook(record).sheets[record.provenance.sheet];
const inspected = record => inspectMovement(record, context);
const confirmed = records => partitionMovements(records, context).confirmed;
const total = records => sumConfirmedMovements(records, scope, context).total;
const reference = (record, ref, role) => ({ sheet: record.provenance.sheet, ref, ...(role ? { role } : {}) });
const cell = (value, type = 'text') => ({ type: value === null ? 'blank' : type, value });

for (const [field, changed, code] of [
  ['effectiveDate', '2035-09-22', 'SOURCE_EFFECTIVE_DATE_MISMATCH'],
  ['currency', 'USD', 'SOURCE_CURRENCY_MISMATCH'],
  ['contributorId', 'milton', 'SOURCE_CONTRIBUTOR_ID_MISMATCH'],
  ['period', { year: 2035, month: 10 }, 'SOURCE_PERIOD_MISMATCH'],
  ['amount', '90', 'SOURCE_AMOUNT_MISMATCH'],
]) test(`A1: independently captured ${field} detects normalized tampering`, () => {
  const record = syntheticMovement();
  const before = structuredClone(workbook(record));
  record[field] = changed;
  assert.ok(inspected(record).pendingReasons.includes(code));
  assert.equal(inspected(record).eligibleForConfirmed, false);
  assert.equal(total([record]), null);
  assert.deepEqual(workbook(record), before);
});

test('A1: even a complete self-declared source cannot confirm without independent capture', () => {
  const record = syntheticMovement();
  for (const missing of [undefined, {}, { workbooks: new Map() }]) {
    const result = inspectMovement(record, missing);
    assert.ok(result.pendingReasons.includes('SOURCE_NOT_VERIFIED'));
    assert.equal(result.eligibleForConfirmed, false);
    assert.equal(sumConfirmedMovements([record], scope, missing).total, null);
  }
  assert.equal(inspected(record).eligibleForConfirmed, true);
});

test('A1: changing both normalized and claimed original values cannot forge the capture', () => {
  for (const field of ['amount', 'date', 'currency', 'contributorId', 'period']) {
    const record = syntheticMovement();
    record.provenance.original[field] = 'forged';
    assert.ok(inspected(record).errors.includes('ORIGINAL_VALUE_MISMATCH'));
    assert.equal(confirmed([record]).length, 0);
  }
});

test('A1: numeric XML is normalized exactly without floating point or rounding', () => {
  const record = syntheticMovement();
  sheet(record).cells.C5.value = '7.250000000000000000e0';
  record.provenance.original.amount = '7.250000000000000000e0';
  assert.equal(inspected(record).eligibleForConfirmed, true);
  sheet(record).cells.C5.value = '7.250000000000000001e0';
  record.provenance.original.amount = '7.250000000000000001e0';
  assert.ok(inspected(record).pendingReasons.includes('SOURCE_AMOUNT_MISMATCH'));
});

test('A1: ambiguous date, symbol, contributor and period never inherit normalized guesses', () => {
  const record = syntheticMovement();
  const captured = sheet(record).cells;
  for (const [field, ref, raw] of [
    ['effectiveDate', 'A5', '09/10/2035'], ['currency', 'F5', '$'],
    ['contributorId', 'G5', 'Ella / Tú'], ['period', 'H5', 'Septiembre u octubre'],
  ]) {
    captured[ref] = cell(raw);
    record.provenance.original[field === 'effectiveDate' ? 'date' : field] = raw;
  }
  const reasons = inspected(record).pendingReasons;
  for (const field of ['EFFECTIVE_DATE', 'CURRENCY', 'CONTRIBUTOR_ID', 'PERIOD']) assert.ok(reasons.includes(`SOURCE_${field}_AMBIGUOUS`));
  assert.equal(total([record]), null);
});

test('A1: mentioning a known currency, person or month in uncertain text is not sufficient evidence', () => {
  for (const [field, ref, raw] of [
    ['currency', 'F5', 'PEN por confirmar'], ['contributorId', 'G5', 'Fiorella (pendiente)'],
    ['contributorId', 'G5', 'No aporta Milton'], ['period', 'H5', 'Septiembre o mes pendiente'],
  ]) {
    const record = syntheticMovement();
    sheet(record).cells[ref] = cell(raw); record.provenance.original[field] = raw;
    if (raw === 'No aporta Milton') record.contributorId = 'milton';
    if (field === 'period') {
      sheet(record).cells.I5 = cell('2035', 'number');
      record.provenance.evidence.period = [reference(record, 'H5', 'month'), reference(record, 'I5', 'year')];
      bindOperation(record);
    }
    assert.equal(inspected(record).eligibleForConfirmed, false);
    assert.equal(total([record]), null);
  }
});

test('A1: explicit reviews resolve contradictions while retaining original evidence and history', () => {
  const record = syntheticMovement();
  record.amount = '8';
  const before = structuredClone(record);
  const result = prepareEvidenceReview({ record, ...review(record, 'amount') }, context);
  assert.equal(result.ok, true);
  assert.equal(result.value.validationStatus, 'pending');
  assert.equal(result.value.revision, record.revision + 1);
  assert.deepEqual(record, before);
  assert.deepEqual(result.value.provenance, before.provenance);
  assert.equal(total([result.value]), null);
  assert.deepEqual(validateMovement(result.value, context), []);
  // Confirmation is merely tested as a declaration, never performed by the review.
  assert.equal(inspected({ ...result.value, validationStatus: 'confirmed' }).eligibleForConfirmed, true);
  const again = prepareEvidenceReview({ record: result.value, ...review(result.value, 'currency') }, context);
  assert.equal(again.ok, true);
  assert.equal(again.value.evidenceReviews.length, 2);
  assert.equal(result.value.evidenceReviews.length, 1);
});

test('A1: ambiguous evidence can be resolved only with complete field-specific traceability', () => {
  const record = syntheticMovement();
  sheet(record).cells.A5 = cell('09/10/2035');
  record.provenance.original.date = '09/10/2035';
  record.evidenceReviews = [review(record, 'effectiveDate')];
  assert.equal(inspected(record).eligibleForConfirmed, true);
  for (const changes of [{ reason: '' }, { reviewedAt: '2035-02-30T00:00:00.000Z' },
    { evidenceReference: '' }, { reviewedBy: 'unknown' }, { binding: '' }, { id: '' }, { field: 'currency' }]) {
    assert.equal(inspected({ ...record, evidenceReviews: [{ ...record.evidenceReviews[0], ...changes }] }).eligibleForConfirmed, false);
  }
});

test('A1: review binding expires on changes in value, currency, operation, evidence or date system', () => {
  for (const change of [
    record => { record.amount = '8'; },
    record => { record.currency = 'USD'; },
    record => { record.provenance.operation.amountRef = 'D5'; },
    record => { sheet(record).cells.C5.value = 'ambiguous-v2'; record.provenance.original.amount = 'ambiguous-v2'; },
    record => { workbook(record).dateSystem = '1904'; },
    record => { record.provenance.evidence.amount = [reference(record, 'D5')]; },
  ]) {
    const record = syntheticMovement();
    sheet(record).cells.C5 = cell('ambiguous');
    record.provenance.original.amount = 'ambiguous';
    record.evidenceReviews = [review(record, 'amount')];
    assert.equal(inspected(record).eligibleForConfirmed, true);
    const previous = record.evidenceReviews[0].binding;
    change(record);
    assert.notEqual(evidenceBinding(record, 'amount', context), previous);
    assert.equal(inspected(record).eligibleForConfirmed, false);
  }
});

test('A1: review preparation rejects missing evidence, forged originals and duplicate review IDs', () => {
  const record = syntheticMovement();
  const input = { record, ...review(record, 'amount') };
  assert.equal(prepareEvidenceReview(input).ok, false);
  for (const changes of [{ reason: '' }, { field: 'description' }, { reviewedBy: null }, { reviewedAt: '' }]) {
    assert.equal(prepareEvidenceReview({ ...input, ...changes }, context).ok, false);
  }
  const result = prepareEvidenceReview(input, context);
  assert.equal(prepareEvidenceReview({ ...input, record: result.value }, context).reason, 'DUPLICATE_REVIEW_ID');
  record.provenance.original.amount = 'forged';
  assert.equal(prepareEvidenceReview(input, context).reason, 'RECORD_NOT_REVIEWABLE');
});

test('A1: all five ambiguous fields support explicit independent reviews without auto-confirmation', () => {
  let record = syntheticMovement();
  for (const [field, ref, raw] of [
    ['amount', 'C5', '$7.25+'], ['effectiveDate', 'A5', '09/10/2035'], ['currency', 'F5', '$'],
    ['contributorId', 'G5', 'Ella'], ['period', 'H5', 'Mes por validar'],
  ]) {
    sheet(record).cells[ref] = cell(raw);
    record.provenance.original[field === 'effectiveDate' ? 'date' : field] = raw;
  }
  assert.equal(inspected(record).pendingReasons.length, 5);
  const original = structuredClone(record.provenance);
  for (const field of ['amount', 'effectiveDate', 'currency', 'contributorId', 'period']) {
    const result = prepareEvidenceReview({ record, ...review(record, field) }, context);
    assert.equal(result.ok, true);
    record = result.value;
    assert.equal(total([record]), null);
  }
  assert.equal(record.evidenceReviews.length, 5);
  assert.deepEqual(record.provenance, original);
  assert.equal(inspected({ ...record, validationStatus: 'confirmed' }).eligibleForConfirmed, true);
});

test('A1: malformed and duplicate review history cannot establish traceable confirmation', () => {
  const record = syntheticMovement();
  record.amount = '8';
  const accepted = review(record, 'amount');
  for (const history of ['accepted', [{}], [accepted, accepted], [accepted, { ...accepted, id: ` ${accepted.id} ` }]]) {
    record.evidenceReviews = history;
    assert.equal(inspected(record).eligibleForConfirmed, false);
    assert.equal(total([record]), null);
  }
});

test('A1: cross-period review cannot conceal an unrelated date contradiction with the workbook', () => {
  const record = syntheticMovement();
  record.effectiveDate = '2035-10-01';
  record.periodAssignment = { decision: 'accepted', effectivePeriod: { year: 2035, month: 10 },
    postingPeriod: record.period, reason: 'Invented posting review', reviewedBy: 'milton', evidenceReference: 'invented-posting-evidence' };
  assert.ok(inspected(record).pendingReasons.includes('SOURCE_EFFECTIVE_DATE_MISMATCH'));
  assert.equal(total([record]), null);
  record.evidenceReviews = [review(record, 'effectiveDate')];
  assert.equal(inspected(record).eligibleForConfirmed, true);
});

test('A1: omitting or diverting a field reference cannot hide a preserved original', () => {
  for (const field of ['effectiveDate', 'currency', 'contributorId', 'period']) {
    const record = syntheticMovement();
    sheet(record).cells.Z9 = cell(null);
    record.provenance.evidence[field] = [reference(record, 'Z9')];
    record[field] = null;
    record.evidenceReviews = [review(record, field)];
    assert.ok(inspected(record).errors.includes('SOURCE_FIELD_REFERENCE_MISMATCH'));
    assert.equal(total([record]), null);
  }
  const record = syntheticMovement();
  record.effectiveDate = null;
  record.provenance.evidence.effectiveDate = [];
  assert.ok(inspected(record).errors.includes('SOURCE_FIELD_REFERENCE_MISMATCH'));
  assert.equal(total([record]), null);
});

test('A2: new IDs and batches cannot duplicate the same physical Excel operation', () => {
  const first = syntheticMovement();
  const repeat = structuredClone(first);
  repeat.id = 'new-import-id';
  repeat.provenance.importBatchId = 'another-import';
  repeat.provenance.sourceId = 'another-display-name';
  const before = structuredClone([first, repeat]);
  assert.equal(sourceOperationKey(first, context), sourceOperationKey(repeat, context));
  for (const records of [[first, repeat], [repeat, first]]) {
    assert.ok(inspectMovementBatch(records, context).every(entry => entry.errors.includes('DUPLICATE_SOURCE_OPERATION')));
    assert.equal(total(records), null);
  }
  assert.deepEqual([first, repeat], before);
});

test('A2: preflight checks reimports against existing records without changing historical totals', () => {
  const existing = syntheticMovement();
  const candidate = { ...structuredClone(existing), id: 'fresh-id' };
  const before = structuredClone(existing);
  const result = inspectMovementBatch([candidate], context, [existing])[0];
  assert.ok(result.errors.includes('DUPLICATE_SOURCE_OPERATION'));
  assert.equal(result.eligibleForConfirmed, false);
  assert.equal(total([existing]), '7.25');
  assert.deepEqual(existing, before);
  const sameId = syntheticMovement({ id: existing.id });
  assert.ok(inspectMovementBatch([sameId], context, [existing])[0].errors.includes('DUPLICATE_ID'));
});

test('A2: hash case, sheet case, absolute addresses and declared ranges cannot bypass identity', () => {
  const first = syntheticMovement();
  const repeat = structuredClone(first);
  repeat.id = 'another-id';
  repeat.provenance.sourceFingerprint = repeat.provenance.sourceFingerprint.toUpperCase();
  repeat.provenance.sheet = 'INVENTED';
  repeat.provenance.operation = { range: '$A$4:$H$6', amountRef: '$C$5' };
  assert.equal(sourceOperationKey(first, context), sourceOperationKey(repeat, context));
  assert.equal(confirmed([first, repeat]).length, 0);
});

test('A2: changing normalized fields cannot manufacture a new source operation', () => {
  const first = syntheticMovement();
  for (const overrides of [{ amount: '9' }, { kind: 'withdrawal' }, { contributorId: 'milton' },
    { currency: 'USD' }, { purpose: 'expenses' }, { period: { year: 2035, month: 10 } }, { householdId: 'other-household' }]) {
    const repeat = { ...structuredClone(first), ...overrides, id: 'repeat' };
    assert.ok(inspectMovementBatch([first, repeat], context).every(entry => entry.errors.includes('DUPLICATE_SOURCE_OPERATION')));
    assert.equal(total([first, repeat]), null);
  }
});

test('A2: two legitimate deposits on one row have independent amount anchors', () => {
  const first = syntheticMovement();
  const second = structuredClone(first);
  second.id = 'other-physical-operation';
  second.amount = '2.35';
  second.provenance.operation.amountRef = 'D5';
  second.provenance.cells.amount = 'D5';
  second.provenance.original.amount = '2.35';
  second.provenance.evidence.amount = [reference(second, 'D5')];
  sheet(first).cells.D5 = cell('2.35', 'number');
  bindOperation(second);
  assert.notEqual(sourceOperationKey(first, context), sourceOperationKey(second, context));
  assert.equal(confirmed([first, second]).length, 2);
  assert.equal(total([first, second]), '9.6');
});

test('A2: same identifier across different source operations is still excluded', () => {
  const first = syntheticMovement();
  const second = syntheticMovement();
  assert.notEqual(sourceOperationKey(first, context), sourceOperationKey(second, context));
  assert.ok(inspectMovementBatch([first, second], context).every(entry => entry.errors.includes('DUPLICATE_ID')));
  assert.equal(total([first, second]), null);
});

test('A2: merged amount aliases identify one operation, not two deposits', () => {
  const first = syntheticMovement();
  sheet(first).merges.push('C5:D5');
  const second = structuredClone(first);
  second.id = 'merged-alias';
  second.provenance.operation.amountRef = 'D5';
  second.provenance.cells.amount = 'C5:D5';
  second.provenance.evidence.amount = [reference(second, 'D5')];
  assert.equal(inspected(second).eligibleForConfirmed, true);
  assert.equal(sourceOperationKey(first, context), sourceOperationKey(second, context));
  assert.equal(confirmed([first, second]).length, 0);
});

test('A3: header and merged-cell evidence can lie outside the movement row', () => {
  const record = syntheticMovement();
  sheet(record).cells.A1 = cell('Moneda PEN');
  sheet(record).cells.B4 = cell('Ahorro de Fiorella');
  sheet(record).merges.push('A1:E1');
  record.provenance.cells.currency = 'C1';
  record.provenance.original.currency = 'Moneda PEN';
  record.provenance.cells.contributorId = 'B4';
  record.provenance.original.contributorId = 'Ahorro de Fiorella';
  record.provenance.evidence.currency = [reference(record, 'A1:E1')];
  record.provenance.evidence.contributorId = [reference(record, 'B4')];
  bindOperation(record);
  assert.equal(inspected(record).eligibleForConfirmed, true);
});

test('A3: cross-sheet evidence is independently verified and preserves original references', () => {
  const record = syntheticMovement();
  workbook(record).sheets.Configuration = { cells: { B2: cell('PEN') }, merges: ['B2:D2'] };
  record.provenance.originalReferences = { currency: { sheet: 'Configuration', ref: 'D2' } };
  record.provenance.cells.currency = 'D2';
  record.provenance.evidence.currency = [{ sheet: 'Configuration', ref: 'B2:D2' }];
  bindOperation(record);
  assert.equal(inspected(record).eligibleForConfirmed, true);
  record.provenance.evidence.currency[0].sheet = 'Missing';
  assert.ok(inspected(record).errors.includes('UNVERIFIABLE_FIELD_REFERENCE'));
  assert.equal(total([record]), null);
});

test('A3: unresolved or forged references cannot be replaced by a self-declared review', () => {
  for (const ref of ['Z99', 'A5:B5', 'XFE1', 'C0', 'C1048577']) {
    const record = syntheticMovement();
    record.provenance.evidence.currency = [reference(record, ref)];
    record.evidenceReviews = [review(record, 'currency')];
    assert.equal(inspected(record).eligibleForConfirmed, false);
    assert.equal(total([record]), null);
  }
  assert.equal(excelRange('$XFD$1048576').ref, 'XFD1048576');
  assert.equal(excelRange('B2:A1'), null);
  for (const invalid of ['A$$1', '$$A1', 'A$B1', 'A1:', 'A1:B2:C3']) assert.equal(excelRange(invalid), null);
});

test('A3: numeric Excel dates require the recorded date system and reject fictitious leap day', () => {
  const record = syntheticMovement();
  record.effectiveDate = '1900-03-01';
  record.period = { year: 1900, month: 3 };
  sheet(record).cells.A5 = cell('61', 'number');
  sheet(record).cells.H5 = cell('1900-03');
  record.provenance.original.date = '61';
  record.provenance.original.period = '1900-03';
  assert.equal(inspected(record).eligibleForConfirmed, true);
  for (const value of ['60', '61.5', '-1', '999999999']) {
    sheet(record).cells.A5.value = value;
    record.provenance.original.date = value;
    assert.ok(inspected(record).pendingReasons.includes('SOURCE_EFFECTIVE_DATE_AMBIGUOUS'));
  }
  sheet(record).cells.A5.value = '61'; record.provenance.original.date = '61';
  delete workbook(record).dateSystem;
  assert.ok(inspected(record).pendingReasons.includes('SOURCE_EFFECTIVE_DATE_AMBIGUOUS'));
});

test('A3: 1904 date systems and unambiguous textual dates do not assume a locale', () => {
  const record = syntheticMovement();
  workbook(record).dateSystem = '1904';
  sheet(record).cells.A5 = cell('0', 'number');
  record.provenance.original.date = '0';
  record.effectiveDate = '1904-01-01'; record.period = { year: 1904, month: 1 };
  sheet(record).cells.H5 = cell('1904-01'); record.provenance.original.period = '1904-01';
  assert.equal(inspected(record).eligibleForConfirmed, true);
  sheet(record).cells.A5 = cell('21/09/2035'); record.provenance.original.date = '21/09/2035';
  record.effectiveDate = '2035-09-21'; record.period = { year: 2035, month: 9 };
  sheet(record).cells.H5 = cell('2035-09'); record.provenance.original.period = '2035-09';
  assert.equal(inspected(record).eligibleForConfirmed, true);
});

test('A3: real-layout geometry supports separate C/D deposits, month/year and summary labels', () => {
  const first = syntheticMovement({ effectiveDate: null });
  const captured = sheet(first);
  captured.merges = ['A1:E1', 'A3:E3', 'A22:C22', 'A47:B47'];
  captured.cells.A5 = cell('Septiembre'); captured.cells.B5 = cell('2035', 'number');
  captured.cells.A48 = cell('Asignación de Milton'); captured.cells.A49 = cell('Asignación de Fiorella');
  first.contributorId = 'milton'; first.purpose = 'expenses';
  delete first.provenance.original.date; delete first.provenance.cells.date;
  delete first.provenance.original.period; delete first.provenance.cells.period;
  first.provenance.original.contributorId = 'Asignación de Milton'; first.provenance.cells.contributorId = 'A48';
  first.provenance.evidence.effectiveDate = [];
  first.provenance.evidence.period = [reference(first, 'A5', 'month'), reference(first, 'B5', 'year')];
  first.provenance.evidence.contributorId = [reference(first, 'A48')];
  const second = structuredClone(first);
  second.id = 'independent-savings'; second.contributorId = 'fiorella'; second.purpose = 'savings';
  second.provenance.operation.amountRef = 'D5'; second.provenance.cells.amount = 'D5';
  second.provenance.evidence.amount = [reference(second, 'D5')];
  second.provenance.original.contributorId = 'Asignación de Fiorella'; second.provenance.cells.contributorId = 'A49';
  second.provenance.evidence.contributorId = [reference(second, 'A49')];
  captured.cells.D5 = cell('7.25', 'number');
  bindOperation(first);
  bindOperation(second);
  assert.equal(confirmed([first, second]).length, 2);
  captured.cells.A5.value = '1 Noviembre';
  first.period = { year: 2035, month: 11 }; second.period = { year: 2035, month: 11 };
  assert.equal(confirmed([first, second]).length, 2);
  // The actual workbook lacks a universally unambiguous currency header. Removing
  // this INVENTED currency evidence leaves both records outside confirmed sums.
  delete captured.cells.F5;
  assert.equal(confirmed([first, second]).length, 0);
});

test('A3: formula totals cannot be posted as a primary operation under an invented rule', () => {
  const record = syntheticMovement();
  sheet(record).cells.C5.formula = 'SUM(D5:E5)';
  record.evidenceReviews = [review(record, 'amount')];
  assert.ok(inspected(record).pendingReasons.includes('SOURCE_FORMULA_AMOUNT_POLICY_PENDING'));
  assert.equal(total([record]), null);
});

test('A1-A3: simulated, rejected, duplicate and unresolved evidence never pollute valid totals', () => {
  const valid = syntheticMovement();
  const pending = syntheticMovement({ id: 'pending' }); pending.currency = 'USD';
  const rejected = syntheticMovement({ id: 'rejected', validationStatus: 'rejected' });
  const demo = syntheticMovement({ id: 'demo', origin: 'simulated', validationStatus: 'pending', provenance: { type: 'legacy-mock', sourceId: 'invented' } });
  const collision = syntheticMovement({ id: 'collision' });
  const repeat = { ...structuredClone(collision), id: 'repeat' };
  assert.equal(total([valid, pending, rejected, demo, collision, repeat]), '7.25');
  assert.deepEqual(confirmed([valid, pending, rejected, demo, collision, repeat]), [valid]);
});
