// Live RLS validation against a Supabase DEVELOPMENT project with synthetic users.
// - Uses only the public URL + publishable key (from .env.development.local) and
//   real Supabase Auth sessions. No service-role or secret key is ever used.
// - Passwords are typed interactively with hidden input; they and the session
//   tokens are never printed, logged or written anywhere.
// - Creates only synthetic rows (marked "PRUEBA RLS") and deletes them at the end.
// - Results (labels A–D only, no emails or tokens) go to supabase/.temp/ (ignored by Git).
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';

const USERS_FILE = process.argv[2] ?? 'supabase/.temp/rls-live-users.json';
const RESULTS_FILE = 'supabase/.temp/rls-live-results.json';
const env = Object.fromEntries(readFileSync('.env.development.local', 'utf8').split('\n')
  .filter(line => /^VITE_SUPABASE_/.test(line)).map(line => line.split(/=(.*)/s).slice(0, 2)));
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || !key.startsWith('sb_publishable_')) throw new Error('A publishable key and URL are required in .env.development.local');
if (!process.stdin.isTTY) throw new Error('Run this in an interactive terminal: passwords are read with hidden input.');
const users = JSON.parse(readFileSync(USERS_FILE, 'utf8'));

function hidden(prompt) {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  let value = '';
  return new Promise(resolve => {
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(value); return; }
        if (char === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1); else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const results = [];
const record = (user, area, operation, expected, outcome, pass) => {
  results.push({ user, area, operation, expected, outcome, pass });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${user.padEnd(5)} ${area.padEnd(28)} ${operation.padEnd(44)} ${outcome}\n`);
};
const describe = ({ data, error }) => error ? `error ${error.code ?? error.status ?? ''}`.trim() : Array.isArray(data) ? `${data.length} fila(s)` : data ? 'ok' : 'sin datos';
async function expect(user, area, operation, expected, run) {
  let response;
  try { response = await run(); } catch (error) { response = { error: { code: error?.code ?? 'EXCEPTION' } }; }
  const rows = Array.isArray(response.data) ? response.data.length : response.data ? 1 : 0;
  const pass = expected === 'ok' ? !response.error && rows > 0
    : expected === 'none' ? !response.error && rows === 0
      : expected === 'denied' ? !!response.error || rows === 0
        : expected === 'error' ? !!response.error : false;
  record(user, area, operation, expected, describe(response), pass);
  return response;
}

const clients = { anon: createClient(url, key, options) };
const ids = {};
for (const label of ['A', 'B', 'C', 'D']) {
  const client = createClient(url, key, options);
  const password = await hidden(`Contraseña del usuario de prueba ${label} (oculta): `);
  const { data, error } = await client.auth.signInWithPassword({ email: users[label], password });
  record(label, 'auth', 'iniciar sesión real (Supabase Auth)', 'ok', error ? `error ${error.code ?? error.status}` : 'sesión', !error && !!data.session);
  if (error) process.exit(1);
  clients[label] = client; ids[label] = data.user.id;
}
const { A, B, C, D, anon } = clients;
const householdOf = async client => (await client.from('profiles').select('household_id').limit(1).maybeSingle()).data?.household_id ?? null;
const H1 = await householdOf(A);
const H2 = await householdOf(D);
record('setup', 'hogares', 'A y B comparten hogar; D en otro hogar', 'ok', H1 && H2 && H1 !== H2 && (await householdOf(B)) === H1 ? 'ok' : 'inconsistente', !!H1 && !!H2 && H1 !== H2);

// ── Finanzas de Fiorella: B administra, A consulta, C/D/anon nada ────────────
const fiorellaRows = {
  fiorella_monthly_plans: { period_year: 2099, period_month: 1, income: '1000.01', applied_fixed_expense: '1500' },
  fiorella_fixed_budgets: { period_year: 2099, period_month: 1, category_id: 'servicios-gas', budget_amount: '10.5' },
  fiorella_variable_expenses: { period_year: 2099, period_month: 1, category_id: 'salud', effective_date: '2099-01-15', description: 'PRUEBA RLS sintética', amount: '2.25' },
  fiorella_savings_goals: { title: 'PRUEBA RLS sintética', target_amount: '100', months: 3 },
};
const created = {};
for (const [table, row] of Object.entries(fiorellaRows)) {
  const insertB = await expect('B', table, 'insertar en su módulo', 'ok', () => B.from(table).insert({ ...row, household_id: H1, created_by: ids.A }).select('id, revision, created_by'));
  created[table] = insertB.data?.[0];
  record('B', table, 'autor forzado al usuario autenticado', 'ok', created[table]?.created_by === ids.B ? 'created_by = B' : 'created_by falsificado', created[table]?.created_by === ids.B);
  const id = created[table]?.id;
  await expect('A', table, 'consultar (solo lectura)', 'ok', () => A.from(table).select('id').eq('id', id));
  for (const label of ['A', 'C', 'D']) {
    await expect(label, table, 'insertar', 'denied', () => clients[label].from(table).insert({ ...row, period_month: row.period_month ? 2 : undefined, household_id: H1 }).select('id'));
    await expect(label, table, 'actualizar fila de B', 'denied', () => clients[label].from(table).update({ revision: created[table].revision + 1 }).eq('id', id).select('id'));
    await expect(label, table, 'eliminar fila de B', 'denied', () => clients[label].from(table).delete().eq('id', id).select('id'));
  }
  for (const label of ['C', 'D']) await expect(label, table, 'consultar hogar ajeno', 'none', () => clients[label].from(table).select('id').eq('household_id', H1));
  await expect('anon', table, 'consultar sin sesión', 'error', () => anon.from(table).select('id'));
  await expect('anon', table, 'insertar sin sesión', 'error', () => anon.from(table).insert({ ...row, household_id: H1 }));
  await expect('B', table, 'actualizar con revisión vigente', 'ok', () => B.from(table).update({ revision: created[table].revision + 1 }).eq('id', id).eq('revision', created[table].revision).select('id'));
  await expect('B', table, 'actualizar con revisión obsoleta', 'none', () => B.from(table).update({ revision: created[table].revision + 1 }).eq('id', id).eq('revision', created[table].revision).select('id'));
}
await expect('B', 'fiorella_monthly_plans', 'actualizar sin incrementar revisión', 'error', () => B.from('fiorella_monthly_plans').update({ income: '7' }).eq('id', created.fiorella_monthly_plans.id).select('id'));
await expect('B', 'fiorella_monthly_plans', 'mover fila a otro hogar', 'error', () => B.from('fiorella_monthly_plans').update({ household_id: H2, revision: 3 }).eq('id', created.fiorella_monthly_plans.id).select('id'));

// ── Control Finanzas M&F: A administra, B consulta, C/D/anon nada ────────────
const movement = { kind: 'deposit', purpose: 'savings', contributor_identity: 'fiorella', currency: 'PEN', amount: '3.33', period_year: 2099, period_month: 1,
  description: 'PRUEBA RLS sintética', origin: 'simulated', validation_status: 'pending', source_type: 'control-session-demo', provenance: { prueba: 'rls-sintetica' } };
const m1 = (await expect('A', 'control_movements', 'insertar en su módulo', 'ok', () => A.from('control_movements').insert({ ...movement, household_id: H1, created_by: ids.B }).select('id, revision, created_by'))).data?.[0];
record('A', 'control_movements', 'autor forzado al usuario autenticado', 'ok', m1?.created_by === ids.A ? 'created_by = A' : 'created_by falsificado', m1?.created_by === ids.A);
const m2 = (await expect('D', 'control_movements', 'insertar en su propio hogar', 'ok', () => D.from('control_movements').insert({ ...movement, household_id: H2 }).select('id, revision'))).data?.[0];
await expect('B', 'control_movements', 'consultar (solo lectura)', 'ok', () => B.from('control_movements').select('id').eq('id', m1.id));
for (const label of ['B', 'C', 'D']) {
  await expect(label, 'control_movements', 'insertar en hogar de A/B', 'denied', () => clients[label].from('control_movements').insert({ ...movement, household_id: H1 }).select('id'));
  await expect(label, 'control_movements', 'actualizar movimiento de A', 'denied', () => clients[label].from('control_movements').update({ amount: '9', revision: 2 }).eq('id', m1.id).select('id'));
  await expect(label, 'control_movements', 'eliminar movimiento de A', 'denied', () => clients[label].from('control_movements').delete().eq('id', m1.id).select('id'));
}
for (const label of ['C', 'D']) await expect(label, 'control_movements', 'consultar hogar ajeno', 'none', () => clients[label].from('control_movements').select('id').eq('household_id', H1));
await expect('A', 'control_movements', 'consultar movimiento de otro hogar', 'none', () => A.from('control_movements').select('id').eq('id', m2.id));
await expect('A', 'control_movements', 'actualizar movimiento de otro hogar', 'none', () => A.from('control_movements').update({ amount: '9', revision: 2 }).eq('id', m2.id).select('id'));
await expect('anon', 'control_movements', 'consultar sin sesión', 'error', () => anon.from('control_movements').select('id'));
await expect('A', 'control_movements', 'actualizar con revisión vigente', 'ok', () => A.from('control_movements').update({ amount: '3.34', revision: m1.revision + 1 }).eq('id', m1.id).eq('revision', m1.revision).select('amount::text'));
await expect('A', 'control_movements', 'actualizar con revisión obsoleta', 'none', () => A.from('control_movements').update({ amount: '9', revision: m1.revision + 1 }).eq('id', m1.id).eq('revision', m1.revision).select('id'));
await expect('A', 'control_movements', 'mover movimiento a otro hogar', 'error', () => A.from('control_movements').update({ household_id: H2, revision: 3 }).eq('id', m1.id).select('id'));
const exact = await A.from('control_movements').select('amount::text').eq('id', m1.id).maybeSingle();
record('A', 'control_movements', 'importe exacto leído como texto', 'ok', exact.data?.amount ?? 'sin dato', exact.data?.amount === '3.34');

const review = { household_id: H1, movement_id: m1.id, review_type: 'demo', decision: 'accepted', binding: 'prueba-rls', reason: 'PRUEBA RLS sintética', evidence_reference: 'PRUEBA RLS' };
const r1 = (await expect('A', 'control_movement_reviews', 'añadir revisión', 'ok', () => A.from('control_movement_reviews').insert({ ...review, reviewed_by: ids.B }).select('id, reviewed_by'))).data?.[0];
record('A', 'control_movement_reviews', 'revisor forzado al usuario autenticado', 'ok', r1?.reviewed_by === ids.A ? 'reviewed_by = A' : 'falsificado', r1?.reviewed_by === ids.A);
for (const label of ['B', 'C', 'D']) await expect(label, 'control_movement_reviews', 'añadir revisión', 'denied', () => clients[label].from('control_movement_reviews').insert(review).select('id'));
await expect('A', 'control_movement_reviews', 'editar revisión (solo inserción)', 'error', () => A.from('control_movement_reviews').update({ reason: 'cambiada' }).eq('id', r1.id).select('id'));
await expect('A', 'control_movement_reviews', 'borrar revisión (solo inserción)', 'error', () => A.from('control_movement_reviews').delete().eq('id', r1.id).select('id'));
await expect('B', 'control_movement_reviews', 'consultar (solo lectura)', 'ok', () => B.from('control_movement_reviews').select('id').eq('id', r1.id));
for (const label of ['B', 'C']) await expect(label, 'control_import_batches', 'registrar lote', 'denied', () => clients[label].from('control_import_batches').insert({ household_id: H1, source_fingerprint: 'f'.repeat(64) }).select('id'));
await expect('anon', 'control_import_batches', 'registrar lote sin sesión', 'error', () => anon.from('control_import_batches').insert({ household_id: H1, source_fingerprint: 'f'.repeat(64) }));

// ── Auditoría ────────────────────────────────────────────────────────────────
for (const label of ['A', 'B']) await expect(label, 'audit_events', 'consultar historial de su hogar', 'ok', () => clients[label].from('audit_events').select('id').eq('household_id', H1));
for (const label of ['C', 'D']) await expect(label, 'audit_events', 'consultar historial ajeno', 'none', () => clients[label].from('audit_events').select('id').eq('household_id', H1));
await expect('A', 'audit_events', 'insertar evento', 'error', () => A.from('audit_events').insert({ household_id: H1, module: 'control-mf', table_name: 'x', record_id: m1.id, action: 'insert' }));
await expect('B', 'audit_events', 'borrar historial', 'error', () => B.from('audit_events').delete().eq('household_id', H1).select('id'));
await expect('anon', 'audit_events', 'consultar sin sesión', 'error', () => anon.from('audit_events').select('id'));

// ── Escalamiento de privilegios e identidad ──────────────────────────────────
for (const label of ['A', 'B', 'C']) {
  await expect(label, 'module_permissions', 'concederse administrar ambos módulos', 'error', () => clients[label].from('module_permissions').insert({ household_id: H1, user_id: ids[label], module: label === 'A' ? 'fiorella' : 'control-mf', access: 'manage' }));
  await expect(label, 'module_permissions', 'elevar sus permisos existentes', 'error', () => clients[label].from('module_permissions').update({ access: 'manage' }).eq('user_id', ids[label]).select('module'));
  await expect(label, 'profiles', 'cambiar su identidad', 'error', () => clients[label].from('profiles').update({ identity: label === 'A' ? 'fiorella' : 'milton' }).eq('user_id', ids[label]).select('user_id'));
  await expect(label, 'households', 'crear un hogar', 'error', () => clients[label].from('households').insert({ name: 'PRUEBA RLS' }));
}
await expect('B', 'private.assign_member', 'invocar asignación administrativa', 'error', () => B.schema('private').rpc('assign_member', { target_user: ids.B, target_household: H1, member_identity: 'milton', member_name: 'x' }));
await expect('C', 'profiles', 'consultar perfiles sin asignación', 'none', () => C.from('profiles').select('user_id'));
await expect('D', 'profiles', 'consultar perfiles de otro hogar', 'none', () => D.from('profiles').select('user_id').eq('household_id', H1));
// User metadata is editable by the user, so it must never grant anything.
const meta = await B.auth.updateUser({ data: { role: 'control_admin', modules: { 'control-mf': 'manage' } } });
record('B', 'auth.user_metadata', 'autoasignarse un rol en metadatos', 'ok', meta.error ? 'no permitido' : 'metadatos cambiados', true);
await B.auth.refreshSession();
await expect('B', 'control_movements', 'insertar tras falsear metadatos', 'denied', () => B.from('control_movements').insert({ ...movement, household_id: H1 }).select('id'));
const forgedPayload = Buffer.from(JSON.stringify({ sub: ids.A, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
const forged = createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${forgedPayload}.firma-falsa` } } });
await expect('forj', 'control_movements', 'token JWT falsificado con identidad de A', 'error', () => forged.from('control_movements').select('id'));

