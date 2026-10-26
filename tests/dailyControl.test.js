import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStamp, readableBuild } from '../src/presentation/buildStamp.js';
import { contributionParts, prepareContributionCommitment, validContribution } from '../src/domain/controlContributions.js';
import { inspectLedger, prepareControlEntry, prepareControlEntryReview, prepareControlPlanAssignment } from '../src/domain/controlLedger.js';
import { contributionHistory, personContributions, reviewTasks, savingsBalance, monthlyRows } from '../src/presentation/controlLedgerView.js';
import { currencyOriginWarning } from '../src/presentation/control.js';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { createDatabase, seedSynthetic, as } from './helpers/pgHarness.js';
import { createPgRestClient } from './helpers/pgRestClient.js';
import { createLedgerStore } from '../src/store/ledgerStore.js';
import { createMemoryControlPersistence } from '../src/application/memoryControlPersistence.js';

// Only invented transfers, agreements and build inputs.
const period = { year: 2031, month: 10 };
const plan = { year: 2031, month: 9 };
const split = (regular, extra) => ({ version: 1, regular, extra });
const draft = fields => ({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), householdId: 'synthetic', actorId: 'milton', expectedRevision: 0,
  kind: 'deposit', purpose: 'savings', period, planPeriod: null, effectiveDate: '2031-10-12', currency: 'PEN', amount: '100',
  contributorId: 'milton', description: '', provenanceNote: 'Inventado', ...fields });
function saved(fields = {}, reviewed = true) {
  const result = prepareControlEntry(draft(fields), []);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const record = { ...result.value, revision: 1 };
  if (!reviewed) return record;
  const review = prepareControlEntryReview({ id: record.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton', reason: 'Prueba',
    evidenceReference: 'Inventado' }, [record]);
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  return { ...record, manualReviews: [{ ...review.review, id: crypto.randomUUID(), reviewedBy: 'milton', reviewedAt: '2031-10-15T12:00:00.000Z',
    evidenceReference: 'Inventado' }] };
}

test('daily version: readable build is fixed, in Peru, and varies only with compilation metadata', () => {
  const stamp = buildStamp(new Date('2026-10-23T19:41:03Z'));
  assert.equal(stamp, '23102026144103');
  assert.deepEqual(readableBuild(stamp), { label: '23/10/2026 · 14:41', short: '23/10/2026 14:41', dateTime: '2026-10-23T14:41:03-05:00' });
  assert.equal(readableBuild(stamp).label, readableBuild(stamp).label);
  assert.notDeepEqual(readableBuild(stamp), readableBuild(buildStamp(new Date('2026-10-24T03:00:00Z'))));
  assert.equal(readableBuild('31022026144103'), null);
  assert.equal(readableBuild(''), null);
});

test('daily contributions: exact structured split validates one transfer and rejects coercions or mismatched sums', () => {
  assert.equal(validContribution(split('600', '100'), '700'), true);
  assert.equal(validContribution(split('600.01', '100.02'), '700.03'), true);
  for (const parts of [split('600', '100'), split('-1', '701'), split('NaN', '0'), split(600, '100'), { regular: '600', extra: '100' }]) {
    assert.equal(validContribution(parts, '800'), false);
  }
  assert.deepEqual(prepareControlEntry(draft({ amount: '700', contribution: split('600', '101') })).errors, ['INVALID_CONTRIBUTION_SPLIT']);
});

test('daily contributions: two independent transfers remain two and combined transfer remains exactly one', () => {
  const independent = inspectLedger([saved({ amount: '600', contribution: split('600', '0') }), saved({ amount: '100', contribution: split('0', '100') })]);
  const combined = inspectLedger([saved({ amount: '700', contribution: split('600', '100') })]);
  assert.equal(independent.length, 2); assert.equal(combined.length, 1);
  for (const entries of [independent, combined]) {
    assert.equal(savingsBalance(entries).deposits, '700');
    assert.deepEqual(contributionHistory(entries).map(group => [group.total, group.regular, group.extra]), [['700', '600', '100']]);
  }
});

