import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectMovement, inspectMovementBatch, findDuplicateIds, partitionMovements, validateEnvelope, validateMovement } from '../src/domain/models.js';
import { sumConfirmedMovements } from '../src/domain/movementTotals.js';
import { createMilfiStore } from '../src/store/useStore.js';

// Independently invented fixtures. No values or labels from private sources.
function sample(overrides = {}) {
  const record = {
    id: 'invented-deposit', schemaVersion: 1, householdId: 'test-household', revision: 1,
    moduleId: 'control-mf', origin: 'real', validationStatus: 'confirmed', actorId: 'milton',
    period: { year: 2032, month: 5 }, kind: 'deposit', purpose: 'savings', contributorId: 'fiorella',
    amount: '12.50', currency: 'PEN', effectiveDate: '2032-05-12', description: null,
    provenance: { type: 'control-excel', sourceId: 'invented-workbook', sourceFingerprint: 'b'.repeat(64),
      importBatchId: 'invented-import', sheet: 'Invented', row: 2,
      cells: { amount: 'C2', date: 'A2' }, original: { amount: '12.50', date: '2032-05-12' } },
    ...overrides,
  };
  if (!overrides.provenance && typeof record.amount === 'string') record.provenance.original.amount = record.amount;
  return record;
}
const scope = { currency: 'PEN', householdId: 'test-household', purpose: 'savings', kind: 'deposit' };

test('effective date in the posting period needs no cross-period assumption', () => {
  assert.equal(inspectMovement(sample()).eligibleForConfirmed, true);
  assert.deepEqual(validateMovement(sample({ effectiveDate: null })), []);
});

test('cross-period movements remain pending without silently changing either date or period', () => {
  const record = sample({ effectiveDate: '2032-06-01' });
  const before = structuredClone(record);
  assert.ok(inspectMovement(record).pendingReasons.includes('PERIOD_ASSIGNMENT_REVIEW_REQUIRED'));
  assert.deepEqual(partitionMovements([record]).pending, [record]);
  assert.deepEqual(sumConfirmedMovements([record], scope), { status: 'unavailable', currency: 'PEN', total: null });
  assert.deepEqual(record, before);
});

test('explicit record-specific evidence distinguishes legitimate cross-period assignment', () => {
  const record = sample({ effectiveDate: '2032-06-01', periodAssignment: {
    decision: 'accepted', effectivePeriod: { year: 2032, month: 6 }, postingPeriod: { year: 2032, month: 5 },
    reason: 'Invented record-specific review', reviewedBy: 'milton', evidenceReference: 'invented-review-reference',
  } });
  assert.deepEqual(validateMovement(record), []);
  assert.equal(inspectMovement(record).eligibleForConfirmed, true);
  for (const assignment of [
    { ...record.periodAssignment, decision: 'inconsistent' },
    { ...record.periodAssignment, evidenceReference: '' },
    { ...record.periodAssignment, effectivePeriod: { year: 2032, month: 7 } },
    { ...record.periodAssignment, postingPeriod: { year: 2032, month: 4 } },
    { ...record.periodAssignment, reviewedBy: 'unknown-person' },
  ]) assert.equal(inspectMovement({ ...record, periodAssignment: assignment }).eligibleForConfirmed, false);
});

test('inconsistent dates are identified separately from unreviewed assignments', () => {
  const record = sample({ effectiveDate: '2032-06-01', periodAssignment: { decision: 'inconsistent' } });
  assert.deepEqual(inspectMovement(record).pendingReasons, ['PERIOD_DATE_INCONSISTENCY']);
  assert.equal(partitionMovements([record]).confirmed.length, 0);
});

test('currency is explicit, known and never inferred from an amount or original symbol', () => {
  const record = sample({ currency: null, provenance: { ...sample().provenance, original: { amount: '$12.50', date: '2032-05-12' } } });
  assert.ok(validateMovement(record).includes('UNRESOLVED_MONEY'));
  assert.equal(partitionMovements([record]).pending.length, 1);
  for (const currency of ['$', 'pen', '', 'ZZZ', 'XXX']) assert.ok(validateMovement(sample({ currency })).includes('INVALID_CURRENCY'));
  assert.equal(inspectMovement(sample({ currency: 'USD' })).eligibleForConfirmed, true);
});

