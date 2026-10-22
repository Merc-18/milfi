import assert from 'node:assert/strict';
import test from 'node:test';
import { controlReviewBinding, inspectControlSession, possibleControlDuplicates, prepareControlDemo, prepareControlReview, summarizeControlDemo } from '../src/domain/controlSession.js';
import { inspectMovement, partitionMovements } from '../src/domain/models.js';
import { sumConfirmedMovements } from '../src/domain/movementTotals.js';
import { createControlStore } from '../src/store/controlStore.js';
import { createMilfiStore } from '../src/store/useStore.js';
import { controlMoney } from '../src/presentation/control.js';
import { context, syntheticMovement } from './helpers/excelFixture.js';

// Invented manual operations and independent synthetic workbook fixtures only.
const period = { year: 2042, month: 6 };
const input = (changes = {}) => ({ id: 'invented-1', operationId: 'operation-1', sessionId: 'invented-session', eventId: 'event-1', expectedRevision: 0,
  occurredAt: '2042-06-12T10:00:00.000Z', kind: 'deposit', effectiveDate: '2042-06-10', period, currency: 'PEN', amount: '12.30',
  contributorId: 'fiorella', purpose: 'expenses', actorId: 'milton', description: 'Operación enteramente inventada', provenanceNote: 'Referencia ficticia uno', ...changes });
const create = changes => prepareControlDemo(input(changes)).value;
const reviewInput = (record, changes = {}) => ({ id: record.id, expectedRevision: record.revision, eventId: 'review-event', reviewId: 'review-1',
  occurredAt: '2042-06-12T11:00:00.000Z', reviewedBy: 'milton', reason: 'Revisión explícita de todos los datos ficticios',
  evidenceReference: 'Declaración de la operación inventada uno', decision: 'accepted', ...changes });
const accept = record => prepareControlReview(reviewInput(record), [record]).value;
const summary = records => summarizeControlDemo(records, period);
const scope = { currency: 'PEN', householdId: 'control-demo-household', purpose: 'expenses', kind: 'deposit' };
const excelDemo = () => {
  const record = syntheticMovement({ origin: 'simulated', validationStatus: 'pending' });
  record.provenance.type = 'control-demo-excel';
  record.contentVersion = 1; record.demoReviews = [];
  return record;
};
const inventedSheet = record => context.workbooks.get(record.provenance.sourceFingerprint).sheets.Invented;
const ref = address => ({ sheet: 'Invented', ref: address });

test('Control: a manual example has explicit independent contributor, destination and recorder', () => {
  const record = create();
  assert.equal(record.origin, 'simulated'); assert.equal(record.validationStatus, 'pending');
  assert.equal(record.contributorId, 'fiorella'); assert.equal(record.purpose, 'expenses'); assert.equal(record.actorId, 'milton');
  assert.equal(record.provenance.original.amount, '12.30'); assert.equal(record.amount, '12.3');
  assert.deepEqual(inspectMovement(record).errors, []); assert.equal(summary([record]).entries[0].status, 'pending');
  assert.deepEqual(summary([record]).groups, []);
});

test('Control: both people can contribute to either destination without deriving the recorder', () => {
  for (const contributorId of ['milton', 'fiorella']) for (const purpose of ['expenses', 'savings']) {
    const record = accept(create({ contributorId, purpose, actorId: 'fiorella' }));
    assert.equal(summary([record]).groups[0].contributorId, contributorId);
    assert.equal(summary([record]).groups[0].purpose, purpose);
    assert.equal(record.actorId, 'fiorella');
  }
});

test('Control: explicit demo acceptance never confirms real money or changes origin', () => {
  const record = accept(create());
  assert.equal(inspectControlSession([record])[0].status, 'reviewed');
  assert.equal(record.validationStatus, 'pending'); assert.equal(record.origin, 'simulated');
  assert.equal(inspectMovement(record).eligibleForConfirmed, false);
  assert.deepEqual(partitionMovements([record]).confirmed, []);
  assert.equal(sumConfirmedMovements([record], scope).total, null);
});

test('Control: independent withdrawals do not infer contributor, receiver or a net balance', () => {
  const record = accept(create({ kind: 'withdrawal', contributorId: null, purpose: 'savings' }));
  const result = summary([record]);
  assert.equal(record.contributorId, null); assert.equal(result.withdrawals, 1);
  assert.equal(result.groups[0].kind, 'withdrawal'); assert.equal(result.groups[0].total, '12.3');
  assert.equal(result.balance, undefined); assert.equal(result.groups[0].receiverId, undefined);
});

