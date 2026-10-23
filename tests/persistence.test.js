import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase, seedSynthetic } from './helpers/pgHarness.js';
import { createPgRestClient } from './helpers/pgRestClient.js';
import { syntheticControlXlsx } from './helpers/xlsxBuilder.js';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { prepareFieldResolution, preparePreimportDecision, readControlWorkbook } from '../src/application/controlPreimport.js';
import { prepareFiorellaDemo, summarizeFiorella, fiorellaHistory } from '../src/domain/fiorellaSession.js';
import { inspectLedger, prepareControlEntry, prepareControlEntryReview, summarizeLedger } from '../src/domain/controlLedger.js';
import { inspectPreimport } from '../src/domain/controlPreimport.js';

// Persistence service against the real schema and RLS (PGlite, SIMULATED identities),
// with invented data only. Each "session" is a separate client for the same user.
const db = await createDatabase();
const u = await seedSynthetic(db);
const session = user => createMilfiPersistence(createPgRestClient(db, u[user]), { householdId: u.household });
let tick = 0;
const at = () => new Date(Date.UTC(2031, 0, 1, 0, 0, tick++)).toISOString();
const P = { year: 2031, month: 1 };
const command = (overrides = {}) => ({ period: P, expectedRevision: 0, eventId: `e-${tick}`, occurredAt: at(), id: crypto.randomUUID(), ...overrides });
async function saveFiorella(persistence, records, input) {
  const prepared = prepareFiorellaDemo(input, records, [], { origin: 'real' });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  return persistence.saveFiorellaRecord(prepared.value, records.find(record => record.id === prepared.value.id) ?? null);
}

test('Fiorella records persist, reload in another session and keep exact amounts and revisions', async () => {
  const fiorella = session('fiorella');
  const plan = await saveFiorella(fiorella, [], command({ kind: 'monthly-plan', income: '4000.015', appliedFixedExpense: '1500' }));
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.deepEqual([plan.value.revision, plan.value.income, plan.value.origin], [1, '4000.015', 'real']);
  const budget = await saveFiorella(fiorella, [plan.value], command({ kind: 'fixed-budget', categoryId: 'servicios-luz', budgetAmount: '80.5', actualAmount: '' }));
  const expense = await saveFiorella(fiorella, [plan.value], command({ kind: 'variable-expense', categoryId: 'ocio', effectiveDate: '2031-01-20', description: 'Gasto inventado', amount: '12.345' }));
  assert.equal(budget.ok && expense.ok, true);
  // A different session (new client) and a different user both read the saved data.
  for (const reader of [session('fiorella'), session('milton')]) {
    const loaded = await reader.loadFiorella();
    assert.equal(loaded.ok, true);
    const summary = summarizeFiorella(loaded.records, P, 'real');
    assert.equal(summary.monthly.income, '4000.015');
    assert.equal(summary.budget.amount, '80.5');
    assert.equal(summary.categories.find(category => category.id === 'ocio').executed.amount, '12.345');
    assert.equal(summary.calculation.status, 'calculated');
  }
  const records = (await session('fiorella').loadFiorella()).records;
  const updated = await saveFiorella(fiorella, records, command({ kind: 'monthly-plan', id: plan.value.id, expectedRevision: 1, income: '4100', appliedFixedExpense: '1500' }));
  assert.deepEqual([updated.ok, updated.value.revision, updated.value.income], [true, 2, '4100']);
  // A second device still holding revision 1 cannot overwrite revision 2.
  const stale = await fiorella.saveFiorellaRecord({ ...plan.value, income: '1' }, plan.value);
  assert.deepEqual(stale, { ok: false, errors: ['STALE_REVISION'] });
  const duplicate = await fiorella.saveFiorellaRecord({ ...plan.value, id: crypto.randomUUID() }, null);
  assert.deepEqual(duplicate, { ok: false, errors: ['DUPLICATE'] });
  const history = await session('milton').loadFiorellaHistory();
  assert.equal(history.ok, true);
  const planEvents = history.events.filter(event => event.recordId === plan.value.id);
  assert.deepEqual(planEvents.map(event => [event.action, event.revision, event.actorId]), [['created', 1, u.fiorella], ['updated', 2, u.fiorella]]);
  assert.deepEqual([planEvents[1].before.income, planEvents[1].after.income], ['4000.015', '4100']);
  const grouped = fiorellaHistory((await session('milton').loadFiorella()).records, history.events, [], 'real');
  assert.equal(grouped.find(group => group.key === '2031-01').events.length >= 4, true);
});

