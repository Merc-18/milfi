import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase, seedSynthetic } from './helpers/pgHarness.js';
import { createPgRestClient } from './helpers/pgRestClient.js';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { createMilfiStore } from '../src/store/useStore.js';
import { createLedgerStore } from '../src/store/ledgerStore.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { inspectLedger } from '../src/domain/controlLedger.js';

// Stores in persisted mode against the real schema and RLS (PGlite, simulated
// identities, invented data). The UI forms call exactly these store actions.
const db = await createDatabase();
const u = await seedSynthetic(db);
const persistence = user => createMilfiPersistence(createPgRestClient(db, u[user]), { householdId: u.household });
let tick = 0;
const command = (fields, overrides = {}) => ({ period: { year: 2032, month: 4 }, id: crypto.randomUUID(), expectedRevision: 0, eventId: `e${tick++}`,
  occurredAt: new Date(Date.UTC(2032, 3, 1, 0, 0, tick)).toISOString(), ...fields, ...overrides });

test('Fiorella store saves to the database, reloads elsewhere and never reports a failed save as success', async () => {
  const fiorella = createMilfiStore();
  await fiorella.getState().connectRemote(persistence('fiorella'));
  assert.equal(fiorella.getState().remoteStatus, 'ready');
  const saved = await fiorella.getState().saveFiorellaDemo(command({ kind: 'monthly-plan', income: '3000.5', appliedFixedExpense: '1500' }));
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  assert.equal(fiorella.getState().fiorellaDemoRecords[0].origin, 'real');
  assert.ok(fiorella.getState().fiorellaDemoEvents.some(event => event.recordId === saved.value.id && event.action === 'created'));
  const gv = await fiorella.getState().saveFiorellaDemo(command({ kind: 'variable-expense', categoryId: 'salud', effectiveDate: '2032-04-02', description: 'Inventado', amount: '5' }));
  const twin = await fiorella.getState().saveFiorellaDemo(command({ kind: 'variable-expense', categoryId: 'salud', effectiveDate: '2032-04-02', description: 'Inventado', amount: '5' }));
  assert.deepEqual([gv.ok, twin.errors], [true, ['POSSIBLE_DUPLICATE_EXPENSE']]);
  assert.equal((await fiorella.getState().saveFiorellaDemo(command({ kind: 'variable-expense', categoryId: 'salud', effectiveDate: '2032-04-02', description: 'Inventado', amount: '5', allowSimilar: true }))).ok, true);
  // Milton's store reads the same data in another session but cannot write it.
  const milton = createMilfiStore();
  await milton.getState().connectRemote(persistence('milton'));
  const summary = summarizeFiorella(milton.getState().fiorellaDemoRecords, { year: 2032, month: 4 }, 'real');
  assert.deepEqual([summary.monthly.income, summary.categories[0].executed.amount], ['3000.5', '10']);
  const denied = await milton.getState().saveFiorellaDemo(command({ kind: 'monthly-plan', income: '1', appliedFixedExpense: '1' }, { period: { year: 2032, month: 5 } }));
  assert.deepEqual(denied, { ok: false, errors: ['FORBIDDEN'] });
  assert.equal(milton.getState().fiorellaDemoRecords.some(record => record.period.month === 5), false);
  // A stale second device is refused; the first device's value stays.
  const stale = await milton.getState().remote.saveFiorellaRecord({ ...saved.value, income: '9' }, { ...saved.value, revision: 0 });
  assert.equal(stale.ok, false);
  const goal = await fiorella.getState().saveSavingsGoal({ id: crypto.randomUUID(), expectedRevision: 0, title: 'Meta inventada', target: '600', months: '3', occurredAt: new Date().toISOString() });
  assert.deepEqual([goal.ok, fiorella.getState().savingsGoals.length], [true, 1]);
  // Disconnecting (sign-out/expiry) clears every loaded record from memory.
  fiorella.getState().disconnectRemote();
  assert.deepEqual([fiorella.getState().fiorellaDemoRecords, fiorella.getState().fiorellaDemoEvents, fiorella.getState().savingsGoals, fiorella.getState().remote], [[], [], [], null]);
  const again = createMilfiStore();
  await again.getState().connectRemote(persistence('fiorella'));
  assert.equal(again.getState().fiorellaDemoRecords.find(record => record.id === saved.value.id).income, '3000.5');
});

test('ledger store persists Milton movements and reviews; Fiorella reads but cannot write', async () => {
  const milton = createLedgerStore();
  await milton.getState().connect(persistence('milton'), 'milton');
  const draft = { kind: 'withdrawal', effectiveDate: '2032-04-09', period: { year: 2032, month: 4 }, currency: 'USD', amount: '20.10', contributorId: null,
    purpose: 'savings', description: 'Retiro inventado', provenanceNote: 'Referencia sintética', id: crypto.randomUUID(), expectedRevision: 0, operationId: crypto.randomUUID() };
  const saved = await milton.getState().saveEntry(draft);
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  const entry = inspectLedger(milton.getState().records).find(item => item.record.id === draft.id);
  assert.deepEqual([entry.status, entry.record.actorId, entry.record.amount], ['pending', 'milton', '20.1']);
  const reviewed = await milton.getState().review({ id: draft.id, expectedRevision: entry.record.revision, decision: 'accepted', reason: 'Revisión sintética', evidenceReference: 'Ref' });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.errors));
  assert.equal(inspectLedger(milton.getState().records).find(item => item.record.id === draft.id).status, 'reviewed');
  assert.ok(milton.getState().events.some(event => event.recordId === draft.id && event.action === 'create'));
  const fiorella = createLedgerStore();
  await fiorella.getState().connect(persistence('fiorella'), 'fiorella');
  assert.equal(inspectLedger(fiorella.getState().records).find(item => item.record.id === draft.id).status, 'reviewed');
  const denied = await fiorella.getState().saveEntry({ ...draft, id: crypto.randomUUID(), operationId: crypto.randomUUID(), amount: '1' });
  assert.deepEqual(denied.errors, ['FORBIDDEN']);
  fiorella.getState().disconnect();
  assert.deepEqual([fiorella.getState().records, fiorella.getState().persistence], [[], null]);
});