test('Control: pending withdrawal purpose policy cannot be overridden by a generic review', () => {
  const record = create({ kind: 'withdrawal', purpose: 'expenses', contributorId: null });
  assert.equal(summary([record]).entries[0].status, 'pending');
  assert.ok(prepareControlReview(reviewInput(record), [record]).errors.includes('WITHDRAWAL_PURPOSE_POLICY_PENDING'));
  assert.deepEqual(summary([record]).groups, []);
});

test('Control: missing currency, contributor or destination stays pending and outside reviewed totals', () => {
  for (const changes of [{ currency: null }, { contributorId: null }, { purpose: null }]) {
    const record = create(changes);
    assert.ok(record); assert.equal(summary([record]).pending, 1);
    assert.equal(prepareControlReview(reviewInput(record), [record]).ok, false);
    assert.deepEqual(summary([record]).groups, []);
  }
});

test('Control: invalid amounts, dates, periods and currencies are rejected without mutation', () => {
  const variants = [{ amount: '-1' }, { amount: '1,2' }, { amount: 'Infinity' }, { amount: 12 }, { amount: '' },
    { amount: 'NaN' }, { amount: '1e3' }, { effectiveDate: '2042-02-30' }, { effectiveDate: '' },
    { period: { year: 0, month: 6 } }, { period: { year: 2042, month: 13 } }, { period: null }, { currency: 'XYZ' }, { currency: 'S/' }];
  for (const changes of variants) {
    const draft = input(changes); const snapshot = structuredClone(draft);
    assert.equal(prepareControlDemo(draft).ok, false, JSON.stringify(changes)); assert.deepEqual(draft, snapshot);
  }
});

test('Control: zero and fractional-cent amounts are preserved pending approved policies', () => {
  for (const amount of ['0', '0.001', '12.345678901234567890123456789']) {
    const record = create({ amount });
    assert.ok(record); assert.equal(record.amount, amount);
    assert.equal(prepareControlReview(reviewInput(record), [record]).ok, false);
    assert.deepEqual(summary([record]).groups, []);
  }
});

test('Control: deposits and withdrawals, destinations and PEN/USD are grouped separately with exact sums', () => {
  const records = [create({ id: 'a', amount: '0.1' }), create({ id: 'b', operationId: 'b', amount: '0.2' }),
    create({ id: 'c', operationId: 'c', currency: 'USD', amount: '100' }),
    create({ id: 'd', operationId: 'd', kind: 'withdrawal', purpose: 'savings', contributorId: null, amount: '50' }),
    create({ id: 'e', operationId: 'e', purpose: 'savings', contributorId: 'milton', amount: '4' })].map(accept);
  const result = summary(records);
  assert.equal(result.groups.length, 4);
  assert.equal(result.groups.find(group => group.currency === 'PEN' && group.kind === 'deposit' && group.purpose === 'expenses').total, '0.3');
  assert.equal(result.groups.find(group => group.currency === 'USD').total, '100');
  assert.equal(result.total, undefined); assert.equal(result.balance, undefined);
});

test('Control: date/period mismatch requires a record-specific explicit traceable assignment', () => {
  const record = create({ effectiveDate: '2042-05-31' });
  assert.ok(prepareControlReview(reviewInput(record), [record]).errors.includes('PERIOD_ASSIGNMENT_REVIEW_REQUIRED'));
  const accepted = prepareControlReview(reviewInput(record, { acceptPeriodAssignment: true }), [record]);
  assert.equal(accepted.ok, true); assert.equal(summary([accepted.value]).entries[0].status, 'reviewed');
  assert.deepEqual(accepted.value.periodAssignment.postingPeriod, period);
  assert.deepEqual(accepted.value.periodAssignment.effectivePeriod, { year: 2042, month: 5 });
  assert.ok(accepted.event.after.periodAssignment.evidenceReference);
});

test('Control: explicit rejection is traced and excluded from reviewed totals', () => {
  const record = create({ currency: null });
  const result = prepareControlReview(reviewInput(record, { decision: 'rejected' }), [record]);
  assert.equal(result.ok, true); assert.equal(summary([result.value]).entries[0].status, 'rejected');
  assert.deepEqual(summary([result.value]).groups, []); assert.equal(result.event.action, 'review');
});

