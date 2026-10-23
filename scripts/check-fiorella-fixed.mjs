// Read-only check of Fiorella's saved months against the rule "GF aplicado = S/ 1,500".
//
//   node scripts/check-fiorella-fixed.mjs
//
// Signs in with real Supabase Auth (publishable key only, password typed hidden),
// so RLS applies; any account that can read Fiorella works. It only SELECTs the
// monthly plans and prints COUNTS: never amounts, months, names or descriptions.
// Nothing is written, and the session is closed at the end.
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { compareAmounts, normalizeAmount } from '../src/domain/amounts.js';
import { FINANCIAL_RULES } from '../src/domain/financialRules.js';

const stop = message => { process.stderr.write(`${message}\n`); process.exit(1); };
const envFile = ['.env.development.local', '.env.local'].find(existsSync);
if (!envFile) stop('Falta .env.development.local con VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.');
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter(line => /^VITE_SUPABASE_/.test(line))
  .map(line => line.split(/=(.*)/s).slice(0, 2).map(part => part.trim())));
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

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
process.stdout.write('\nVerificación de solo lectura del GF aplicado (solo recuentos).\n');
const signedIn = await client.auth.signInWithPassword({ email: await ask('Correo: '), password: await ask('Contraseña (oculta): ', true) });
if (signedIn.error) stop(`No se pudo iniciar sesión (${signedIn.error.code ?? signedIn.error.status}).`);
const profile = (await client.from('profiles').select('household_id').eq('user_id', signedIn.data.user.id).maybeSingle()).data;
if (!profile) { await client.auth.signOut(); stop('La cuenta no tiene un hogar asignado.'); }
const { data, error } = await client.from('fiorella_monthly_plans').select('income, applied_fixed_expense, plan_status').eq('household_id', profile.household_id);
await client.auth.signOut();
if (error) stop(`No se pudieron leer los meses (${error.code}).`);

const amount = value => value == null ? null : normalizeAmount(String(value));
const cap = FINANCIAL_RULES.fixedExpenseCap;
const months = data.map(row => ({ income: amount(row.income), fixed: amount(row.applied_fixed_expense), projected: row.plan_status === 'projected' }));
const count = (test, list = months) => list.filter(test).length;
const withoutFixed = months.filter(month => month.income !== null && month.fixed === null);
const different = months.filter(month => month.fixed !== null && compareAmounts(month.fixed, cap) !== 0);
console.log(JSON.stringify({
  meses: months.length,
  conIngresoSinGF: { total: withoutFixed.length, proyectados: count(month => month.projected, withoutFixed) },
  conGFDistintoDelTope: { total: different.length, proyectados: count(month => month.projected, different),
    conIngreso: count(month => month.income !== null, different) },
  conGFIgualAlTope: count(month => month.fixed !== null && compareAmounts(month.fixed, cap) === 0),
  sinIngresoNiGF: count(month => month.income === null && month.fixed === null),
}, null, 2));
