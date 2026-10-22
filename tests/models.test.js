import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidDate, isValidPeriod, partitionMovements, validateEnvelope, validateMovement } from '../src/domain/models.js';
import { prepareSimulation } from '../src/application/simulations.js';

// Synthetic fixtures only. Never copy records from private workbooks here.
function movement(overrides = {}) {
  return {
    id: 'synthetic-movement', schemaVersion: 1, householdId: 'synthetic-household', revision: 1,
    moduleId: 'control-mf', origin: 'real', validationStatus: 'confirmed',
    actorId: null, period: { year: 2030, month: 6 }, kind: 'deposit', purpose: 'savings',
    contributorId: 'fiorella', amount: '25', currency: 'PEN', effectiveDate: null, description: null,
    provenance: { type: 'control-excel', sourceId: 'synthetic-source', sourceFingerprint: 'synthetic-fingerprint',
      importBatchId: 'synthetic-batch', sheet: 'Synthetic', row: 1, original: { amount: '25', date: null } },
    ...overrides,
  };
}

test('periods and dates reject impossible values without guessing date formats', () => {
  assert.equal(isValidPeriod({ year: 2030, month: 12 }), true);
  for (const value of [null, {}, { year: '2030', month: 1 }, { year: 2030, month: 0 }, { year: 2030, month: 13 }]) assert.equal(isValidPeriod(value), false);
  assert.equal(isValidDate('2028-02-29'), true);
  for (const value of ['2030-02-29', '2030-04-31', '31/01/2030', '', null]) assert.equal(isValidDate(value), false);
});

test('confirmed movement preserves contributor separately from recording actor', () => {
  assert.deepEqual(validateMovement(movement({ actorId: 'milton' })), []);
});

test('ambiguous real movement retains original text and stays pending', () => {
  const record = movement({ validationStatus: 'pending', amount: null, currency: null,
    provenance: { ...movement().provenance, original: { amount: '$25+', date: 'unknown' } } });
  const before = structuredClone(record);
  assert.deepEqual(validateMovement(record), []);
  const groups = partitionMovements([record]);
  assert.equal(groups.confirmed.length, 0);
  assert.deepEqual(groups.pending, [record]);
  assert.deepEqual(record, before);
  assert.ok(validateMovement({ ...record, validationStatus: 'confirmed' }).includes('UNRESOLVED_MONEY'));
});

test('Fiorella template and legacy mocks cannot be promoted into real data', () => {
  for (const type of ['fiorella-template', 'legacy-mock', 'manual-simulation']) {
    assert.ok(validateEnvelope(movement({ provenance: { ...movement().provenance, type } })).includes('SOURCE_ORIGIN_MISMATCH'));
  }
});

test('source trace and module must match the original classification', () => {
  assert.ok(validateEnvelope(movement({ moduleId: 'fiorella' })).includes('SOURCE_MODULE_MISMATCH'));
  assert.ok(validateEnvelope(movement({ provenance: { type: 'control-excel', sourceId: 'x' } })).includes('INCOMPLETE_SOURCE_TRACE'));
  assert.ok(validateEnvelope(movement({ provenance: { type: 'toString', sourceId: 'x' } })).includes('INVALID_PROVENANCE'));
});

test('only validated real movements enter the confirmed partition', () => {
  const confirmed = movement();
  const simulated = movement({ id: 'demo', origin: 'simulated', provenance: { type: 'legacy-mock', sourceId: 'synthetic' } });
  const pending = movement({ id: 'pending', validationStatus: 'pending' });
  const rejected = movement({ id: 'rejected', validationStatus: 'rejected' });
  const invalid = movement({ id: 'invalid', amount: '25+' });
  const groups = partitionMovements([confirmed, simulated, pending, rejected, invalid]);
  assert.deepEqual(groups, { confirmed: [confirmed], simulated: [simulated], pending: [pending], rejected: [rejected], invalid: [invalid] });
});

test('confirmed withdrawals require a known date and the savings purpose', () => {
  assert.deepEqual(validateMovement(movement({ kind: 'withdrawal', effectiveDate: '2030-06-03' })), []);
  assert.ok(validateMovement(movement({ kind: 'withdrawal' })).includes('MISSING_WITHDRAWAL_DATE'));
  assert.ok(validateMovement(movement({ kind: 'withdrawal', purpose: 'expenses' })).includes('UNSUPPORTED_WITHDRAWAL_PURPOSE'));
  assert.ok(validateMovement(movement({ currency: '$' })).includes('INVALID_CURRENCY'));
  assert.ok(validateMovement(movement({ amount: '-1' })).includes('INVALID_AMOUNT'));
});

test('unknown historical period stays pending rather than being invented', () => {
  const record = movement({ period: null, validationStatus: 'pending' });
  assert.deepEqual(validateMovement(record), []);
  assert.ok(validateMovement({ ...record, validationStatus: 'confirmed' }).includes('MISSING_CONFIRMED_PERIOD'));
});

test('fractional cents and missing synchronization identity cannot be silently confirmed', () => {
  assert.ok(validateMovement(movement({ amount: '0.001' })).includes('ROUNDING_POLICY_PENDING'));
  assert.deepEqual(validateMovement(movement({ amount: '0.001', validationStatus: 'pending' })), []);
  assert.ok(validateMovement(movement({ householdId: null })).includes('MISSING_CONFIRMED_HOUSEHOLD'));
  assert.ok(validateMovement(movement({ revision: -1 })).includes('INVALID_REVISION'));
  assert.ok(validateMovement(movement({ schemaVersion: 2 })).includes('UNSUPPORTED_SCHEMA_VERSION'));
});

test('preparing a simulation cannot create a real record or imply an authenticated actor', () => {
  const period = { year: 2030, month: 6 };
  const result = prepareSimulation({ id: 'synthetic-simulation', period, income: '4000', fixedExpense: '1500', createdAt: '2030-06-03T12:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.value.origin, 'simulated');
  assert.equal(result.value.validationStatus, 'pending');
  assert.equal(result.value.actorId, null);
  assert.deepEqual(validateEnvelope(result.value), []);
  period.month = 7;
  assert.equal(result.value.period.month, 6);
});

test('unresolved financial cases and invalid periods cannot be saved as successful simulations', () => {
  const base = { id: 'synthetic', period: { year: 2030, month: 6 }, income: '1000', fixedExpense: '1500', createdAt: '2030-06-03T12:00:00Z' };
  assert.equal(prepareSimulation(base).calculation.status, 'decision_required');
  assert.equal(prepareSimulation({ ...base, period: { year: 2030, month: 13 } }).ok, false);
  assert.equal(prepareSimulation({ ...base, createdAt: 'not-a-date' }).ok, false);
});