test('Control: editing invalidates old review, preserves originals and requires another explicit review', () => {
  const original = accept(create());
  const result = prepareControlDemo(input({ expectedRevision: original.revision, amount: '20', eventId: 'edit', occurredAt: '2042-06-12T12:00:00.000Z' }), [original]);
  assert.equal(result.ok, true); assert.equal(result.value.id, original.id);
  assert.equal(result.value.provenance.original.amount, '12.30'); assert.equal(result.value.amount, '20');
  assert.equal(result.event.before.amount, '12.3'); assert.equal(result.event.after.amount, '20');
  assert.equal(summary([result.value]).entries[0].staleReviews, 1); assert.deepEqual(summary([result.value]).groups, []);
  const second = prepareControlReview(reviewInput(result.value, { reviewId: 'review-2', occurredAt: '2042-06-12T13:00:00.000Z' }), [result.value]);
  assert.equal(summary([second.value]).groups[0].total, '20');
});

test('Control: reverting content cannot reactivate an older review binding', () => {
  const original = accept(create());
  const edit = prepareControlDemo(input({ expectedRevision: original.revision, amount: '20', occurredAt: '2042-06-12T12:00:00.000Z' }), [original]).value;
  const reverted = prepareControlDemo(input({ expectedRevision: edit.revision, occurredAt: '2042-06-12T13:00:00.000Z' }), [edit]).value;
  assert.equal(reverted.amount, original.amount); assert.notEqual(controlReviewBinding(reverted), controlReviewBinding(original));
  assert.equal(summary([reverted]).entries[0].status, 'pending');
});

test('Control: changing provenance, actor or any operation field invalidates an acceptance', () => {
  for (const change of [record => { record.currency = 'USD'; }, record => { record.purpose = 'savings'; },
    record => { record.contributorId = 'milton'; }, record => { record.actorId = 'fiorella'; },
    record => { record.provenance.statement = 'Otra declaración inventada'; }, record => { record.period.month = 5; },
    record => { record.effectiveDate = '2042-06-11'; }, record => { record.description = 'Otra descripción inventada'; }]) {
    const record = accept(create()); change(record);
    assert.equal(inspectControlSession([record])[0].status, 'pending'); assert.deepEqual(summary([record]).groups, []);
  }
});

test('Control: duplicate identifiers and manual origin identities are excluded from all aggregates', () => {
  const a = accept(create());
  const duplicateId = structuredClone(a); duplicateId.provenance.operationId = 'other'; duplicateId.provenance.original.operationId = 'other';
  assert.ok(inspectControlSession([a, duplicateId]).every(item => item.errors.includes('DUPLICATE_ID')));
  assert.ok(prepareControlDemo(input({ expectedRevision: a.revision }), [a, duplicateId]).errors.includes('DUPLICATE_ID'));
  const b = structuredClone(a); b.id = 'another-id';
  assert.ok(inspectControlSession([a, b]).every(item => item.errors.includes('DUPLICATE_SOURCE_OPERATION')));
  assert.deepEqual(summary([a, b]).groups, []);
  assert.equal(prepareControlDemo(input({ id: 'another-id' }), [a]).ok, false);
});

test('Control: possible value duplicates require explanation without blocking legitimate distinct operations', () => {
  const a = create();
  const next = input({ id: 'invented-2', operationId: 'operation-2' });
  assert.equal(prepareControlDemo(next, [a]).errors[0], 'POSSIBLE_DUPLICATE_REQUIRES_REVIEW');
  const result = prepareControlDemo({ ...next, distinctOperationReason: 'Segundo depósito ficticio independiente' }, [a]);
  assert.equal(result.ok, true); assert.equal(possibleControlDuplicates(result.value, [a]).length, 1);
  assert.equal(summary([a, result.value]).deposits, 2); assert.deepEqual(summary([a, result.value]).groups, []);
});

test('Control: reviews require responsible identity, decision, reason, reference and unique IDs', () => {
  const record = create();
  for (const changes of [{ reviewedBy: null }, { reason: '' }, { evidenceReference: '' }, { decision: 'confirmed' }, { reviewId: '' }]) {
    assert.equal(prepareControlReview(reviewInput(record, changes), [record]).ok, false);
  }
  const accepted = accept(record);
  assert.equal(prepareControlReview(reviewInput(accepted), [accepted]).ok, false);
});