test('totals require an explicit household, destination, movement kind and currency', () => {
  for (const missing of ['currency', 'householdId', 'purpose', 'kind']) {
    const incomplete = { ...scope };
    delete incomplete[missing];
    assert.deepEqual(sumConfirmedMovements([sample()], incomplete), { status: 'blocked', reason: 'EXPLICIT_SCOPE_REQUIRED', total: null });
  }
  assert.deepEqual(sumConfirmedMovements([], scope), { status: 'unavailable', currency: 'PEN', total: null });
});

test('different currencies cannot be directly aggregated, even with an explicit requested currency', () => {
  const records = [sample(), sample({ id: 'invented-dollar', currency: 'USD' })];
  assert.deepEqual(sumConfirmedMovements(records, scope), { status: 'blocked', reason: 'MIXED_CURRENCIES', total: null });
  assert.deepEqual(sumConfirmedMovements(records, { ...scope, currency: 'USD' }), { status: 'blocked', reason: 'MIXED_CURRENCIES', total: null });
});

test('exact same-currency totals exclude other destinations and households', () => {
  const records = [sample(), sample({ id: 'invented-second', amount: '0.05' }),
    sample({ id: 'other-purpose', purpose: 'expenses', amount: '500' }),
    sample({ id: 'other-household', householdId: 'another-household', amount: '500' })];
  assert.deepEqual(sumConfirmedMovements(records, scope), { status: 'available', currency: 'PEN', total: '12.55' });
});

test('Excel provenance rejects empty or meaningless originals and missing field coordinates', () => {
  const source = sample().provenance;
  for (const changes of [
    { original: {} }, { original: { amount: '' } }, { original: { amount: '   ' } },
    { original: { amount: null } }, { original: { amount: 12 } },
    { cells: {} }, { cells: { amount: 'C3', date: 'A2' } },
    { cells: { amount: 'ZZZ2', date: 'A2' } }, { sourceFingerprint: 'not-a-hash' },
    { row: 1048577 }, { sourceId: '' }, { sheet: '' }, { importBatchId: '' },
  ]) assert.equal(inspectMovement(sample({ provenance: { ...source, ...changes } })).eligibleForConfirmed, false);
  assert.ok(validateMovement(sample({ provenance: { ...source, original: { date: '2032-05-12' }, cells: { date: 'A2' } } })).includes('MISSING_ORIGINAL_AMOUNT'));
});

test('pending originals preserve ambiguous text without conversion or confirmation', () => {
  const record = sample({ validationStatus: 'pending', amount: null, currency: null, effectiveDate: null, period: null,
    provenance: { ...sample().provenance, original: { amount: '$12+', date: 'unresolved' } } });
  const before = structuredClone(record);
  assert.deepEqual(validateMovement(record), []);
  assert.equal(inspectMovement(record).eligibleForConfirmed, false);
  assert.deepEqual(partitionMovements([record]).pending, [record]);
  assert.deepEqual(record, before);
});

test('a parsed-looking amount cannot hide ambiguity or alter a numeric Excel source', () => {
  const source = sample().provenance;
  const ambiguous = sample({ provenance: { ...source, original: { ...source.original, amount: '$12.50+' } } });
  assert.ok(inspectMovement(ambiguous).pendingReasons.includes('SOURCE_AMOUNT_INTERPRETATION_REQUIRED'));
  assert.equal(partitionMovements([ambiguous]).confirmed.length, 0);
  const changed = sample({ amount: '99', provenance: source });
  assert.ok(inspectMovement(changed).pendingReasons.includes('SOURCE_AMOUNT_MISMATCH'));
  assert.equal(sumConfirmedMovements([changed], scope).total, null);
});

test('amount interpretation requires review evidence tied to original text and explicit currency', () => {
  const source = sample().provenance;
  const record = sample({ provenance: { ...source, original: { ...source.original, amount: '$12.50' } },
    amountInterpretation: { decision: 'accepted', originalAmount: '$12.50', amount: '12.50', currency: 'PEN',
      reviewedBy: 'milton', evidenceReference: 'invented-external-review' } });
  assert.equal(inspectMovement(record).eligibleForConfirmed, true);
  for (const review of [
    { ...record.amountInterpretation, evidenceReference: '' },
    { ...record.amountInterpretation, originalAmount: '$12.50+' },
    { ...record.amountInterpretation, currency: 'USD' },
    { ...record.amountInterpretation, amount: '99' },
  ]) assert.equal(inspectMovement({ ...record, amountInterpretation: review }).eligibleForConfirmed, false);
});