// ── Limpieza controlada de las filas sintéticas (operaciones autorizadas) ────
for (const [table, row] of Object.entries(created)) await expect('B', table, 'limpieza: eliminar fila sintética', 'ok', () => B.from(table).delete().eq('id', row.id).select('id'));
await expect('A', 'control_movements', 'limpieza: eliminar movimiento (y su revisión)', 'ok', () => A.from('control_movements').delete().eq('id', m1.id).select('id'));
await expect('D', 'control_movements', 'limpieza: eliminar movimiento del otro hogar', 'ok', () => D.from('control_movements').delete().eq('id', m2.id).select('id'));
for (const table of [...Object.keys(fiorellaRows), 'control_movements', 'control_movement_reviews']) {
  await expect('A', table, 'limpieza: sin filas sintéticas restantes', 'none', () => A.from(table).select('id').eq('household_id', H1));
}
for (const label of ['A', 'B', 'C', 'D']) await clients[label].auth.signOut();

const failed = results.filter(result => !result.pass);
writeFileSync(RESULTS_FILE, JSON.stringify({ executedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.stdout.write(`\n${results.length - failed.length}/${results.length} PASS · resultados en ${RESULTS_FILE} (sin correos, contraseñas ni tokens)\n`);
process.exit(failed.length ? 1 : 0);