test('Control: optimistic revisions, timestamp order and unique event IDs protect session changes', () => {
  const first = prepareControlDemo(input());
  assert.equal(prepareControlDemo(input(), [first.value]).errors[0], 'STALE_REVISION');
  assert.equal(prepareControlDemo(input({ expectedRevision: 1 }), [first.value], [first.event]).errors[0], 'DUPLICATE_EVENT_ID');
  assert.equal(prepareControlDemo(input({ expectedRevision: 1, occurredAt: '2042-06-01T00:00:00.000Z' }), [first.value]).errors[0], 'BACKDATED_CHANGE');
  assert.equal(prepareControlDemo(input({ expectedRevision: 1, operationId: 'new' }), [first.value]).errors[0], 'IMMUTABLE_OPERATION_IDENTITY');
});

test('Control: real/confirmed/foreign-module writes and arbitrary source substitutions are unavailable', () => {
  for (const changes of [{ origin: 'real' }, { validationStatus: 'confirmed' }, { moduleId: 'fiorella' },
    { provenance: { type: 'control-excel' } }, { actorId: null }, { provenanceNote: '' }]) {
    assert.equal(prepareControlDemo(input(changes)).ok, false);
  }
  const record = create(); record.origin = 'real';
  assert.equal(prepareControlReview(reviewInput(record), [record]).ok, false);
  assert.deepEqual(summary([record]).groups, []);
});

test('Control: a manual source cannot masquerade as captured Excel evidence', () => {
  for (const changes of [{ cells: { currency: 'Z99' } }, { evidence: { currency: [ref('Z99')] } }, { sourceFingerprint: 'a'.repeat(64) }]) {
    const record = accept(create()); Object.assign(record.provenance, changes);
    const result = summary([record]); assert.equal(result.entries[0].status, 'invalid'); assert.deepEqual(result.groups, []);
  }
});

test('Control: synthetic Excel provenance keeps A1 arbitrary cells pending even under a broad demo review', () => {
  for (const [field, value] of [['currency', 'PEN'], ['contributorId', 'fiorella'], ['period', '2035-09']]) {
    const record = excelDemo(); const sheet = inventedSheet(record);
    sheet.cells.Z99 = { type: 'text', value };
    record.provenance.original[field] = value; record.provenance.cells[field] = 'Z99'; record.provenance.evidence[field] = [ref('Z99')];
    record.demoReviews = [{ id: 'invented-review', decision: 'accepted', binding: controlReviewBinding(record, context),
      reason: 'Revisión ficticia genérica', evidenceReference: 'Referencia inventada', reviewedBy: 'milton', reviewedAt: '2042-06-12T11:00:00.000Z' }];
    const entry = inspectControlSession([record], context)[0];
    assert.equal(entry.status, 'pending'); assert.ok(entry.pendingReasons.some(reason => reason.endsWith('RELATION_REVIEW_REQUIRED')));
    assert.deepEqual(summarizeControlDemo([record], record.period, context).groups, []);
  }
});

test('Control: missing Excel currency evidence never infers a denomination', () => {
  const record = excelDemo();
  record.currency = null; delete record.provenance.original.currency; delete record.provenance.cells.currency;
  record.provenance.evidence.currency = [];
  assert.equal(inspectControlSession([record], context)[0].status, 'pending');
  assert.deepEqual(summarizeControlDemo([record], record.period, context).groups, []);
});

test('Control: SHA/sheet/physical-operation dedup prevents reimport regardless of IDs or batch', () => {
  const a = excelDemo(); const b = structuredClone(a);
  b.id = 'another-invented-record'; b.provenance.importBatchId = 'another-invented-batch';
  assert.ok(inspectControlSession([a, b], context).every(entry => entry.errors.includes('DUPLICATE_SOURCE_OPERATION')));
});

