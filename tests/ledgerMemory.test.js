import assert from 'node:assert/strict';
import test from 'node:test';
import { createLedgerStore } from '../src/store/ledgerStore.js';
import { createMilfiStore } from '../src/store/useStore.js';
import { createMemoryControlPersistence } from '../src/application/memoryControlPersistence.js';
import { inspectLedger } from '../src/domain/controlLedger.js';

// Invented values only: the demo runs Control on the real ledger domain, in memory.
const draft = fields => ({ id: crypto.randomUUID(), expectedRevision: 0, operationId: crypto.randomUUID(), kind: 'deposit', effectiveDate: '2031-03-04',
  period: { year: 2031, month: 3 }, currency: 'PEN', amount: '150', contributorId: 'fiorella', purpose: 'savings', planPeriod: { year: 2031, month: 2 },
  description: '', provenanceNote: 'Registrado en MilFi', ...fields });

test('demo ledger: save, review, assign the plan month and keep the change history, all in memory', async () => {
  const store = createLedgerStore();
  await store.getState().connect(createMemoryControlPersistence(), 'milton');
  assert.equal(store.getState().status, 'ready');
  const input = draft();
  assert.equal((await store.getState().saveEntry(input)).ok, true);
  let [entry] = inspectLedger(store.getState().records);
  assert.deepEqual([entry.status, entry.record.revision, entry.record.planPeriod], ['pending', 1, { year: 2031, month: 2 }]);
  assert.equal((await store.getState().review({ id: input.id, expectedRevision: 1, decision: 'accepted', reason: 'Visto', evidenceReference: 'Voucher' })).ok, true);
  [entry] = inspectLedger(store.getState().records);
  assert.equal(entry.status, 'reviewed');
  assert.equal((await store.getState().assignPlan({ id: input.id, expectedRevision: 1, planPeriod: { year: 2031, month: 3 } })).ok, true);
  [entry] = inspectLedger(store.getState().records);
  assert.deepEqual([entry.status, entry.record.planPeriod, entry.record.revision], ['reviewed', { year: 2031, month: 3 }, 2]);
  assert.deepEqual(store.getState().events.map(event => event.action), ['edit', 'create']);
  assert.deepEqual((await store.getState().assignPlan({ id: input.id, expectedRevision: 1, planPeriod: null })).errors, ['STALE_REVISION']);
  // Another demo store (a reload) starts empty.
  const fresh = createLedgerStore();
  await fresh.getState().connect(createMemoryControlPersistence(), 'milton');
  assert.deepEqual(fresh.getState().records, []);
});

test('demo goals: an own goal is deleted, a workbook goal never', async () => {
  const store = createMilfiStore();
  const saved = store.getState().saveSavingsGoal({ id: 'goal-1', expectedRevision: 0, title: 'Meta inventada', target: '600', months: '3', occurredAt: '2031-01-01T00:00:00.000Z' });
  assert.equal(saved.ok, true);
  store.setState(state => ({ savingsGoals: [...state.savingsGoals, { ...saved.value, id: 'excel-1', origin: 'real' }] }));
  assert.deepEqual(await store.getState().deleteSavingsGoal({ id: 'excel-1' }), { ok: false, errors: ['WORKBOOK_GOAL'] });
  assert.deepEqual(await store.getState().deleteSavingsGoal({ id: 'goal-1' }), { ok: true });
  assert.deepEqual(store.getState().savingsGoals.map(goal => goal.id), ['excel-1']);
  assert.deepEqual(await store.getState().deleteSavingsGoal({ id: 'goal-1' }), { ok: false, errors: ['NOT_FOUND_OR_FORBIDDEN'] });
});
