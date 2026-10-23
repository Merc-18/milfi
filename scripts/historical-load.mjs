// One-time, private historical load of MilFi (no screen for end users).
//
//   node scripts/historical-load.mjs fiorella <archivo.xlsx> [--corte AAAA-MM-DD]
//   node scripts/historical-load.mjs control  <archivo.xlsx> [--decisiones decisiones.json]
//   ... add --aplicar <huella> to write, after reviewing the preview.
//
// Without --aplicar nothing leaves this computer: the workbook is read into
// memory and the detailed preview (with amounts, for the owner's review) is
// written only to supabase/.temp/ (ignored by Git, mode 600). The terminal
// shows counts, codes and the digest, never amounts, dates or descriptions.
// With --aplicar the module manager signs in with real Supabase Auth (publishable
// key only, password typed hidden), RLS applies, and the whole load is a single
// transaction that cannot be repeated.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { readXlsxCapture } from '../src/infrastructure/xlsx/workbook.js';
import { recognizeFiorellaWorkbook } from '../src/domain/fiorellaWorkbook.js';
import { readControlWorkbook } from '../src/application/controlPreimport.js';
import { applyControlDecisions, controlLoadPreview, fiorellaLoadPayload, fiorellaLoadPreview, payloadDigestSource } from '../src/application/historicalLoad.js';
import { createMilfiPersistence } from '../src/application/persistence.js';
import { controlMovementToRow } from '../src/infrastructure/supabase/repositories.js';

const [module, file, ...rest] = process.argv.slice(2);
const option = name => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : undefined; };
const MANAGER = { fiorella: { module: 'fiorella', identity: 'fiorella', name: 'Fiorella' }, control: { module: 'control-mf', identity: 'milton', name: 'Milton' } };
const stop = message => { process.stderr.write(`${message}\n`); process.exit(1); };
if (!MANAGER[module] || !file) stop('Uso: node scripts/historical-load.mjs <fiorella|control> <archivo.xlsx> [--corte AAAA-MM-DD] [--decisiones archivo.json] [--aplicar huella]');
const cutoff = option('--corte') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const apply = option('--aplicar');
const digest = value => createHash('sha256').update(payloadDigestSource(value)).digest('hex').slice(0, 16);

// ── 1. Offline preparation ───────────────────────────────────────────────────
const bytes = new Uint8Array(readFileSync(file));
let prepared;
if (module === 'fiorella') {
  const read = await readXlsxCapture(bytes);
  if (!read.ok) stop(`No se pudo leer el libro: ${read.code}`);
  const recognized = recognizeFiorellaWorkbook(read.capture, { cutoff });
  if (!recognized.ok) stop(`El libro no coincide con la estructura esperada: ${recognized.errors.map(error => error.code).join(', ')}`);
  prepared = { plan: recognized.plan, content: fiorellaLoadPayload(recognized.plan, null) };
} else {
  const read = await readControlWorkbook(bytes);
  if (!read.ok) stop(`No se pudo reconocer el libro de Control: ${read.code ?? read.errors?.join(', ')}`);
  const decisionsFile = option('--decisiones');
  const decisions = decisionsFile ? JSON.parse(readFileSync(decisionsFile, 'utf8')) : null;
  // Review timestamps are part of the payload; a fixed instant keeps the digest stable between preview and load.
  const result = applyControlDecisions(read, decisions, `${cutoff}T12:00:00.000Z`);
  if (!result.ok) stop(`Las decisiones no se pudieron aplicar: ${result.errors.join(', ')}`);
  prepared = { result, content: { batch: { fingerprint: read.batch.fingerprint, sheets: read.batch.sheets }, movements: result.records.map(record => controlMovementToRow(record, null)) } };
}
const huella = digest(prepared.content);

function printPreview(preview) {
  const out = process.stdout;
  out.write(`\nMilFi · carga histórica · ${MANAGER[module].name === 'Fiorella' ? 'Finanzas de Fiorella' : 'Control Finanzas M&F'}\n`);
  out.write(`Archivo: huella ${(module === 'fiorella' ? prepared.plan.fingerprint : prepared.result.batch.fingerprint).slice(0, 12)}… · corte ${cutoff}\n`);
  for (const [key, value] of Object.entries(preview.counts)) out.write(`  ${key.padEnd(18)} ${value}\n`);
  if (preview.checks) for (const check of preview.checks) out.write(`  ${check.ok ? 'CUADRA ' : 'NO CUADRA'} ${check.code}${check.period ? ` ${check.period}` : ''}\n`);
  if (preview.pendingReasons) for (const [reason, count] of Object.entries(preview.pendingReasons)) out.write(`  pendiente ${reason}: ${count}\n`);
  for (const conflict of preview.conflicts) out.write(`  CONFLICTO ${conflict.code}${conflict.period ? ` ${conflict.period}` : ''}${conflict.ref ? ` ${conflict.ref}` : ''}\n`);
  out.write(preview.blocked ? '\nBLOQUEADO: no se puede cargar hasta resolver lo indicado.\n' : `\nHuella de esta carga: ${huella}\n`);
}

