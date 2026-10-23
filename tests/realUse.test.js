import assert from 'node:assert/strict';
import test from 'node:test';
import { as, createDatabase, seedSynthetic } from './helpers/pgHarness.js';
import { createPgRestClient } from './helpers/pgRestClient.js';
import { syntheticControlXlsx } from './helpers/xlsxBuilder.js';
import { serial, syntheticFiorellaXlsx } from './helpers/fiorellaFixture.js';
import { readXlsxCapture } from '../src/infrastructure/xlsx/workbook.js';
import { recognizeFiorellaWorkbook } from '../src/domain/fiorellaWorkbook.js';
import { prepareFiorellaDemo } from '../src/domain/fiorellaSession.js';
import { readControlWorkbook } from '../src/application/controlPreimport.js';
import { applyControlDecisions, controlLoadPreview, fiorellaLoadPayload, fiorellaLoadPreview } from '../src/application/historicalLoad.js';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { inspectLedger, summarizeLedger } from '../src/domain/controlLedger.js';
import { createMilfiStore } from '../src/store/useStore.js';

const recognize = async (options, cutoff = '2031-02-20') => recognizeFiorellaWorkbook((await readXlsxCapture(syntheticFiorellaXlsx(options))).capture, { cutoff });

test('Fiorella workbook: loads income, applied GF, GF budget/actual, GV and goals without inventing data', async () => {
  const result = await recognize();
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const { plan } = result;
  // Abril has no values: no row. Marzo is after the cutoff month: projected, not income received.
  assert.deepEqual(plan.monthlyPlans.map(row => [row.period_month, row.income, row.applied_fixed_expense, row.plan_status]),
    [[1, '3000', '1200', 'actual'], [2, '3100.1', '1200', 'actual'], [3, '3500', '1300', 'projected']]);
  // 19 subcategories × 2 past months. A blank GF actual stays NULL; no GF actual receives a date.
  assert.equal(plan.fixedBudgets.length, 38);
  const luz = plan.fixedBudgets.find(row => row.period_month === 2 && row.category_id === 'servicios-luz');
  assert.deepEqual([luz.budget_amount, luz.actual_amount, 'effective_date' in luz], ['20', null, false]);
  assert.equal(plan.fixedBudgets.find(row => row.period_month === 1).actual_amount, '12.3');
  // Future template zeros carry no plan: omitted, never loaded as a budget of zero.
  assert.equal(plan.omitted.filter(item => item.code === 'FUTURE_TEMPLATE_ZERO').length, 19);
  assert.deepEqual(plan.variableExpenses.map(row => [row.effective_date, row.category_id, row.subcategory, row.amount, row.notes]),
    [['2031-02-03', 'ocio', 'Antojo', '12.3', 'Nota inventada'], ['2031-02-10', 'salud', 'Farmacia', '20', null]]);
  assert.ok(plan.variableExpenses.every(row => row.provenance.sourceFingerprint === plan.fingerprint && row.source_ref));
  assert.deepEqual(plan.savingsGoals.map(goal => [goal.title, goal.target_amount, goal.months, goal.deadline_label, goal.deadline_year, goal.deadline_month, goal.status, goal.notes]),
    [['Meta inventada', '900', 3, 'Jun 2031', 2031, 6, 'active', 'Notas de prueba']]);
  assert.deepEqual(plan.pending, []);
  assert.ok(plan.checks.length >= 6 && plan.checks.every(check => check.ok), JSON.stringify(plan.checks));
});

test('Fiorella workbook: different rules, doubtful rows and future actuals are never loaded', async () => {
  const rules = await recognize({ configuration: { K3: 0.5 } });
  assert.equal(rules.ok, false);
  assert.equal(rules.errors[0].code, 'RULES_MISMATCH');
  const doubtful = await recognize({ gv: { D10: 'Enero', B11: 3, C11: serial('2031-02-11'), E11: 'Ocio', H11: 'Sin importe' }, gfFutureActual: true });
  assert.equal(doubtful.ok, true);
  assert.deepEqual(doubtful.plan.pending.map(item => item.code).sort(), ['FUTURE_ACTUAL_AMOUNT', 'MISSING_AMOUNT', 'MONTH_LABEL_DATE_MISMATCH']);
  assert.equal(doubtful.plan.variableExpenses.length, 1);
  // The reconciliation detects that the loaded rows no longer match the workbook total.
  assert.equal(doubtful.plan.checks.find(check => check.code === 'GV_TOTAL').ok, false);
  assert.equal(fiorellaLoadPreview(doubtful.plan).blocked, true);
});

