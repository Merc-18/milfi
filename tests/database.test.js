import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { as, createDatabase, migrationFiles, seedSynthetic } from './helpers/pgHarness.js';
import { FIXED_SUBCATEGORIES } from '../src/domain/fiorellaCategories.js';
import { FINANCIAL_RULES } from '../src/domain/financialRules.js';

// Real PostgreSQL (PGlite, in memory) with SIMULATED Supabase authentication:
// requests run as the non-privileged roles anon/authenticated with JWT claims.
// The definitive verification must be repeated on the real Supabase project.
const db = await createDatabase();
const u = await seedSynthetic(db);
const hex = character => character.repeat(64);
let month = 0;
const nextPeriod = () => { month += 1; return { year: 2030 + Math.floor((month - 1) / 12), month: ((month - 1) % 12) + 1 }; };

const FIORELLA_TABLES = {
  fiorella_monthly_plans: period => ['(household_id, period_year, period_month, income, applied_fixed_expense) values ($1, $2, $3, \'10\', \'5\')', [period.year, period.month]],
  fiorella_fixed_budgets: period => ['(household_id, period_year, period_month, category_id, budget_amount) values ($1, $2, $3, \'servicios-gas\', \'4\')', [period.year, period.month]],
  fiorella_variable_expenses: period => ['(household_id, period_year, period_month, category_id, effective_date, description, amount) values ($1, $2, $3, \'salud\', $4::date, \'Gasto sintético\', \'2\')',
    [period.year, period.month, `${period.year}-${String(period.month).padStart(2, '0')}-10`]],
  fiorella_savings_goals: () => ['(household_id, title, target_amount, months) values ($1, \'Meta sintética\', \'100\', 4)', []],
};
const insertSql = (table, household = u.household) => {
  const [columns, params] = FIORELLA_TABLES[table](nextPeriod());
  return [`insert into public.${table} ${columns} returning id, revision`, [household, ...params]];
};
const controlInsert = (overrides = {}) => {
  const values = { kind: 'deposit', purpose: 'savings', contributor: 'fiorella', currency: 'PEN', amount: '25', status: 'pending', origin: 'real',
    source: 'control-excel', fingerprint: hex('a'), sheet: 'Hoja Sintética', ref: `C${100 + (month += 1)}`, household: u.household, ...overrides };
  return ['insert into public.control_movements (household_id, kind, purpose, contributor_identity, currency, amount, period_year, period_month, effective_date, origin, validation_status, source_type, source_fingerprint, source_sheet, source_amount_ref, provenance) values ($1, $2, $3, $4, $5, $6, 2031, 1, $7::date, $8, $9, $10, $11, $12, $13, \'{"synthetic": true}\'::jsonb) returning id, revision',
    [values.household, values.kind, values.purpose, values.contributor, values.currency, values.amount, values.date ?? null, values.origin, values.status, values.source,
      values.source === 'control-excel' ? values.fingerprint : null, values.source === 'control-excel' ? values.sheet : null, values.source === 'control-excel' ? values.ref : null]];
};
const ok = result => { assert.equal(result.ok, true, result.error); return result; };
const denied = result => assert.equal(result.ok, false, JSON.stringify(result));
const noEffect = result => { assert.equal(result.ok, true, result.error); assert.equal(result.affected, 0); };

