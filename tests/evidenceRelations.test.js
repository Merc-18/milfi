import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectMovement, partitionMovements } from '../src/domain/models.js';
import { evidenceBinding } from '../src/domain/excelEvidence.js';
import { prepareEvidenceReview } from '../src/application/evidenceReview.js';
import { sumConfirmedMovements } from '../src/domain/movementTotals.js';
import { context, review, syntheticMovement } from './helpers/excelFixture.js';

// Independently invented records and layouts. No private workbook is opened.
const workbook = record => context.workbooks.get(record.provenance.sourceFingerprint);
const sheet = record => workbook(record).sheets.Invented;
const inspect = record => inspectMovement(record, context);
const scope = { currency: 'PEN', householdId: 'imaginary-household', purpose: 'savings', kind: 'deposit' };
const ref = address => ({ sheet: 'Invented', ref: address });
const pendingRelation = field => `SOURCE_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}_RELATION_REVIEW_REQUIRED`;

function redirectEvidence(record, field, address, value) {
  sheet(record).cells[address] = { type: 'text', value };
  record.provenance.original[field] = value;
  record.provenance.cells[field] = address;
  record.provenance.evidence[field] = [ref(address)];
  // Deliberately leave the trusted operation layout unchanged.
}

function assertBlocked(record) {
  assert.equal(inspect(record).eligibleForConfirmed, false);
  assert.equal(partitionMovements([record], context).confirmed.length, 0);
  assert.equal(sumConfirmedMovements([record], scope, context).total, null);
}

for (const [field, address, value] of [
  ['contributorId', 'A48', 'fiorella'],
  ['currency', 'Z99', 'PEN'],
  ['period', 'H6', '2035-09'],
]) test(`A1 final: ${field} from an unrelated position cannot confirm even with matching original text`, () => {
  const record = syntheticMovement();
  redirectEvidence(record, field, address, value);
  assert.deepEqual(inspect(record).errors, []);
  assert.ok(inspect(record).pendingReasons.includes(pendingRelation(field)));
  assertBlocked(record);
});

test('A1 final: enlarging the declared range cannot make an unrelated field trustworthy', () => {
  const record = syntheticMovement();
  redirectEvidence(record, 'currency', 'Z99', 'PEN');
  record.provenance.operation.range = 'A1:Z100';
  record.provenance.related = true;
  record.provenance.operations = structuredClone(sheet(record).operations);
  record.provenance.operations.C5.fields.currency = [ref('Z99')];
  assert.ok(inspect(record).pendingReasons.includes(pendingRelation('currency')));
  assertBlocked(record);
});

test('A1 final: a convenient cell inside the operation range is not automatically the right field', () => {
  const record = syntheticMovement();
  redirectEvidence(record, 'currency', 'B5', 'PEN');
  assert.ok(inspect(record).pendingReasons.includes(pendingRelation('currency')));
  assertBlocked(record);
});

test('A1 final: omitting individual original or cell entries cannot bypass operation association', () => {
  for (const field of ['currency', 'contributorId', 'period']) {
    for (const omitted of ['original', 'cells', 'both']) {
      const record = syntheticMovement();
      redirectEvidence(record, field, 'Z99', field === 'currency' ? 'PEN' : field === 'period' ? '2035-09' : 'fiorella');
      if (omitted !== 'cells') delete record.provenance.original[field];
      if (omitted !== 'original') delete record.provenance.cells[field];
      assertBlocked(record);
    }
  }
});

test('A1 final: missing original or cells objects never permit financial confirmation', () => {
  for (const name of ['original', 'cells']) {
    const record = syntheticMovement();
    delete record.provenance[name];
    assert.ok(inspect(record).errors.includes('INCOMPLETE_SOURCE_TRACE'));
    assertBlocked(record);
  }
});

test('A1 final: omitted mandatory evidence cannot be replaced by originals, layout or an old review', () => {
  for (const field of ['amount', 'effectiveDate', 'currency', 'contributorId', 'period']) {
    const record = syntheticMovement();
    record.evidenceReviews = [review(record, field)];
    delete record.provenance.evidence[field];
    assertBlocked(record);
  }
});

test('A1 final: removing original date metadata cannot conceal a known date as an absent day', () => {
  const record = syntheticMovement();
  record.effectiveDate = null;
  delete record.provenance.original.date;
  delete record.provenance.cells.date;
  record.provenance.evidence.effectiveDate = [];
  assertBlocked(record);
  assert.ok(inspect(record).pendingReasons.includes('SOURCE_EFFECTIVE_DATE_EVIDENCE_REQUIRED'));
});

test('A1 final: a header is accepted only with an independent field-to-operation layout link', () => {
  const record = syntheticMovement();
  redirectEvidence(record, 'contributorId', 'C4', 'fiorella');
  assertBlocked(record);
  sheet(record).operations.C5.fields.contributorId = [ref('C4')];
  assert.equal(inspect(record).eligibleForConfirmed, true);
});