test('Fiorella load: atomic RPC for Fiorella only; a repeated load writes nothing; Milton reads it', async () => {
  const db = await createDatabase();
  const u = await seedSynthetic(db);
  const { plan } = await recognize();
  const payload = fiorellaLoadPayload(plan, u.household);
  const call = user => as(db, user, 'select public.import_fiorella_history($1::jsonb) as result', [JSON.stringify(payload)]);
  assert.equal((await call(u.milton)).code, '42501');
  assert.equal((await call(null)).ok, false);
  const loaded = await call(u.fiorella);
  assert.equal(loaded.ok, true, loaded.error);
  assert.deepEqual(loaded.rows[0].result, { monthly_plans: 3, fixed_budgets: 38, variable_expenses: 2, savings_goals: 1 });
  const again = await call(u.fiorella);
  assert.equal(again.code, '23505');
  const count = await db.query('select (select count(*) from public.fiorella_variable_expenses)::int as gv, (select count(*) from public.fiorella_monthly_plans)::int as months');
  assert.deepEqual(count.rows[0], { gv: 2, months: 3 });
  // Read back through the app adapters: projected month, subcategory, notes, goal attributes, provenance.
  const loadedByMilton = await createMilfiPersistence(createPgRestClient(db, u.milton), { householdId: u.household }).loadFiorella();
  assert.equal(loadedByMilton.ok, true);
  const march = loadedByMilton.records.find(record => record.kind === 'monthly-plan' && record.period.month === 3);
  assert.equal(march.planStatus, 'projected');
  const expense = loadedByMilton.records.find(record => record.kind === 'variable-expense' && record.subcategory === 'Antojo');
  assert.deepEqual([expense.amount, expense.notes, expense.provenance.type], ['12.3', 'Nota inventada', 'fiorella-excel']);
  assert.deepEqual([loadedByMilton.goals[0].deadline, loadedByMilton.goals[0].status, loadedByMilton.goals[0].origin], [{ year: 2031, month: 6 }, 'active', 'real']);
  // The preview against stored rows reports the copies and blocks a second load.
  const existing = { monthlyPlans: (await db.query('select period_year, period_month from public.fiorella_monthly_plans')).rows,
    variableExpenses: (await db.query('select source_ref from public.fiorella_variable_expenses')).rows };
  const preview = fiorellaLoadPreview(plan, existing);
  assert.equal(preview.blocked, true);
  assert.ok(preview.conflicts.some(item => item.code === 'GV_ALREADY_LOADED') && preview.conflicts.some(item => item.code === 'MONTH_ALREADY_STORED'));
});

test('Fiorella app entries keep GV subcategory/notes and mark projected months', () => {
  const base = { id: 'x', period: { year: 2031, month: 2 }, expectedRevision: 0, occurredAt: '2031-02-01T00:00:00.000Z', eventId: 'e' };
  const expense = prepareFiorellaDemo({ ...base, kind: 'variable-expense', categoryId: 'ocio', effectiveDate: '2031-02-05', description: 'Inventado', amount: '4', subcategory: ' Antojo ', notes: '' }, [], [], { origin: 'real' });
  assert.deepEqual([expense.value.subcategory, expense.value.notes], ['Antojo', null]);
  assert.deepEqual(prepareFiorellaDemo({ ...base, kind: 'variable-expense', categoryId: 'ocio', effectiveDate: '2031-02-05', description: 'Inventado', amount: '4', notes: 'x'.repeat(501) }).errors, ['INVALID_NOTES']);
  const month = prepareFiorellaDemo({ ...base, kind: 'monthly-plan', income: '10', appliedFixedExpense: '', planStatus: 'projected' }, [], [], { origin: 'real' });
  assert.equal(month.value.planStatus, 'projected');
  assert.deepEqual(prepareFiorellaDemo({ ...base, kind: 'monthly-plan', income: '10', appliedFixedExpense: '', planStatus: 'maybe' }).errors, ['INVALID_PLAN_STATUS']);
});