test('all duplicate ID occurrences are detected and excluded rather than keeping a winner', () => {
  const first = sample();
  const collision = sample({ amount: '90' });
  assert.deepEqual(findDuplicateIds([first, collision]), ['invented-deposit']);
  const inspected = inspectMovementBatch([first, collision]);
  assert.ok(inspected.every(entry => entry.errors.includes('DUPLICATE_ID') && !entry.eligibleForConfirmed));
  assert.equal(partitionMovements([first, collision]).invalid.length, 2);
  assert.equal(sumConfirmedMovements([first, collision], scope).total, null);
  assert.equal(sumConfirmedMovements([collision, first], scope).total, null);
});

test('simulation and financial confirmation are contradictory for any declared source', () => {
  const record = sample({ origin: 'simulated', provenance: { type: 'legacy-mock', sourceId: 'invented-demo' } });
  assert.ok(validateEnvelope(record).includes('SIMULATED_CANNOT_BE_CONFIRMED'));
  assert.equal(partitionMovements([record]).invalid.length, 1);
  assert.equal(sumConfirmedMovements([record], scope).total, null);
});

test('simulations, pending, rejected, invalid and unresolved records never contaminate confirmed totals', () => {
  const records = [sample(),
    sample({ id: 'demo', origin: 'simulated', validationStatus: 'pending', provenance: { type: 'legacy-mock', sourceId: 'invented' } }),
    sample({ id: 'pending', validationStatus: 'pending', currency: 'USD' }),
    sample({ id: 'rejected', validationStatus: 'rejected' }),
    sample({ id: 'fractional', amount: '0.001' }),
    sample({ id: 'cross-period', effectiveDate: '2032-06-01' }),
    sample({ id: 'invalid', amount: '12+' })];
  assert.deepEqual(sumConfirmedMovements(records, scope), { status: 'available', currency: 'PEN', total: '12.5' });
  assert.equal(partitionMovements(records).confirmed.length, 1);
});

test('contributor, purpose and recording user are independent contract fields', () => {
  for (const contributorId of ['milton', 'fiorella']) {
    for (const purpose of ['expenses', 'savings']) {
      assert.deepEqual(validateMovement(sample({ contributorId, purpose, actorId: 'fiorella' })), []);
    }
  }
});

test('withdrawals with unapproved treatment are retained pending without imposing a prohibition', () => {
  const pending = sample({ kind: 'withdrawal', purpose: 'expenses', validationStatus: 'pending' });
  assert.deepEqual(validateMovement(pending), []);
  assert.deepEqual(inspectMovement(pending).errors, []);
  assert.ok(inspectMovement(pending).pendingReasons.includes('WITHDRAWAL_PURPOSE_POLICY_PENDING'));
  assert.deepEqual(partitionMovements([{ ...pending, validationStatus: 'confirmed' }]).pending.length, 1);
  assert.equal(sumConfirmedMovements([pending], { ...scope, kind: 'withdrawal', purpose: 'expenses' }).total, null);
});

test('an unknown withdrawal destination remains explicit and pending rather than defaulting to savings', () => {
  const record = sample({ kind: 'withdrawal', purpose: null, validationStatus: 'pending' });
  assert.deepEqual(validateMovement(record), []);
  assert.ok(inspectMovement(record).pendingReasons.includes('UNRESOLVED_PURPOSE'));
  assert.equal(partitionMovements([{ ...record, validationStatus: 'confirmed' }]).pending.length, 1);
  assert.equal(sumConfirmedMovements([record], { ...scope, kind: 'withdrawal' }).total, null);
});

test('unapproved distributions stay blocked and never create Control records', () => {
  const store = createMilfiStore();
  const base = { id: 'invented-scenario', period: { year: 2032, month: 5 }, fixedExpense: '1500', createdAt: '2032-05-12T12:00:00Z' };
  for (const income of ['1000', '1500']) {
    const result = store.getState().saveSimulation({ ...base, income });
    assert.equal(result.ok, false);
    assert.equal(result.calculation.status, 'decision_required');
  }
  assert.deepEqual(store.getState().simulations, []);
  assert.deepEqual(store.getState().controlMovements, []);
});

test('malformed records are reported without throwing during batch review', () => {
  for (const record of [null, [], {}, sample({ id: 12 }), sample({ provenance: { type: 12 } })]) {
    assert.doesNotThrow(() => partitionMovements([record]));
    assert.equal(partitionMovements([record]).confirmed.length, 0);
  }
});