test('Fiorella data cannot be written by Milton, a third party or another household; failures are errors', async () => {
  const input = command({ kind: 'monthly-plan', period: { year: 2031, month: 6 }, income: '10', appliedFixedExpense: '5' });
  for (const user of ['milton', 'outsider', 'otherOwner']) {
    const result = await saveFiorella(session(user), [], { ...input, id: crypto.randomUUID() });
    assert.deepEqual(result, { ok: false, errors: ['FORBIDDEN'] }, user);
    if (user !== 'milton') assert.deepEqual((await session(user).loadFiorella()).records, [], user);
  }
  // Bypassing the domain does not bypass the database: the GF cap still holds.
  const invalid = await session('fiorella').saveFiorellaRecord({ ...prepareFiorellaDemo(input, [], [], { origin: 'real' }).value, appliedFixedExpense: '1500.01' }, null);
  assert.deepEqual(invalid, { ok: false, errors: ['CONSTRAINT_VIOLATION'] });
});

test('savings goals persist as hypothetical plans readable by both, writable only by Fiorella', async () => {
  const goal = { id: crypto.randomUUID(), kind: 'savings-goal', title: 'Meta inventada', target: '1234.56', months: '6', revision: 0 };
  const saved = await session('fiorella').saveFiorellaRecord(goal, null);
  assert.deepEqual([saved.ok, saved.value.origin, saved.value.target], [true, 'simulated', '1234.56']);
  assert.equal((await session('milton').loadFiorella()).goals.some(item => item.id === goal.id), true);
  assert.deepEqual(await session('milton').saveFiorellaRecord({ ...goal, id: crypto.randomUUID() }, null), { ok: false, errors: ['FORBIDDEN'] });
});