test('Control load: owner decisions resolve fields with evidence; the rest is loaded pending and visible as such', async () => {
  const read = await readControlWorkbook(syntheticControlXlsx());
  const undecided = applyControlDecisions(read, null, '2031-03-01T12:00:00.000Z');
  assert.equal(undecided.ok, true);
  assert.deepEqual([undecided.counts.prepared, undecided.counts.pendingReview], [0, 8]);
  const decisions = { reviewedBy: 'milton', resolutions: [
    { field: 'currency', value: 'PEN', match: {}, reason: 'Decisión inventada', evidenceReference: 'Acta inventada' },
    { field: 'contributorId', value: 'milton', match: { kind: 'deposit', header: 'Depósito Gastos (Tú)' }, reason: 'Decisión inventada', evidenceReference: 'Acta inventada' },
    { field: 'contributorId', value: 'fiorella', match: { kind: 'deposit', header: 'Depósito Ahorros (Ella)' }, reason: 'Decisión inventada', evidenceReference: 'Acta inventada' },
    { field: 'period', value: 'month-of-date', match: { kind: 'withdrawal' }, reason: 'Decisión inventada', evidenceReference: 'Acta inventada' }] };
  const decided = applyControlDecisions(read, decisions, '2031-03-01T12:00:00.000Z');
  assert.equal(decided.ok, true, JSON.stringify(decided.errors));
  // Zero amount, an unreadable amount, a missing date and identical withdrawals stay pending.
  assert.deepEqual([decided.counts.prepared, decided.counts.pendingReview], [3, 5]);
  assert.ok(decided.pendingReasons.POSSIBLE_DUPLICATE_VALUES === 2 && decided.pendingReasons.ZERO_AMOUNT_POLICY_PENDING === 1);

  const db = await createDatabase();
  const u = await seedSynthetic(db);
  const milton = createMilfiPersistence(createPgRestClient(db, u.milton), { householdId: u.household });
  assert.equal(controlLoadPreview(decided).blocked, false);
  const imported = await milton.importPrepared({ fingerprint: decided.batch.fingerprint, fileName: 'inventado.xlsx', sheets: decided.batch.sheets }, decided.records);
  assert.equal(imported.ok, true, JSON.stringify(imported.errors));
  const stored = await milton.loadControl();
  const entries = inspectLedger(stored.records);
  assert.deepEqual([entries.filter(entry => entry.status === 'imported').length, entries.filter(entry => entry.status === 'pending').length], [3, 5]);
  assert.ok(entries.filter(entry => entry.status === 'pending').every(entry => entry.pendingReasons.length > 0));
  // Prepared imported deposits count in the reviewed summary, per currency/destination/contributor.
  const january = summarizeLedger(entries, { year: 2031, month: 1 });
  assert.deepEqual(january.groups.map(group => [group.kind, group.purpose, group.contributorId, group.total]).sort(), [['deposit', 'expenses', 'milton', '11'], ['deposit', 'savings', 'fiorella', '22.5']]);
  const batches = (await db.query('select source_fingerprint from public.control_import_batches')).rows;
  assert.deepEqual(controlLoadPreview(decided, batches, stored.records).conflicts.map(item => item.code), ['FILE_ALREADY_LOADED', 'SAME_CELLS_FROM_OTHER_FILE']);
});


test('daily use after the load: Fiorella saves new and imported records through the app store; Milton is refused', async () => {
  const db = await createDatabase();
  const u = await seedSynthetic(db);
  const { plan } = await recognize();
  assert.equal((await as(db, u.fiorella, 'select public.import_fiorella_history($1::jsonb)', [JSON.stringify(fiorellaLoadPayload(plan, u.household))])).ok, true);
  const storeFor = async user => {
    const store = createMilfiStore();
    await store.getState().connectRemote(createMilfiPersistence(createPgRestClient(db, u[user]), { householdId: u.household }));
    assert.equal(store.getState().remoteStatus, 'ready');
    return store;
  };
  const fiorella = await storeFor('fiorella');
  const P = { year: 2031, month: 2 };
  const records = () => fiorella.getState().fiorellaDemoRecords;
  const command = (kind, existing, fields) => ({ kind, period: P, id: existing?.id ?? crypto.randomUUID(), expectedRevision: existing?.revision ?? 0,
    eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), ...fields });
  const month = records().find(record => record.kind === 'monthly-plan' && record.period.month === 2);
  let result = await fiorella.getState().saveFiorellaDemo(command('monthly-plan', month, { income: '3200', appliedFixedExpense: '1200', planStatus: 'actual' }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const luz = records().find(record => record.kind === 'fixed-budget' && record.period.month === 2 && record.categoryId === 'servicios-luz');
  result = await fiorella.getState().saveFiorellaDemo(command('fixed-budget', luz, { categoryId: 'servicios-luz', budgetAmount: '20', actualAmount: '18.5' }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  result = await fiorella.getState().saveFiorellaDemo(command('variable-expense', null, { categoryId: 'ocio', effectiveDate: '2031-02-15', description: 'Gasto nuevo inventado', amount: '9.9', subcategory: 'Antojo', notes: '' }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const imported = records().find(record => record.kind === 'variable-expense' && record.provenance?.type === 'fiorella-excel');
  result = await fiorella.getState().saveFiorellaDemo(command('variable-expense', imported, { categoryId: imported.categoryId, effectiveDate: imported.effectiveDate,
    description: `${imported.description} (editado)`, amount: imported.amount, subcategory: imported.subcategory, notes: imported.notes }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const edited = records().find(record => record.id === imported.id);
  assert.deepEqual([edited.revision, edited.provenance.type], [2, 'fiorella-excel']);
  // Milton reads everything but every write is refused by the database.
  const milton = await storeFor('milton');
  assert.equal(milton.getState().fiorellaDemoRecords.length, records().length);
  const refused = await milton.getState().saveFiorellaDemo(command('variable-expense', null, { categoryId: 'ocio', effectiveDate: '2031-02-16', description: 'Intento de Milton', amount: '1' }));
  assert.deepEqual(refused, { ok: false, errors: ['FORBIDDEN'] });
});