test('daily contributions: extras in PEN/USD count only after review, expenses are not savings, withdrawal counted once', () => {
  const records = [saved({ amount: '100', contribution: split('0', '100') }), saved({ amount: '20', currency: 'USD', contribution: split('0', '20') }),
    saved({ amount: '50', purpose: 'expenses', contribution: split('0', '50') }), saved({ amount: '10', kind: 'withdrawal', contributorId: null }),
    saved({ amount: '999', contribution: split('0', '999') }, false)];
  const entries = inspectLedger(records);
  assert.equal(savingsBalance(entries).amount, '90'); assert.equal(savingsBalance(entries, 'USD').amount, '20');
  assert.equal(contributionHistory(entries).find(group => group.purpose === 'expenses').total, '50');
  assert.equal(reviewTasks(entries).toConfirm.length, 1);
});

test('daily contributions: historical deposits stay unclassified; changing split invalidates review, changing only plan does not', () => {
  const old = saved(); const original = structuredClone(old);
  assert.equal(contributionParts(old).kind, 'unclassified');
  const input = { ...draft({ id: old.id, expectedRevision: 1, contribution: split('60', '40') }), operationId: undefined };
  const edit = prepareControlEntry(input, [old]);
  assert.equal(edit.ok, true);
  assert.equal(inspectLedger([edit.value])[0].status, 'pending');
  assert.equal(edit.value.manualReviews.length, 1);
  const allocated = prepareControlPlanAssignment({ id: old.id, expectedRevision: 1, planPeriod: plan }, [old]);
  assert.equal(inspectLedger([allocated.value])[0].status, 'reviewed');
  assert.deepEqual(old, original);
});

test('daily contributions: explicit plan is optional, dates stay actual and extras cannot cover a plan automatically', () => {
  const record = saved({ contribution: split('0', '100') });
  const before = structuredClone(record);
  const row = monthlyRows(inspectLedger([record]), new Map([['2031-09', { amount: '100' }]])).find(item => item.key === '2031-10');
  assert.equal(row.covered, null); assert.equal(row.light.word, 'Pendiente');
  assert.deepEqual([record.period, record.planPeriod, record.effectiveDate], [period, null, '2031-10-12']);
  assert.deepEqual(record, before);
});

test('daily contributions: both people and both currencies are represented, including empty currency and unknown pending', () => {
  const entries = inspectLedger([saved({ contributorId: 'fiorella', amount: '700', contribution: split('600', '100') }),
    saved({ amount: '50', currency: null }, false)]);
  const people = personContributions(entries, period);
  assert.deepEqual(people.map(person => person.contributorId), ['milton', 'fiorella']);
  assert.deepEqual(people[0].currencies.map(item => item.currency), ['PEN', 'USD']);
  assert.ok(people[1].currencies[1].destinations.every(dest => dest.total === null));
  assert.equal(people[0].unknownCurrencyPending, 1);
  assert.equal(people[1].currencies[0].destinations.find(dest => dest.purpose === 'savings').extra, '100');
});

test('daily agreements: confirmation is required, one explicit period only, never inferred from extra deposits', async () => {
  const store = createLedgerStore(); await store.getState().connect(createMemoryControlPersistence(), 'milton');
  const agreement = { id: crypto.randomUUID(), confirmed: true, contributorId: 'milton', period, purpose: 'expenses', currency: 'PEN',
    amount: '600', note: '' };
  assert.equal(prepareContributionCommitment({ ...agreement, confirmed: false }).ok, false);
  assert.equal((await store.getState().saveCommitment(agreement)).ok, true);
  assert.equal(store.getState().records.length, 0);
  assert.equal((await store.getState().saveCommitment({ ...agreement, id: crypto.randomUUID(), amount: '700' })).ok, false);
  assert.equal(store.getState().commitments[0].amount, '600');
  await store.getState().saveEntry({ ...draft({ amount: '100', purpose: 'expenses', contribution: split('0', '100') }) });
  assert.equal(store.getState().commitments[0].amount, '600');
  const future = personContributions(inspectLedger(store.getState().records), { year: 2031, month: 11 }, store.getState().commitments);
  assert.ok(future.every(person => person.currencies.every(currency => currency.destinations.every(dest => dest.commitment === null))));
});