test('schema: every public table has RLS, anon holds no grant and admin functions are not callable', async () => {
  const tables = (await db.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1")).rows;
  assert.equal(tables.length, 12);
  assert.deepEqual(tables.filter(table => !table.relrowsecurity), []);
  assert.deepEqual((await db.query("select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'")).rows, []);
  const writable = (await db.query("select table_name from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT','UPDATE','DELETE') group by 1 order by 1")).rows.map(row => row.table_name);
  assert.deepEqual(writable, ['control_contribution_commitments', 'control_import_batches', 'control_movement_reviews', 'control_movements', 'fiorella_fixed_budgets', 'fiorella_monthly_plans', 'fiorella_savings_goals', 'fiorella_variable_expenses']);
  for (const user of [u.fiorella, u.milton, null]) denied(await as(db, user, "select private.assign_member($1, $2, 'milton', 'x')", [u.fiorella, u.household]));
  const definers = (await db.query("select proname, proconfig from pg_proc where pronamespace = 'private'::regnamespace and prosecdef")).rows;
  assert.ok(definers.length >= 4 && definers.every(row => row.proconfig?.includes('search_path=""')), JSON.stringify(definers));
});

test('schema: SQL constraints mirror the official rules and catalog without changing them', async () => {
  const sql = (await Promise.all((await migrationFiles()).map(file => readFile(file, 'utf8')))).join('\n').replace(/--.*$/gm, '');
  const categories = /category_id text not null check \(category_id in \(([\s\S]*?)\)\),/.exec(sql)[1].match(/'([a-z-]+)'/g).map(value => value.slice(1, -1));
  assert.deepEqual(categories, FIXED_SUBCATEGORIES.map(category => category.id));
  assert.ok(sql.includes(`applied_fixed_expense <= ${FINANCIAL_RULES.fixedExpenseCap}`));
  assert.ok(sql.includes(`rules_version = '${FINANCIAL_RULES.version}'`));
  assert.doesNotMatch(sql, /raw_user_meta_data|raw_app_meta_data|user_metadata|app_metadata|auth\.jwt\(\)/);
  assert.doesNotMatch(sql, /security definer(?![^$]*set search_path = '')/);
});

for (const table of Object.keys(FIORELLA_TABLES)) {
  test(`RLS ${table}: Fiorella manages, Milton only reads, third parties and anon get nothing`, async () => {
    const [sql, params] = insertSql(table);
    const created = ok(await as(db, u.fiorella, sql, params)).rows[0];
    for (const user of [u.milton, u.outsider, u.otherOwner]) denied(await as(db, user, ...insertSql(table)));
    denied(await as(db, null, ...insertSql(table)));
    assert.equal(ok(await as(db, u.fiorella, `select id from public.${table} where id = $1`, [created.id])).rows.length, 1);
    assert.equal(ok(await as(db, u.milton, `select id from public.${table} where id = $1`, [created.id])).rows.length, 1);
    for (const user of [u.outsider, u.otherOwner]) assert.equal(ok(await as(db, user, `select id from public.${table}`)).rows.length, 0);
    denied(await as(db, null, `select id from public.${table}`));
    const bump = `update public.${table} set revision = revision + 1 where id = $1`;
    for (const user of [u.milton, u.outsider, u.otherOwner]) noEffect(await as(db, user, bump, [created.id]));
    denied(await as(db, null, bump, [created.id]));
    assert.equal(ok(await as(db, u.fiorella, bump, [created.id])).affected, 1);
    for (const user of [u.milton, u.outsider, u.otherOwner]) noEffect(await as(db, user, `delete from public.${table} where id = $1`, [created.id]));
    denied(await as(db, null, `delete from public.${table} where id = $1`, [created.id]));
    assert.equal((await db.query(`select revision from public.${table} where id = $1`, [created.id])).rows[0].revision, 2);
    assert.equal(ok(await as(db, u.fiorella, `delete from public.${table} where id = $1`, [created.id])).affected, 1);
  });
}

test('RLS control_movements: Milton manages, Fiorella only reads, third parties and anon get nothing', async () => {
  const created = ok(await as(db, u.milton, ...controlInsert())).rows[0];
  for (const user of [u.fiorella, u.outsider, u.otherOwner]) denied(await as(db, user, ...controlInsert()));
  denied(await as(db, null, ...controlInsert()));
  for (const user of [u.milton, u.fiorella]) assert.equal(ok(await as(db, user, 'select id from public.control_movements where id = $1', [created.id])).rows.length, 1);
  for (const user of [u.outsider, u.otherOwner]) assert.equal(ok(await as(db, user, 'select id from public.control_movements')).rows.length, 0);
  denied(await as(db, null, 'select id from public.control_movements'));
  const edit = "update public.control_movements set amount = '30', revision = revision + 1 where id = $1";
  for (const user of [u.fiorella, u.outsider, u.otherOwner]) noEffect(await as(db, user, edit, [created.id]));
  for (const user of [u.fiorella, u.outsider, u.otherOwner]) noEffect(await as(db, user, 'delete from public.control_movements where id = $1', [created.id]));
  denied(await as(db, null, edit, [created.id]));
  assert.equal((await db.query('select amount::text from public.control_movements where id = $1', [created.id])).rows[0].amount, '25');
  assert.equal(ok(await as(db, u.milton, edit, [created.id])).affected, 1);
  assert.equal(ok(await as(db, u.milton, 'delete from public.control_movements where id = $1', [created.id])).affected, 1);
});

test('reviews and import batches are append-only, authored by the caller and managed by Milton', async () => {
  const movement = ok(await as(db, u.milton, ...controlInsert())).rows[0];
  const review = "insert into public.control_movement_reviews (household_id, movement_id, review_type, field, decision, binding, reason, evidence_reference, reviewed_by) values ($1, $2, 'evidence', 'currency', 'accepted', 'binding-sintetico', 'Motivo sintético', 'Referencia sintética', $3) returning reviewed_by";
  // Spoofed author is overwritten with the authenticated user.
  assert.equal(ok(await as(db, u.milton, review, [u.household, movement.id, u.fiorella])).rows[0].reviewed_by, u.milton);
  for (const user of [u.fiorella, u.outsider]) denied(await as(db, user, review, [u.household, movement.id, user]));
  denied(await as(db, null, review, [u.household, movement.id, u.milton]));
  denied(await as(db, u.milton, "update public.control_movement_reviews set reason = 'cambiado'"));
  denied(await as(db, u.milton, 'delete from public.control_movement_reviews'));
  assert.equal(ok(await as(db, u.fiorella, 'select id from public.control_movement_reviews where movement_id = $1', [movement.id])).rows.length, 1);
  const batch = "insert into public.control_import_batches (household_id, source_fingerprint, created_by) values ($1, $2, $3) returning created_by";
  assert.equal(ok(await as(db, u.milton, batch, [u.household, hex('b'), u.fiorella])).rows[0].created_by, u.milton);
  denied(await as(db, u.milton, batch, [u.household, hex('b'), u.milton]));
  denied(await as(db, u.fiorella, batch, [u.household, hex('c'), u.fiorella]));
  denied(await as(db, u.milton, 'delete from public.control_import_batches'));
});

test('escalation: roles, profiles, households and audit cannot be changed from the API roles', async () => {
  for (const user of [u.fiorella, u.milton, u.outsider]) {
    denied(await as(db, user, "insert into public.module_permissions values ($1, $2, 'control-mf', 'manage')", [u.household, user]));
    denied(await as(db, user, "update public.module_permissions set access = 'manage'"));
    denied(await as(db, user, "update public.profiles set identity = 'milton' where user_id = $1", [user]));
    denied(await as(db, user, 'delete from public.module_permissions'));
    denied(await as(db, user, "insert into public.households (name) values ('Hogar ajeno')"));
    denied(await as(db, user, "insert into public.audit_events (household_id, module, table_name, record_id, action) values ($1, 'control-mf', 'x', gen_random_uuid(), 'insert')", [u.household]));
    denied(await as(db, user, 'delete from public.audit_events'));
    // SET SESSION AUTHORIZATION is not tested: PGlite's single connection always
    // logs in as a superuser, unlike PostgREST's non-superuser "authenticator".
    denied(await as(db, user, 'set role postgres'));
    denied(await as(db, user, 'select private.stamp_record()'));
  }
  // Claimed roles or metadata in the JWT grant nothing: only trusted permission rows do.
  denied(await as(db, u.outsider, ...controlInsert(), { user_metadata: { role: 'control_admin' }, app_metadata: { role: 'admin' }, role: 'service_role' }));
  denied(await as(db, u.fiorella, ...controlInsert(), { app_metadata: { modules: { 'control-mf': 'manage' } } }));
  assert.deepEqual((await db.query("select module, access from public.module_permissions where user_id = $1 order by 1", [u.fiorella])).rows,
    [{ module: 'control-mf', access: 'read' }, { module: 'fiorella', access: 'manage' }]);
  // Members only see their household's identity data.
  assert.equal(ok(await as(db, u.fiorella, 'select user_id from public.profiles')).rows.length, 2);
  assert.equal(ok(await as(db, u.outsider, 'select user_id from public.profiles')).rows.length, 0);
  assert.equal(ok(await as(db, u.otherOwner, 'select name from public.households')).rows.length, 1);
});

test('escalation: rows cannot be moved to another household, inserted elsewhere or re-authored', async () => {
  const [sql, params] = insertSql('fiorella_monthly_plans');
  const created = ok(await as(db, u.fiorella, sql, params)).rows[0];
  denied(await as(db, u.fiorella, 'update public.fiorella_monthly_plans set household_id = $2, revision = revision + 1 where id = $1', [created.id, u.otherHousehold]));
  denied(await as(db, u.fiorella, 'update public.fiorella_monthly_plans set created_by = $2, revision = revision + 1 where id = $1', [created.id, u.milton]));
  denied(await as(db, u.fiorella, ...insertSql('fiorella_monthly_plans', u.otherHousehold)));
  denied(await as(db, u.otherOwner, ...controlInsert({ household: u.household })));
  const spoofed = ok(await as(db, u.milton, `${controlInsert()[0].replace(' returning id, revision', '')} returning created_by, revision`, controlInsert()[1]));
  assert.equal(spoofed.rows[0].created_by, u.milton);
  assert.equal(spoofed.rows[0].revision, 1);
});

test('concurrency: a stale client cannot overwrite a newer revision', async () => {
  const created = ok(await as(db, u.milton, ...controlInsert())).rows[0];
  const guarded = "update public.control_movements set amount = $2, revision = $3 + 1 where id = $1 and revision = $3";
  assert.equal(ok(await as(db, u.milton, guarded, [created.id, '26', 1])).affected, 1);
  // Second client still holding revision 1: zero rows, nothing overwritten.
  noEffect(await as(db, u.milton, guarded, [created.id, '99', 1]));
  const missingBump = await as(db, u.milton, "update public.control_movements set amount = '98' where id = $1", [created.id]);
  assert.match(missingBump.error, /STALE_REVISION/);
  assert.match((await as(db, u.milton, "update public.control_movements set amount = '97', revision = 9 where id = $1", [created.id])).error, /STALE_REVISION/);
  assert.deepEqual((await db.query('select amount::text, revision from public.control_movements where id = $1', [created.id])).rows[0], { amount: '26', revision: 2 });
});

test('integrity: constraints reject invalid, unconfirmable or duplicate financial data', async () => {
  const period = nextPeriod();
  const plan = "insert into public.fiorella_monthly_plans (household_id, period_year, period_month, income, applied_fixed_expense) values ($1, $2, $3, $4, $5)";
  ok(await as(db, u.fiorella, plan, [u.household, period.year, period.month, '1', '1500']));
  denied(await as(db, u.fiorella, plan, [u.household, period.year, period.month, '2', '1']));
  const fresh = nextPeriod();
  denied(await as(db, u.fiorella, plan, [u.household, fresh.year, fresh.month, '1', '1500.01']));
  denied(await as(db, u.fiorella, plan, [u.household, fresh.year, fresh.month, '-1', '1']));
  denied(await as(db, u.fiorella, plan, [u.household, fresh.year, fresh.month, null, null]));
  denied(await as(db, u.fiorella, "insert into public.fiorella_fixed_budgets (household_id, period_year, period_month, category_id, budget_amount) values ($1, 2031, 1, 'gustos', '1')", [u.household]));
  denied(await as(db, u.fiorella, "insert into public.fiorella_variable_expenses (household_id, period_year, period_month, category_id, effective_date, description, amount) values ($1, 2031, 1, 'salud', '2031-02-01', 'x', '1')", [u.household]));
  denied(await as(db, u.fiorella, "insert into public.fiorella_variable_expenses (household_id, period_year, period_month, category_id, effective_date, description, amount) values ($1, 2031, 1, 'ropa', '2031-01-01', 'x', '1')", [u.household]));
  for (const overrides of [
    { origin: 'simulated', source: 'control-session-demo', status: 'confirmed' },
    { status: 'confirmed', currency: null },
    { status: 'confirmed', amount: '10.001' },
    { status: 'confirmed', contributor: null },
    { status: 'confirmed', kind: 'withdrawal', purpose: 'savings', contributor: null },
    { status: 'confirmed', kind: 'withdrawal', purpose: 'expenses', contributor: null, date: '2031-01-05' },
    { currency: 'pen' }, { amount: '-1' }, { origin: 'simulated', source: 'control-excel' }, { fingerprint: 'not-a-hash' },
  ]) denied(await as(db, u.milton, ...controlInsert(overrides)));
  ok(await as(db, u.milton, ...controlInsert({ status: 'confirmed' })));
  ok(await as(db, u.milton, ...controlInsert({ status: 'confirmed', kind: 'withdrawal', purpose: 'savings', contributor: null, date: '2031-01-05' })));
  // Same file + sheet + amount cell is one operation, even with a different sheet case.
  ok(await as(db, u.milton, ...controlInsert({ fingerprint: hex('d'), sheet: 'Control', ref: 'C5' })));
  denied(await as(db, u.milton, ...controlInsert({ fingerprint: hex('d'), sheet: 'CONTROL', ref: 'C5' })));
  ok(await as(db, u.milton, ...controlInsert({ fingerprint: hex('d'), sheet: 'Control', ref: 'D5' })));
  ok(await as(db, u.milton, ...controlInsert({ fingerprint: hex('e'), sheet: 'Control', ref: 'C5' })));
});

test('exactness: numeric amounts keep every decimal digit and sum exactly', async () => {
  const values = ['0.1', '0.2', '1000000000000000000000.0000000000000000000001'];
  for (const amount of values) ok(await as(db, u.milton, ...controlInsert({ fingerprint: hex('f'), amount })));
  const rows = ok(await as(db, u.fiorella, "select amount::text, sum(amount) over ()::text as total from public.control_movements where source_fingerprint = $1 order by amount", [hex('f')])).rows;
  assert.deepEqual(rows.map(row => row.amount), values);
  assert.equal(rows[0].total, '1000000000000000000000.3000000000000000000001');
});

test('audit: every change is recorded with actor and before/after, readable only per module access', async () => {
  const created = ok(await as(db, u.milton, ...controlInsert({ fingerprint: hex('9') }))).rows[0];
  ok(await as(db, u.milton, "update public.control_movements set amount = '27', revision = 2 where id = $1", [created.id]));
  ok(await as(db, u.milton, 'delete from public.control_movements where id = $1', [created.id]));
  const events = (await db.query("select action, actor_id, before->>'amount' as before, after->>'amount' as after from public.audit_events where record_id = $1 order by id", [created.id])).rows;
  assert.deepEqual(events.map(event => [event.action, event.actor_id, event.before, event.after]),
    [['insert', u.milton, null, '25'], ['update', u.milton, '25', '27'], ['delete', u.milton, '27', null]]);
  assert.equal(ok(await as(db, u.fiorella, 'select id from public.audit_events where record_id = $1', [created.id])).rows.length, 3);
  for (const user of [u.outsider, u.otherOwner]) assert.equal(ok(await as(db, user, 'select id from public.audit_events where record_id = $1', [created.id])).rows.length, 0);
  denied(await as(db, null, 'select id from public.audit_events'));
  denied(await as(db, u.milton, "update public.audit_events set actor_id = $1", [u.fiorella]));
});

test('Data API: authenticated has explicit schema usage; anon cannot execute future public functions', async () => {
  const usage = (await db.query("select has_schema_privilege('authenticated', 'public', 'USAGE') as authenticated")).rows[0];
  assert.equal(usage.authenticated, true);
  await db.exec('create function public.synthetic_future_rpc() returns int language sql as $$ select 1 $$');
  try {
    denied(await as(db, null, 'select public.synthetic_future_rpc()'));
    denied(await as(db, u.fiorella, 'select public.synthetic_future_rpc()'));
  } finally {
    await db.exec('drop function public.synthetic_future_rpc()');
  }
});

test('plan month: only savings deposits carry one, both parts or none', async () => {
  const savings = ok(await as(db, u.milton, ...controlInsert())).rows[0];
  const plan = (year, month, id) => as(db, u.milton, 'update public.control_movements set plan_year = $2, plan_month = $3, revision = revision + 1 where id = $1', [id, year, month]);
  assert.equal(ok(await plan(2031, 2, savings.id)).affected, 1);
  assert.deepEqual((await db.query('select plan_year, plan_month from public.control_movements where id = $1', [savings.id])).rows[0], { plan_year: 2031, plan_month: 2 });
  denied(await plan(2031, null, savings.id));
  denied(await plan(2031, 13, savings.id));
  const expenses = ok(await as(db, u.milton, ...controlInsert({ purpose: 'expenses', contributor: 'milton' }))).rows[0];
  denied(await plan(2031, 2, expenses.id));
  const withdrawal = ok(await as(db, u.milton, ...controlInsert({ kind: 'withdrawal', contributor: null }))).rows[0];
  denied(await plan(2031, 2, withdrawal.id));
  // Fiorella reads Control but cannot assign plan months.
  assert.equal(ok(await as(db, u.fiorella, 'update public.control_movements set plan_year = 2031, plan_month = 3 where id = $1', [savings.id])).affected, 0);
});
