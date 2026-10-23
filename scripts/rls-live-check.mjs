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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { prepareFiorellaDemo } from '../src/domain/fiorellaSession.js';
import { inspectLedger, prepareControlEntry, prepareControlEntryReview } from '../src/domain/controlLedger.js';
import { chromiumPath, openBrowser } from '../tests/helpers/chromium.js';

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
// Kept only in memory for the re-login checks below; cleared before exiting.
const passwords = {};
const ids = {};
for (const label of ['A', 'B', 'C', 'D']) {
  const client = createClient(url, key, options);
  const password = await hidden(`Contraseña del usuario de prueba ${label} (oculta): `);
  passwords[label] = password;
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


// ── Parte 2: persistencia real con el servicio de la aplicación ──────────────
const signedIn = async label => {
  const client = createClient(url, key, options);
  const { error } = await client.auth.signInWithPassword({ email: users[label], password: passwords[label] });
  return error ? null : client;
};
const service = client => createMilfiPersistence(client, { householdId: H1 });
const stamp = () => new Date().toISOString();
const planInput = { kind: 'monthly-plan', period: { year: 2099, month: 3 }, id: crypto.randomUUID(), expectedRevision: 0, eventId: crypto.randomUUID(),
  occurredAt: stamp(), income: '2222.225', appliedFixedExpense: '1500' };
const plan = prepareFiorellaDemo(planInput, [], [], { origin: 'real' }).value;
const savedPlan = await service(B).saveFiorellaRecord(plan, null);
record('B', 'persistencia Fiorella', 'guardar datos del mes con el servicio', 'ok', savedPlan.ok ? `revisión ${savedPlan.value.revision}` : savedPlan.errors[0], savedPlan.ok);
const B2 = await signedIn('B');
const reloaded = B2 ? await service(B2).loadFiorella() : { ok: false };
const reloadedPlan = reloaded.ok ? reloaded.records.find(item => item.id === plan.id) : null;
record('B', 'persistencia Fiorella', 'nueva sesión: los datos siguen ahí, importe exacto', 'ok', reloadedPlan?.income ?? 'sin dato', reloadedPlan?.income === '2222.225');
const byA = await service(A).loadFiorella();
record('A', 'persistencia Fiorella', 'otra cuenta (Milton) ve los datos', 'ok', byA.ok ? 'visible' : 'error', !!byA.records?.some(item => item.id === plan.id));
const deniedPlan = await service(A).saveFiorellaRecord({ ...plan, id: crypto.randomUUID(), period: { year: 2099, month: 7 } }, null);
record('A', 'persistencia Fiorella', 'guardar en módulo de solo consulta', 'error', deniedPlan.ok ? 'guardado' : deniedPlan.errors[0], !deniedPlan.ok && deniedPlan.errors[0] === 'FORBIDDEN');
if (savedPlan.ok) {
  const second = await service(B2).saveFiorellaRecord({ ...savedPlan.value, income: '2300' }, savedPlan.value);
  const stale = await service(B).saveFiorellaRecord({ ...savedPlan.value, income: '9' }, savedPlan.value);
  record('B', 'concurrencia', 'segundo dispositivo con revisión antigua', 'error', stale.ok ? 'sobrescribió' : stale.errors[0], second.ok && !stale.ok && stale.errors[0] === 'STALE_REVISION');
}
const history = await service(A).loadFiorellaHistory();
record('A', 'historial Fiorella', 'historial de cambios guardado en la base', 'ok', history.ok ? `${history.events.filter(item => item.recordId === plan.id).length} evento(s)` : 'error',
  !!history.events?.filter(item => item.recordId === plan.id).length);
const entry = prepareControlEntry({ id: crypto.randomUUID(), householdId: H1, expectedRevision: 0, operationId: crypto.randomUUID(), kind: 'deposit',
  effectiveDate: '2099-03-05', period: { year: 2099, month: 3 }, currency: 'PEN', amount: '44.44', contributorId: 'milton', purpose: 'expenses',
  description: 'PRUEBA SERVICIO sintética', provenanceNote: 'Referencia sintética', actorId: 'milton' }, []).value;
const savedEntry = await service(A).saveControlEntry(entry, null);
record('A', 'persistencia Control', 'guardar movimiento real con el servicio', 'ok', savedEntry.ok ? 'guardado' : savedEntry.errors[0], savedEntry.ok);
if (savedEntry.ok) {
  const ledger = (await service(A).loadControl()).records;
  const review = prepareControlEntryReview({ id: entry.id, expectedRevision: savedEntry.value.revision, decision: 'accepted', reviewedBy: 'milton', reason: 'PRUEBA RLS', evidenceReference: 'PRUEBA RLS' }, ledger);
  const reviewed = await service(A).addControlReview(review.record, ledger.find(item => item.id === entry.id), review.review, review.changed);
  record('A', 'persistencia Control', 'guardar revisión', 'ok', reviewed.ok ? 'guardada' : reviewed.errors[0], reviewed.ok);
  const seenByB = inspectLedger((await service(B2 ?? B).loadControl()).records).find(item => item.record.id === entry.id);
  record('B', 'persistencia Control', 'Fiorella ve el movimiento revisado', 'ok', seenByB?.status ?? 'no visible', seenByB?.status === 'reviewed');
  const deniedEntry = await service(B).saveControlEntry({ ...entry, id: crypto.randomUUID(), provenance: { ...entry.provenance, operationId: crypto.randomUUID() } }, null);
  record('B', 'persistencia Control', 'guardar en módulo de solo consulta', 'error', deniedEntry.ok ? 'guardado' : deniedEntry.errors[0], !deniedEntry.ok && deniedEntry.errors[0] === 'FORBIDDEN');
}
const deniedImport = await service(B).importPrepared({ fingerprint: 'e'.repeat(64), fileName: 'PRUEBA', sheets: [] }, [{ ...entry, provenance: { type: 'control-excel', sourceFingerprint: 'e'.repeat(64), sheet: 'PRUEBA', operation: { amountRef: 'C1' } } }]);
record('B', 'importación', 'importar preparados sin permiso (RPC)', 'error', deniedImport.ok ? 'importado' : deniedImport.errors[0], !deniedImport.ok);
await B2?.auth.signOut();

// ── Parte 3: interfaz real en Chromium contra este proyecto ──────────────────
const app = await createServer({ mode: 'development', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await app.listen();
const origin = `http://127.0.0.1:${app.httpServer.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'milfi-live-ui-'));
let browser;
try {
  browser = await openBrowser(await chromiumPath(), profile);
  await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const go = async path => { await browser.page('Page.navigate', { url: origin + path }); };
  const has = text => browser.evaluate(`document.body?.textContent.includes(${JSON.stringify(text)})`);
  const until = async (label, expression, ms = 20000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) { if (await browser.evaluate(expression)) return true; await new Promise(resolve => setTimeout(resolve, 150)); }
    return false;
  };
  const fill = (id, value) => browser.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const submit = label => browser.evaluate(`document.querySelector('form[aria-label="${label}"]').requestSubmit()`);
  const clickText = text => browser.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes(${JSON.stringify(text)}))?.click()`);
  const login = async label => {
    await go('/acceso');
    await until(label, '!!document.getElementById("login-email") || document.body?.textContent.includes("Sesión iniciada")');
    if (await has('Sesión iniciada')) { await clickText('Cerrar sesión'); await until(label, '!!document.getElementById("login-email")'); }
    await fill('login-email', users[label]);
    // Typed through CDP input events: the password never appears in a script expression.
    await browser.evaluate('document.getElementById("login-password").focus()');
    await browser.page('Input.insertText', { text: passwords[label] });
    await submit('Iniciar sesión');
    const ok = await until(label, 'document.body?.textContent.includes("Sesión iniciada")');
    record(label, 'interfaz', 'iniciar sesión en la app', 'ok', ok ? 'sesión iniciada' : 'sin sesión', ok);
    return ok;
  };
  const logout = async label => {
    await go('/acceso'); await until(label, 'document.body?.textContent.includes("Sesión iniciada")');
    await clickText('Cerrar sesión');
    const ok = await until(label, '!!document.getElementById("login-email")');
    record(label, 'interfaz', 'cerrar sesión', 'ok', ok ? 'sesión cerrada' : 'sigue abierta', ok);
  };
  if (await login('B')) {
    await go('/fiorella');
    record('B', 'interfaz Fiorella', 'pantalla en modo datos guardados', 'ok', 'ok', await until('B', '!!document.querySelector("[data-testid=monthly-summary]") && !document.body.textContent.includes("Demostración de esta sesión") && !!document.getElementById("monthly-income")'));
    await fill('fiorella-period', '2099-04');
    await until('B', 'document.getElementById("monthly-income")?.value === ""');
    await fill('monthly-income', '2500.75'); await fill('monthly-fixed', '1500');
    await submit('Datos mensuales de demostración');
    record('B', 'interfaz Fiorella', 'guardar datos del mes', 'ok', 'mensaje', await until('B', 'document.body?.textContent.includes("Guardado en MilFi")'));
    await browser.page('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await fill('monthly-income', '2600');
    await submit('Datos mensuales de demostración');
    const failedShown = await until('B', 'Array.from(document.querySelectorAll("[role=alert]")).some(node => node.textContent.includes("No se guardó nada"))');
    record('B', 'interfaz Fiorella', 'sin conexión: el error no se muestra como éxito', 'ok', failedShown ? 'error visible' : 'sin error', failedShown);
    await browser.page('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await browser.page('Page.reload');
    await until('B', '!!document.querySelector("[data-testid=monthly-summary]") && !document.body.textContent.includes("Cargando datos")');
    await fill('fiorella-period', '2099-04');
    record('B', 'interfaz Fiorella', 'tras recargar: sesión recuperada y dato guardado (no el fallido)', 'ok', 'importe',
      await until('B', 'document.body?.textContent.includes("2,500.75") && !document.body.textContent.includes("2,600.00")'));
    await logout('B');
    await go('/fiorella');
    record('B', 'interfaz', 'sin sesión: el módulo redirige a Acceso y no muestra datos', 'ok', 'redirigido',
      await until('B', 'location.pathname === "/acceso" && !document.body.textContent.includes("2,500.75")'));
  }
  if (await login('A')) {
    await go('/fiorella');
    await until('A', '!!document.querySelector("[data-testid=monthly-summary]") && !document.body.textContent.includes("Cargando datos")');
    await fill('fiorella-period', '2099-04');
    record('A', 'interfaz Fiorella', 'Milton consulta los datos de Fiorella, sin formularios', 'ok', 'solo consulta',
      await until('A', 'document.body?.textContent.includes("2,500.75") && document.body.textContent.includes("Solo consulta") && !document.getElementById("monthly-income")'));
    await go('/control');
    await until('A', '!!document.querySelector("[data-testid=control-ledger]")');
    await fill('control-selected-period', '2099-04');
    await until('A', '!!document.getElementById("control-amount")');
    await fill('control-kind', 'deposit'); await fill('control-date', '2099-04-08'); await fill('control-amount', '33.30'); await fill('control-currency', 'PEN');
    await fill('control-contributor', 'fiorella'); await fill('control-purpose', 'savings'); await fill('control-description', 'PRUEBA UI sintética'); await fill('control-source', 'Referencia sintética UI');
    await submit('Movimiento de Control');
    record('A', 'interfaz Control', 'registrar movimiento real', 'ok', 'guardado', await until('A', 'document.body?.textContent.includes("Movimiento guardado en MilFi")'));
    await browser.evaluate('Array.from(document.querySelectorAll("[data-ledger-id]")).find(card => card.textContent.includes("PRUEBA UI sintética"))?.querySelectorAll("button")[1]?.click()');
    await until('A', '!!document.getElementById("control-review-reason")');
    await fill('control-review-reason', 'PRUEBA UI revisión sintética'); await fill('control-review-reference', 'PRUEBA UI');
    await submit('Revisión de Control');
    record('A', 'interfaz Control', 'revisar el movimiento', 'ok', 'revisado', await until('A', 'Array.from(document.querySelectorAll("[data-ledger-id]")).some(card => card.textContent.includes("PRUEBA UI sintética") && card.dataset.ledgerState === "reviewed")'));
    await logout('A');
  }
  if (await login('B')) {
    await go('/control');
    await until('B', '!!document.querySelector("[data-testid=control-ledger]")');
    await fill('control-selected-period', '2099-04');
    record('B', 'interfaz Control', 'Fiorella ve el movimiento revisado de Milton, sin formularios', 'ok', 'solo consulta',
      await until('B', 'Array.from(document.querySelectorAll("[data-ledger-id]")).some(card => card.textContent.includes("PEN 33.30") && card.dataset.ledgerState === "reviewed") && !document.getElementById("control-amount") && document.body.textContent.includes("Solo consulta")'));
    await logout('B');
  }
  record('ui', 'interfaz', 'sin excepciones de JavaScript', 'ok', browser.exceptions.length ? `${browser.exceptions.length} excepción(es)` : 'ninguna', !browser.exceptions.length);
} finally {
  try { if (browser) await browser.close(); } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

// Synthetic rows created by parts 2 and 3 (deleted by their owners).
for (const table of ['fiorella_monthly_plans']) {
  for (const month of [3, 4]) await expect('B', table, `limpieza: datos sintéticos 2099-0${month}`, 'ok', () => B.from(table).delete().eq('household_id', H1).eq('period_year', 2099).eq('period_month', month).select('id'));
}
for (const description of ['PRUEBA SERVICIO sintética', 'PRUEBA UI sintética']) {
  await expect('A', 'control_movements', `limpieza: ${description}`, 'ok', () => A.from('control_movements').delete().eq('household_id', H1).eq('description', description).select('id'));
}

// ── Limpieza controlada de las filas sintéticas (operaciones autorizadas) ────
for (const [table, row] of Object.entries(created)) await expect('B', table, 'limpieza: eliminar fila sintética', 'ok', () => B.from(table).delete().eq('id', row.id).select('id'));
await expect('A', 'control_movements', 'limpieza: eliminar movimiento (y su revisión)', 'ok', () => A.from('control_movements').delete().eq('id', m1.id).select('id'));
await expect('D', 'control_movements', 'limpieza: eliminar movimiento del otro hogar', 'ok', () => D.from('control_movements').delete().eq('id', m2.id).select('id'));
for (const table of [...Object.keys(fiorellaRows), 'control_movements', 'control_movement_reviews']) {
  await expect('A', table, 'limpieza: sin filas sintéticas restantes', 'none', () => A.from(table).select('id').eq('household_id', H1));
}
for (const label of ['A', 'B', 'C', 'D']) { await clients[label].auth.signOut(); passwords[label] = null; }

const failed = results.filter(result => !result.pass);
writeFileSync(RESULTS_FILE, JSON.stringify({ executedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.stdout.write(`\n${results.length - failed.length}/${results.length} PASS · resultados en ${RESULTS_FILE} (sin correos, contraseñas ni tokens)\n`);
process.exit(failed.length ? 1 : 0);
