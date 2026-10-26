import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Linter } from 'eslint';
import { formatAmount, formatMoney, plural } from '../src/presentation/format.js';
import { controlMoney } from '../src/presentation/control.js';

test('one money format: S/ and US$, exact decimals, never a currency code before digits', () => {
  assert.equal(formatMoney('1234.56', 'PEN'), 'S/ 1,234.56');
  assert.equal(formatMoney('263.16', 'USD'), 'US$ 263.16');
  assert.equal(formatMoney('2868', 'PEN'), 'S/ 2,868.00');
  assert.equal(formatMoney('0.125', 'USD'), 'US$ 0.125');
  assert.equal(formatMoney('1234567'), 'S/ 1,234,567.00');
  assert.equal(formatMoney('-5', 'PEN'), '—');
  assert.equal(formatMoney(12, 'PEN'), '—');
  assert.equal(formatAmount('408'), 'S/ 408.00');
  assert.equal(controlMoney('744', 'PEN'), 'S/ 744.00');
  assert.equal(controlMoney('30.4', 'USD'), 'US$ 30.40');
  assert.equal(controlMoney('30.4', null), 'Importe o moneda pendiente');
});

test('plural forms are counted words, never "(s)"', () => {
  assert.equal(plural(1, 'gasto'), '1 gasto');
  assert.equal(plural(0, 'gasto'), '0 gastos');
  assert.equal(plural(3, 'movimiento'), '3 movimientos');
  assert.equal(plural(1, 'tarea'), '1 tarea');
  assert.equal(plural(4, 'tarea'), '4 tareas');
  assert.equal(plural(2, 'mes', 'meses'), '2 meses');
});

// Visible text only: JSX text and string/template literals of components and
// routes. Comments and regular expressions are not visited by construction.
function visibleTexts(file) {
  const texts = [];
  const linter = new Linter({ configType: 'flat' });
  const rule = { create: () => ({
    JSXText: node => texts.push(node.value),
    Literal: node => { if (typeof node.value === 'string' && !node.regex) texts.push(node.value); },
    TemplateElement: node => texts.push(node.value.cooked ?? ''),
  }) };
  const messages = linter.verify(readFileSync(file, 'utf8'), [{ files: ['**/*.js', '**/*.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { local: { rules: { texts: rule } } }, rules: { 'local/texts': 'error' } }], relative(process.cwd(), file));
  assert.deepEqual(messages.filter(message => message.fatal), [], file);
  return texts;
}
const sources = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? sources(path) : /\.jsx?$/.test(name) ? [path] : [];
});

test('components and routes show no "(s)" plurals nor "PEN 12"/"USD 12" amounts', () => {
  const offenders = [];
  let scanned = 0;
  for (const file of [...sources('src/components'), ...sources('src/routes')]) {
    const texts = visibleTexts(file);
    scanned += texts.length;
    for (const text of texts) if (/\(s\)|\b(PEN|USD) \d/.test(text)) offenders.push(`${file}: ${text.trim()}`);
  }
  assert.ok(scanned > 1000, 'the scan reads the sources');
  assert.deepEqual(offenders, []);
});

test('the visible-text scan reads JSX and literals but skips comments and regular expressions', () => {
  const texts = visibleTexts(new URL('./fixtures/visibleTextSample.jsx', import.meta.url).pathname);
  assert.ok(texts.some(text => text.includes('2 gastos')));
  assert.ok(texts.includes('US$ '));
  assert.ok(!texts.some(text => /\(s\)|PEN 1/.test(text)));
});