// ── 2. Preview only ──────────────────────────────────────────────────────────
if (!apply) {
  const preview = module === 'fiorella' ? fiorellaLoadPreview(prepared.plan) : controlLoadPreview(prepared.result);
  printPreview(preview);
  mkdirSync('supabase/.temp', { recursive: true });
  const detail = `supabase/.temp/carga-${module}-${huella}.json`;
  writeFileSync(detail, JSON.stringify({ module, cutoff, huella, preview, content: prepared.content,
    pending: module === 'fiorella' ? prepared.plan.pending : prepared.result.pendingReasons,
    omitted: module === 'fiorella' ? prepared.plan.omitted : prepared.result.excluded }, null, 2), { mode: 0o600 });
  process.stdout.write(`Detalle privado para revisar (no se sube a Git): ${detail}\nNo se escribió nada en Supabase.\n`);
  process.exit(0);
}

// ── 3. Apply: real session of the module manager ─────────────────────────────
if (apply !== huella) stop('La huella no coincide con este archivo, corte y decisiones. Vuelve a generar la vista previa.');
if (!process.stdin.isTTY) stop('Ejecuta en una terminal interactiva: la contraseña se escribe oculta.');
const envFile = ['.env.development.local', '.env.local'].find(existsSync);
if (!envFile) stop('Falta .env.development.local con VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.');
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(line => /^VITE_SUPABASE_/.test(line)).map(line => line.split(/=(.*)/s).slice(0, 2).map(part => part.trim())));
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) stop('Se requiere la URL y la clave publishable (nunca una clave secreta).');

function ask(prompt, hidden = false) {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  let value = '';
  return new Promise(resolve => {
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(value.trim()); return; }
        if (char === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (char === '\u007f' || char === '\b') { if (value) { value = value.slice(0, -1); if (!hidden) process.stdout.write('\b \b'); } }
        else { value += char; if (!hidden) process.stdout.write(char); }
      }
    };
    stdin.on('data', onData);
  });
}

const manager = MANAGER[module];
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
process.stdout.write(`\nInicia sesión quien administra el módulo: ${manager.name}.\n`);
const email = await ask('Correo: ');
const signedIn = await client.auth.signInWithPassword({ email, password: await ask('Contraseña (oculta): ', true) });
if (signedIn.error) stop(`No se pudo iniciar sesión (${signedIn.error.code ?? signedIn.error.status}). No se escribió nada.`);
const finish = async code => { await client.auth.signOut(); process.exit(code); };
const userId = signedIn.data.user.id;
const profile = (await client.from('profiles').select('household_id, identity').eq('user_id', userId).maybeSingle()).data;
const permission = profile && (await client.from('module_permissions').select('access').eq('user_id', userId).eq('module', manager.module).maybeSingle()).data;
if (profile?.identity !== manager.identity || permission?.access !== 'manage') { process.stderr.write(`Esta cuenta no administra el módulo (${manager.name}). No se escribió nada.\n`); await finish(1); }
const householdId = profile.household_id;

let preview;
if (module === 'fiorella') {
  const list = async (table, columns) => { const { data, error } = await client.from(table).select(columns).eq('household_id', householdId); if (error) throw new Error(error.code); return data; };
  const existing = { monthlyPlans: await list('fiorella_monthly_plans', 'period_year, period_month'), fixedBudgets: await list('fiorella_fixed_budgets', 'period_year, period_month, category_id'),
    variableExpenses: await list('fiorella_variable_expenses', 'source_ref, effective_date, category_id, description, amount::text'), savingsGoals: await list('fiorella_savings_goals', 'source_ref') };
  preview = fiorellaLoadPreview(prepared.plan, existing);
} else {
  const persistence = createMilfiPersistence(client, { householdId });
  const stored = await persistence.loadControl();
  const batches = await client.from('control_import_batches').select('source_fingerprint').eq('household_id', householdId);
  if (!stored.ok || batches.error) { process.stderr.write('No se pudo leer lo ya guardado. No se escribió nada.\n'); await finish(1); }
  preview = controlLoadPreview(prepared.result, batches.data, stored.records);
}
printPreview(preview);
if (preview.blocked) await finish(1);
if (await ask('Escribe CARGAR para guardar esta carga en MilFi (otra cosa cancela): ') !== 'CARGAR') { process.stdout.write('Cancelado. No se escribió nada.\n'); await finish(0); }

if (module === 'fiorella') {
  const { data, error } = await client.rpc('import_fiorella_history', { payload: fiorellaLoadPayload(prepared.plan, householdId) });
  if (error) { process.stderr.write(`La base de datos rechazó la carga (${error.code}). No se guardó nada.\n`); await finish(1); }
  process.stdout.write(`Cargado: ${Object.entries(data).map(([key, value]) => `${key}=${value}`).join(' · ')}\n`);
} else {
  const persistence = createMilfiPersistence(client, { householdId });
  const result = await persistence.importPrepared({ fingerprint: prepared.result.batch.fingerprint, fileName: basename(file).slice(0, 200), sheets: prepared.result.batch.sheets }, prepared.result.records);
  if (!result.ok) { process.stderr.write(`La base de datos rechazó la carga (${result.errors[0]}). No se guardó nada.\n`); await finish(1); }
  process.stdout.write(`Cargados ${result.value.movementIds.length} movimientos en un lote.\n`);
}
await finish(0);