test('Control: distinct deposits in two columns of a row remain separate and use their own headers', () => {
  const a = excelDemo(); const sheet = inventedSheet(a);
  sheet.cells.C4 = { type: 'text', value: 'fiorella' }; sheet.cells.D4 = { type: 'text', value: 'milton' };
  a.provenance.original.contributorId = 'fiorella'; a.provenance.cells.contributorId = 'C4'; a.provenance.evidence.contributorId = [ref('C4')];
  sheet.operations.C5.fields.contributorId = [ref('C4')];
  const b = structuredClone(a); b.id = 'other-column'; b.contributorId = 'milton';
  b.provenance.operation.amountRef = 'D5'; b.provenance.cells.amount = 'D5'; b.provenance.evidence.amount = [ref('D5')];
  b.provenance.original.contributorId = 'milton'; b.provenance.cells.contributorId = 'D4'; b.provenance.evidence.contributorId = [ref('D4')];
  sheet.cells.D5 = { type: 'number', value: a.provenance.original.amount };
  sheet.operations.D5 = structuredClone(sheet.operations.C5); sheet.operations.D5.fields.amount = [ref('D5')]; sheet.operations.D5.fields.contributorId = [ref('D4')];
  assert.ok(inspectControlSession([a, b], context).every(entry => !entry.errors.length && !entry.pendingReasons.length));
});

test('Control: merged header associations remain verifiable and changing captures invalidates reviews', () => {
  const record = excelDemo(); const sheet = inventedSheet(record);
  sheet.cells.A1 = { type: 'text', value: 'PEN' }; sheet.merges.push('A1:H1');
  record.provenance.original.currency = 'PEN'; record.provenance.cells.currency = 'A1:H1'; record.provenance.evidence.currency = [ref('D1')];
  sheet.operations.C5.fields.currency = [ref('A1:H1')];
  assert.deepEqual(inspectControlSession([record], context)[0].pendingReasons, []);
  const before = controlReviewBinding(record, context); sheet.cells.A1.value = 'USD';
  assert.notEqual(controlReviewBinding(record, context), before);
  assert.equal(inspectControlSession([record], context)[0].eligibleForConfirmed, false);
});

test('Control: session store preserves audit snapshots and is isolated from Fiorella and real history', () => {
  const store = createControlStore(); const fiorella = createMilfiStore();
  const result = store.getState().saveDemo(input()); assert.equal(result.ok, true);
  result.value.amount = '999'; result.event.after.amount = '888';
  assert.equal(store.getState().demoMovements[0].amount, '12.3'); assert.equal(store.getState().events[0].after.amount, '12.3');
  const record = store.getState().demoMovements[0]; assert.equal(store.getState().reviewDemo(reviewInput(record)).ok, true);
  assert.equal(store.getState().events.length, 2);
  assert.deepEqual(fiorella.getState().controlMovements, []); assert.deepEqual(fiorella.getState().fiorellaDemoRecords, []);
  assert.deepEqual(fiorella.getState().fiorellaRecords, []); assert.deepEqual(fiorella.getState().simulations, []);
  assert.deepEqual(createControlStore().getState().demoMovements, []); assert.deepEqual(createControlStore().getState().events, []);
});

test('Control: valid period selection isolates month/year totals and invalid drafts preserve applied period', () => {
  const record = accept(create()); const store = createControlStore();
  assert.equal(store.getState().selectPeriod('2042-06'), true);
  for (const value of ['', '2042-', '0000-01', '2042-13', 'not-a-month']) assert.equal(store.getState().selectPeriod(value), false);
  assert.equal(store.getState().selectedPeriod, '2042-06');
  for (const other of [{ year: 2042, month: 5 }, { year: 2043, month: 6 }]) assert.deepEqual(summarizeControlDemo([record], other).groups, []);
  assert.equal(summarizeControlDemo([record], null).status, 'invalid');
});

test('Control: malformed commands and reviews fail safely without throwing', () => {
  for (const command of [null, [], {}, input({ id: 3 }), input({ occurredAt: 'today' }), input({ expectedRevision: -1 })]) {
    assert.doesNotThrow(() => prepareControlDemo(command)); assert.equal(prepareControlDemo(command).ok, false);
    assert.doesNotThrow(() => prepareControlReview(command)); assert.equal(prepareControlReview(command).ok, false);
  }
});

test('Control: presentation preserves explicit currency and exact decimals without inventing zero totals', () => {
  assert.equal(controlMoney('0.1', 'USD'), 'USD 0.10'); assert.equal(controlMoney('1234.567', 'PEN'), 'PEN 1,234.567');
  assert.equal(controlMoney('12', null), 'Importe o moneda pendiente');
  assert.deepEqual(summary([]).groups, []);
});