test('Control manual movements persist with reviews that expire on edit; Fiorella only reads', async () => {
  const milton = session('milton');
  const entry = input => prepareControlEntry({ id: crypto.randomUUID(), householdId: u.household, expectedRevision: 0, operationId: crypto.randomUUID(),
    kind: 'deposit', effectiveDate: '2031-02-10', period: { year: 2031, month: 2 }, currency: 'PEN', amount: '50.05', contributorId: 'fiorella',
    purpose: 'savings', planPeriod: { year: 2031, month: 1 }, description: 'Movimiento inventado', provenanceNote: 'Referencia sintética', actorId: 'milton', ...input }, []);
  // A new savings deposit names its Fiorella plan month; it is never inferred.
  assert.deepEqual(entry({ planPeriod: null }).errors, ['MISSING_PLAN_PERIOD']);
  const prepared = entry();
  const saved = await milton.saveControlEntry(prepared.value, null);
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  assert.deepEqual([saved.value.origin, saved.value.validationStatus, saved.value.amount, saved.value.revision], ['real', 'pending', '50.05', 1]);
  assert.deepEqual(saved.value.planPeriod, { year: 2031, month: 1 }, 'the plan month round-trips through plan_year/plan_month');
  assert.deepEqual(await session('fiorella').saveControlEntry(entry().value, null), { ok: false, errors: ['FORBIDDEN'] });
  let records = (await session('fiorella').loadControl()).records;
  assert.equal(records.length, 1);
  const review = prepareControlEntryReview({ id: saved.value.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton', reason: 'Revisión sintética', evidenceReference: 'Ref' }, records);
  const reviewed = await milton.addControlReview(review.record, records[0], review.review, review.changed);
  assert.equal(reviewed.ok, true);
  records = (await session('fiorella').loadControl()).records;
  assert.equal(inspectLedger(records)[0].status, 'reviewed');
  assert.deepEqual(summarizeLedger(inspectLedger(records), { year: 2031, month: 2 }).groups, [{ currency: 'PEN', kind: 'deposit', purpose: 'savings', contributorId: 'fiorella', total: '50.05', count: 1 }]);
  // Fiorella cannot add reviews; an edit by Milton makes the earlier review stale.
  const forged = await session('fiorella').addControlReview(review.record, records[0], review.review, false);
  assert.deepEqual(forged.errors, ['FORBIDDEN']);
  const edit = prepareControlEntry({ id: saved.value.id, householdId: u.household, expectedRevision: 1, kind: 'deposit', effectiveDate: '2031-02-10', period: { year: 2031, month: 2 },
    currency: 'PEN', amount: '50.06', contributorId: 'fiorella', purpose: 'savings', description: 'Movimiento inventado', provenanceNote: 'Referencia sintética', actorId: 'milton' }, records);
  assert.equal((await milton.saveControlEntry(edit.value, records[0])).ok, true);
  const after = inspectLedger((await milton.loadControl()).records)[0];
  assert.deepEqual([after.status, after.staleReviews, after.record.amount], ['pending', 1, '50.06']);
  // Identical values need an explicit reason before they are stored as a distinct operation.
  const again = prepareControlEntry({ id: crypto.randomUUID(), householdId: u.household, expectedRevision: 0, operationId: crypto.randomUUID(), kind: 'deposit',
    effectiveDate: '2031-02-10', period: { year: 2031, month: 2 }, currency: 'PEN', amount: '50.06', contributorId: 'fiorella', purpose: 'savings',
    planPeriod: { year: 2031, month: 2 }, description: 'Otro', provenanceNote: 'Ref', actorId: 'milton' }, (await milton.loadControl()).records);
  assert.deepEqual(again.errors, ['POSSIBLE_DUPLICATE_REQUIRES_REVIEW']);
  const history = await session('fiorella').loadControlHistory();
  assert.deepEqual(history.events.filter(event => event.recordId === saved.value.id).map(event => event.action), ['create', 'edit']);
});

test('prepared Excel movements are imported atomically once, by Milton only, keeping provenance and decisions', async () => {
  const read = await readControlWorkbook(syntheticControlXlsx());
  const context = { workbooks: new Map([[read.batch.fingerprint, read.workbook]]) };
  let records = read.records;
  const apply = (refs, field, value) => {
    const result = prepareFieldResolution({ recordIds: records.filter(record => refs.includes(record.provenance.operation.amountRef)).map(record => record.id), field, value,
      reviewedBy: 'milton', reason: 'Revisión sintética', evidenceReference: 'Ref', reviewId: `r${tick}`, occurredAt: at() }, records, context);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const updated = new Map(result.value.map(record => [record.id, record]));
    records = records.map(record => updated.get(record.id) ?? record);
  };
  apply(['C5', 'C6'], 'currency', 'PEN');
  apply(['C5', 'C6'], 'contributorId', 'milton');
  for (const ref of ['C5', 'C6']) {
    const record = records.find(item => item.provenance.operation.amountRef === ref);
    const decision = preparePreimportDecision({ recordId: record.id, decision: 'prepared', reviewedBy: 'milton', reason: 'Sintético', evidenceReference: 'Ref', reviewId: `d${ref}`, occurredAt: at() }, records, context);
    records = records.map(item => item.id === record.id ? decision.value : item);
  }
  const prepared = inspectPreimport(records, context).filter(entry => entry.status === 'prepared').map(entry => entry.record);
  assert.equal(prepared.length, 2);
  const batch = { ...read.batch, fileName: 'sintetico.xlsx' };
  assert.deepEqual(await session('fiorella').importPrepared(batch, prepared), { ok: false, errors: ['FORBIDDEN'] });
  const before = (await session('milton').loadControl()).records.length;
  const imported = await session('milton').importPrepared(batch, prepared);
  assert.equal(imported.ok, true, JSON.stringify(imported.errors));
  assert.equal(imported.value.movementIds.length, 2);
  // Same file again: rejected as a whole, nothing partially inserted.
  assert.deepEqual(await session('milton').importPrepared(batch, prepared), { ok: false, errors: ['DUPLICATE'] });
  const loaded = (await session('fiorella').loadControl()).records;
  assert.equal(loaded.length, before + 2);
  const ledger = inspectLedger(loaded).filter(entry => entry.status === 'imported');
  assert.equal(ledger.length, 2);
  const stored = ledger.find(entry => entry.record.provenance.operation.amountRef === 'C5').record;
  assert.deepEqual([stored.amount, stored.currency, stored.contributorId, stored.validationStatus, stored.origin], ['11', 'PEN', 'milton', 'pending', 'real']);
  assert.deepEqual(stored.provenance, prepared.find(record => record.provenance.operation.amountRef === 'C5').provenance);
  assert.equal(stored.evidenceReviews.length, 2);
  assert.equal(stored.preimportDecisions.at(-1).decision, 'prepared');
});
