import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// WCAG relative luminance from the @theme hex values, to keep text on traffic-light cards ≥ 4.5:1.
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const color = name => css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
const alias = name => css.match(new RegExp(`--color-semaforo-${name}:\\s*var\\(--color-([a-z-]+)\\)`))[1];
const luminance = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('traffic-light tokens are palette aliases and their card text keeps at least 4.5:1', () => {
  assert.deepEqual(['verde', 'amarillo', 'rojo', 'gris'].map(alias), ['exito', 'acento', 'excedido', 'secundario']);
  for (const light of ['verde', 'amarillo', 'gris']) {
    assert.ok(ratio(color('texto'), color(alias(light))) >= 4.5, light);
    assert.ok(ratio(color('texto-light'), color(alias(light))) < 4.5, `${light}: texto-light must not be used on it`);
  }
  assert.ok(ratio('#FFFFFF', color(alias('rojo'))) >= 4.5, 'white on rojo');
  assert.ok(ratio(color('texto'), color(alias('rojo'))) < 4.5, 'texto must not be used on rojo');
});
