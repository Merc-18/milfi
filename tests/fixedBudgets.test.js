import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { budgetGroups } from '../src/presentation/fixedBudgets.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { gfBudgetFixture } from './helpers/gfBudgetFixture.js';

test('GF category coverage preserves null, zero, exact decimals and incomplete comparisons', () => {
  const data = gfBudgetFixture();
  const summary = summarizeFiorella(data.fiorella.records, { year: 2038, month: 4 }, 'real');
  const groups = budgetGroups(summary);
  assert.equal(groups.length, 5);
  assert.equal(groups.flatMap(group => group.rows).length, 19);
  const services = groups[0];
  assert.deepEqual([services.expected, services.budgetRegistered, services.actualRegistered, services.complete], [6, 5, 5, false]);
  assert.deepEqual([services.budget, services.actual, services.comparison.status], ['300', '166.505', 'unavailable']);
  assert.equal(services.rows[1].record.actualAmount, '0');
  assert.equal(services.rows[4].record.actualAmount, null);
  assert.deepEqual(groups[1].comparison, { status: 'remaining', amount: '85.5' });
  assert.equal(summary.fixedComparison.status, 'unavailable');
  const complete = summarizeFiorella(data.fiorella.records, { year: 2038, month: 5 }, 'real');
  assert.deepEqual(complete.fixedComparison, { status: 'remaining', amount: '19.19' });
  assert.ok(budgetGroups(complete).every(group => group.complete && group.actual === '0'));
  const equal = structuredClone(complete);
  equal.fixed.find(record => record.categoryId === 'otros-otros').budgetAmount = '0';
  assert.deepEqual(budgetGroups(equal).at(-1).comparison, { status: 'equal', amount: '0' });
  equal.fixed.find(record => record.categoryId === 'otros-otros').actualAmount = '1.005';
  assert.deepEqual(budgetGroups(equal).at(-1).comparison, { status: 'over', amount: '1.005' });
  assert.ok(budgetGroups(summarizeFiorella([], { year: 2038, month: 6 }, 'real')).every(group => !group.complete && group.actual === null && group.budget === null));
});

test('GF fixed view renders 5 groups and 19 rows with inline editors; open groups need attention; Milton only reads', async () => {
  const server = await createServer({ configFile: false, envDir: new URL('./fixtures/no-env/', import.meta.url).pathname,
    logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { default: View } = await server.ssrLoadModule('/src/routes/GastosGV.jsx');
    const { SessionViewContext } = await server.ssrLoadModule('/src/presentation/moduleAccess.js');
    const render = level => renderToStaticMarkup(createElement(SessionViewContext.Provider, { value: { mode: 'auth', access: { fiorella: level } } },
      createElement(MemoryRouter, { initialEntries: ['/fiorella/gastos?tipo=fijos'] }, createElement(View))));
    const html = render('manage');
    assert.equal((html.match(/data-budget-id=/g) ?? []).length, 19);
    assert.equal((html.match(/aria-label="Editar /g) ?? []).length, 19);
    for (const name of ['Servicios', 'Transporte', 'Comida', 'Bienestar', 'Otros']) assert.ok(html.includes(`>${name}</span>`), name);
    // Nothing registered yet: every group needs attention, so all of them start open.
    assert.equal((html.match(/aria-expanded="true" aria-controls="gf-rows-/g) ?? []).length, 5);
    assert.doesNotMatch(html, /<form|<progress|>Ayuda</);
    assert.ok(html.includes('data-testid="budget-totals"') && html.includes('Reservado para gastos fijos') && html.includes('Presupuesto detallado'));
    assert.ok(html.includes('Sin registrar') && html.includes('Cobertura parcial'));
    assert.ok(html.includes('<table class="sr-only">'), 'the bullet chart has an equivalent table');
    const read = render('read');
    assert.equal((read.match(/data-budget-id=/g) ?? []).length, 19);
    assert.doesNotMatch(read, /aria-label="Editar |<form|Copiar presupuestos/);
    assert.equal((read.match(/Solo consulta/g) ?? []).length, 1);
  } finally { await server.close(); }
});
