import assert from 'node:assert/strict';
import test from 'node:test';
import { as, createDatabase, seedSynthetic } from './helpers/pgHarness.js';
import { syntheticControlXlsx } from './helpers/xlsxBuilder.js';
import { prepareFieldResolution, readControlWorkbook } from '../src/application/controlPreimport.js';
import { COLUMNS, controlMovementFromRow, controlMovementToRow, controlReviewsToRows, createRepository, fixedBudgetFromRow, fixedBudgetToRow,
  monthlyPlanFromRow, monthlyPlanToRow, persistenceErrorCode, savingsGoalFromRow, savingsGoalToRow, variableExpenseFromRow, variableExpenseToRow } from '../src/infrastructure/supabase/repositories.js';

// Mappers checked against the real schema (PGlite, simulated identities) with
// invented records; the forms are not wired to persistence until Phase 4.2.
const db = await createDatabase();
const u = await seedSynthetic(db);
const insertRow = (user, table, row) => {
  const keys = Object.keys(row);
  const values = keys.map(key => row[key] !== null && typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key]);
  return as(db, user, `insert into public.${table} (${keys.join(', ')}) values (${keys.map((_, index) => `$${index + 1}`).join(', ')}) returning ${COLUMNS[table]}`, values);
};
const facts = record => ({ kind: record.kind, purpose: record.purpose, contributorId: record.contributorId, currency: record.currency, amount: record.amount,
  effectiveDate: record.effectiveDate, period: record.period, description: record.description, origin: record.origin, validationStatus: record.validationStatus });

test('control movements from the local reader round-trip exactly through the schema, keeping provenance and reviews', async () => {
  const read = await readControlWorkbook(syntheticControlXlsx());
  const context = { workbooks: new Map([[read.batch.fingerprint, read.workbook]]) };
  const target = read.records.find(record => record.provenance.operation.amountRef === 'D5');
  const resolved = prepareFieldResolution({ recordIds: [target.id], field: 'currency', value: 'USD', reviewedBy: 'milton', reason: 'Revisión sintética',
    evidenceReference: 'Referencia sintética', reviewId: 'r', occurredAt: '2031-06-01T00:00:00.000Z' }, read.records, context).value[0];
  const inserted = await insertRow(u.milton, 'control_movements', controlMovementToRow(resolved, u.household));
  assert.equal(inserted.ok, true, inserted.error);
  const row = inserted.rows[0];
  assert.equal(row.amount, '22.5');
  for (const review of controlReviewsToRows(resolved, u.household, row.id)) assert.equal((await insertRow(u.milton, 'control_movement_reviews', review)).ok, true);
  const reviews = (await as(db, u.fiorella, `select ${COLUMNS.control_movement_reviews} from public.control_movement_reviews where movement_id = $1`, [row.id])).rows;
  const restored = controlMovementFromRow(row, reviews);
  assert.deepEqual(facts(restored), facts(resolved));
  assert.deepEqual(restored.provenance, resolved.provenance);
  assert.deepEqual(restored.evidenceReviews.map(review => [review.field, review.binding, review.reviewedBy]), resolved.evidenceReviews.map(review => [review.field, review.binding, u.milton]));
  // The same physical Excel operation cannot be stored twice.
  const duplicate = await insertRow(u.milton, 'control_movements', controlMovementToRow({ ...resolved, id: 'otra' }, u.household));
  assert.equal(persistenceErrorCode({ code: duplicate.code }), 'DUPLICATE');
  assert.equal(persistenceErrorCode({ code: (await insertRow(u.fiorella, 'control_movements', controlMovementToRow(read.records[0], u.household))).code }), 'FORBIDDEN');
});

test('Fiorella records map to their tables and back without losing decimals', async () => {
  const cases = [
    ['fiorella_monthly_plans', monthlyPlanToRow, monthlyPlanFromRow, { period: { year: 2032, month: 3 }, income: '4000.0000001', appliedFixedExpense: '1500' }],
    ['fiorella_fixed_budgets', fixedBudgetToRow, fixedBudgetFromRow, { period: { year: 2032, month: 3 }, categoryId: 'bienestar-gym', budgetAmount: '80.25', actualAmount: null }],
    ['fiorella_variable_expenses', variableExpenseToRow, variableExpenseFromRow, { period: { year: 2032, month: 3 }, categoryId: 'ocio', effectiveDate: '2032-03-31', description: 'Gasto inventado', amount: '0.015' }],
    ['fiorella_savings_goals', savingsGoalToRow, savingsGoalFromRow, { title: 'Meta inventada', target: '1234.5', months: '7' }],
  ];
  for (const [table, toRow, fromRow, record] of cases) {
    const inserted = await insertRow(u.fiorella, table, toRow(record, u.household));
    assert.equal(inserted.ok, true, `${table}: ${inserted.error}`);
    const restored = fromRow(inserted.rows[0]);
    for (const [key, value] of Object.entries(record)) assert.deepEqual(restored[key], value, `${table}.${key}`);
    assert.equal(restored.revision, 1);
    assert.equal(persistenceErrorCode({ code: (await insertRow(u.milton, table, toRow(record, u.household))).code }), 'FORBIDDEN');
  }
});

test('repositories select amounts as text and refuse to overwrite a newer revision', async () => {
  for (const [table, columns] of Object.entries(COLUMNS)) {
    for (const money of ['income', 'applied_fixed_expense', 'budget_amount', 'actual_amount', 'amount', 'target_amount']) {
      if (new RegExp(`\\b${money}\\b`).test(columns)) assert.match(columns, new RegExp(`\\b${money}::text`), `${table}.${money}`);
    }
  }
  const calls = [];
  const fake = ({ updated = [], current = null, error = null }) => ({ from: table => {
    const state = { table, filters: [] };
    const builder = {
      update(values) { state.update = values; return builder; }, select(columns) { state.columns = columns; return builder; },
      eq(column, value) { state.filters.push([column, value]); return builder; }, delete() { state.delete = true; return builder; },
      maybeSingle: async () => ({ data: current, error: null }),
      then: resolve => resolve(state.update ? { data: updated, error } : { data: current ? [current] : [], error }),
    };
    calls.push(state);
    return builder;
  } });
  const stale = await createRepository(fake({ current: { id: 'x', revision: 3 } }), 'control_movements').update('x', 2, { amount: '1' });
  assert.deepEqual(stale, { ok: false, code: 'STALE_REVISION' });
  assert.deepEqual(calls[0].update, { amount: '1', revision: 3 });
  assert.deepEqual(calls[0].filters, [['id', 'x'], ['revision', 2]]);
  assert.deepEqual(await createRepository(fake({}), 'control_movements').update('x', 2, {}), { ok: false, code: 'NOT_FOUND_OR_FORBIDDEN' });
  assert.deepEqual(await createRepository(fake({ error: { code: '42501', message: 'contains data' } }), 'control_movements').update('x', 2, {}), { ok: false, code: 'FORBIDDEN' });
  assert.equal((await createRepository(fake({ updated: [{ id: 'x', revision: 3 }] }), 'fiorella_monthly_plans').update('x', 2, { income: '5' })).ok, true);
  assert.throws(() => createRepository(fake({}), 'profiles'));
});