test('A1 final: verified merged headers accept anchor, interior and full-range aliases', () => {
  const record = syntheticMovement();
  redirectEvidence(record, 'currency', 'A1', 'Moneda PEN');
  sheet(record).merges = ['A1:H1'];
  sheet(record).operations.C5.fields.currency = [ref('A1:H1')];
  for (const address of ['A1', 'F1', '$A$1:$H$1']) {
    record.provenance.evidence.currency = [ref(address)];
    assert.equal(inspect(record).eligibleForConfirmed, true);
  }
});

test('A1 final: complete linked evidence inside the verified operation remains confirmable', () => {
  const record = syntheticMovement();
  assert.equal(inspect(record).eligibleForConfirmed, true);
  const before = structuredClone(record);
  assert.equal(sumConfirmedMovements([record], scope, context).total, '7.25');
  assert.deepEqual(record, before);
});

test('A1 final: a traceable explicit review can resolve a missing structural link without auto-posting', () => {
  const record = syntheticMovement();
  redirectEvidence(record, 'contributorId', 'A48', 'fiorella');
  const before = structuredClone(record);
  const result = prepareEvidenceReview({ record, ...review(record, 'contributorId') }, context);
  assert.equal(result.ok, true);
  assert.equal(result.value.validationStatus, 'pending');
  assert.deepEqual(record, before);
  assert.deepEqual(result.value.provenance, before.provenance);
  assertBlocked(result.value);
  assert.equal(inspect({ ...result.value, validationStatus: 'confirmed' }).eligibleForConfirmed, true);
});

test('A1 final: structural resolution still requires all review traceability fields', () => {
  for (const change of [{ reason: '' }, { evidenceReference: '' }, { reviewedBy: 'unknown' }, { reviewedAt: '' }, { id: '' }]) {
    const record = syntheticMovement();
    redirectEvidence(record, 'currency', 'Z99', 'PEN');
    record.evidenceReviews = [review(record, 'currency', change)];
    assertBlocked(record);
  }
});

test('A1 final: a structural review expires if evidence, operation range or independent links change', () => {
  for (const change of [
    record => { sheet(record).cells.A48.value = 'Asignación de Fiorella'; record.provenance.original.contributorId = 'Asignación de Fiorella'; },
    record => { redirectEvidence(record, 'contributorId', 'A49', 'fiorella'); },
    record => { record.provenance.operation.range = 'A5:Z5'; },
    record => { sheet(record).operations.C5.fields.contributorId = [ref('B5')]; sheet(record).cells.B5 = { type: 'text', value: 'fiorella' }; },
  ]) {
    const record = syntheticMovement();
    redirectEvidence(record, 'contributorId', 'A48', 'fiorella');
    record.evidenceReviews = [review(record, 'contributorId')];
    assert.equal(inspect(record).eligibleForConfirmed, true);
    const previous = record.evidenceReviews[0].binding;
    change(record);
    assert.notEqual(evidenceBinding(record, 'contributorId', context), previous);
    assertBlocked(record);
  }
});

test('A1 final: trusted mappings remain specific to each deposit column on a shared row', () => {
  const first = syntheticMovement();
  redirectEvidence(first, 'contributorId', 'C4', 'fiorella');
  sheet(first).operations.C5.fields.contributorId = [ref('C4')];
  const second = structuredClone(first);
  second.id = 'second-column'; second.amount = '3.75'; second.contributorId = 'milton';
  second.provenance.operation.amountRef = 'D5';
  second.provenance.cells.amount = 'D5'; second.provenance.original.amount = '3.75';
  second.provenance.evidence.amount = [ref('D5')];
  sheet(first).cells.D5 = { type: 'number', value: '3.75' };
  redirectEvidence(second, 'contributorId', 'D4', 'milton');
  sheet(first).operations.D5 = structuredClone(sheet(first).operations.C5);
  sheet(first).operations.D5.fields.amount = [ref('D5')];
  sheet(first).operations.D5.fields.contributorId = [ref('D4')];
  assert.equal(partitionMovements([first, second], context).confirmed.length, 2);
  assert.equal(sumConfirmedMovements([first, second], scope, context).total, '11');
  // Reusing the first column's label must not silently assign its person to D5.
  second.contributorId = 'fiorella';
  redirectEvidence(second, 'contributorId', 'C4', 'fiorella');
  assertBlocked(second);
});

test('A1 final: Control cannot infer currency from layout, another operation or UI defaults', () => {
  const record = syntheticMovement();
  delete sheet(record).cells.F5;
  delete record.provenance.original.currency;
  delete record.provenance.cells.currency;
  record.provenance.evidence.currency = [];
  assertBlocked(record);
  redirectEvidence(record, 'currency', 'F6', 'PEN');
  assert.ok(inspect(record).pendingReasons.includes(pendingRelation('currency')));
  assertBlocked(record);
});

test('A1 final: malformed or missing trusted associations fail closed without changing A2 identity', () => {
  for (const change of [
    record => { delete sheet(record).operations; },
    record => { sheet(record).operations.C5.range = 'A6:H6'; },
    record => { sheet(record).operations.C5.fields.currency = [null]; },
    record => { delete sheet(record).operations.C5.fields.period; },
  ]) {
    const record = syntheticMovement();
    change(record);
    assert.doesNotThrow(() => inspect(record));
    assertBlocked(record);
  }
});