test('daily provenance: a historical dollar symbol with PEN is documented without automatic currency rewrite', () => {
  const record = { currency: 'PEN', provenance: { type: 'control-excel', original: { amount: '$12' } } };
  const original = structuredClone(record);
  assert.match(currencyOriginWarning(record), /confirma la moneda/);
  assert.deepEqual(record, original);
});

test('daily database: split round-trips through audited provenance; explicit immutable commitments obey Control RLS', async () => {
  const db = await createDatabase();
  try {
    const u = await seedSynthetic(db);
    const persistence = who => createMilfiPersistence(createPgRestClient(db, u[who]), { householdId: u.household });
    const milton = persistence('milton');
    const prepared = prepareControlEntry(draft({ householdId: u.household, amount: '700', contribution: split('600', '100'), planPeriod: plan }));
    const result = await milton.saveControlEntry(prepared.value, null);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const review = prepareControlEntryReview({ id: result.value.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton',
      reason: 'Prueba', evidenceReference: 'Inventado' }, [result.value]);
    assert.equal((await milton.addControlReview(review.record, result.value, review.review, false)).ok, true);
    const loaded = await persistence('fiorella').loadControl();
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.records[0].provenance.contribution, split('600', '100'));
    assert.equal(savingsBalance(inspectLedger(loaded.records)).amount, '700');
    assert.deepEqual([loaded.records[0].period, loaded.records[0].planPeriod, loaded.records[0].effectiveDate], [period, plan, '2031-10-12']);
    const invalid = { ...prepared.value, id: crypto.randomUUID(),
      provenance: { ...prepared.value.provenance, operationId: crypto.randomUUID(), contribution: split('600', '101') } };
    assert.equal((await milton.saveControlEntry(invalid, null)).ok, false);
    const commitment = prepareContributionCommitment({ id: crypto.randomUUID(), confirmed: true, contributorId: 'fiorella', period,
      purpose: 'savings', currency: 'USD', amount: '100', note: 'Acuerdo inventado' }).value;
    for (const who of ['fiorella', 'outsider', 'otherOwner']) assert.equal((await persistence(who).saveContributionCommitment(commitment)).ok, false, who);
    assert.equal((await milton.saveContributionCommitment(commitment)).ok, true);
    assert.equal((await persistence('milton').saveContributionCommitment({ ...commitment, id: crypto.randomUUID(), amount: '200' })).ok, false);
    const after = await persistence('fiorella').loadControl();
    assert.equal(after.commitments[0].amount, '100');
    assert.equal(after.records.length, 1, 'an agreement does not create a deposit');
    assert.equal((await as(db, u.milton, "update public.control_contribution_commitments set amount = 1")).ok, false);
    assert.equal((await as(db, null, 'select * from public.control_contribution_commitments')).ok, false);
    assert.ok((await db.query("select id from public.audit_events where table_name = 'control_contribution_commitments'")).rows.length > 0);
    const auditBefore = (await milton.loadControlHistory()).events.length;
    personContributions(inspectLedger(after.records), period, after.commitments);
    assert.equal((await persistence('milton').loadControlHistory()).events.length, auditBefore);
    assert.deepEqual((await persistence('milton').loadControl()).records, after.records);
  } finally { await db.close(); }
});

test('daily compatibility: before optional migration, existing ledger loads and JSON classification still persists', async () => {
  const db = await createDatabase();
  try {
    const u = await seedSynthetic(db);
    await db.exec('drop table public.control_contribution_commitments; alter table public.control_movements drop constraint control_contribution_split');
    const persistence = createMilfiPersistence(createPgRestClient(db, u.milton), { householdId: u.household });
    const prepared = prepareControlEntry(draft({ householdId: u.household, amount: '700', contribution: split('600', '100') }));
    assert.equal((await persistence.saveControlEntry(prepared.value, null)).ok, true);
    const loaded = await persistence.loadControl();
    assert.equal(loaded.ok, true); assert.equal(loaded.commitmentsAvailable, false);
    assert.deepEqual(loaded.records[0].provenance.contribution, split('600', '100'));
  } finally { await db.close(); }
});
