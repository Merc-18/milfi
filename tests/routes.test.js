import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { calculateDistribution } from '../src/domain/distribution.js';

test('module routes render with real-history notices and no simulated financial totals', async () => {
  // JSX is transformed by the installed Vite. No browser, network listener,
  // private Excel, PWA build or additional testing dependency is required.
  const server = await createServer({
    configFile: false, envDir: new URL('./fixtures/no-env/', import.meta.url).pathname,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const renderPath = path => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes)));
    const expectations = [
      ['/', 'Finanzas de Fiorella'],
      ['/fiorella', 'Registra el ingreso del mes'],
      ['/fiorella/historial', 'Todavía no hay registros.'],
      ['/fiorella/configuracion', 'Configuración oficial'],
      // Presupuestos is the fixed view of Gastos (its redirect is checked in Chromium).
      ['/fiorella/gastos?tipo=fijos', 'Reservado para gastos fijos'],
      ['/fiorella/gastos', 'Ritmo del mes'],
      // Simulador and Calculadora redirect here (checked in Chromium).
      ['/fiorella/metas', 'Registra el ingreso del mes para estimar tus metas'],
      ['/control', 'Ahorro disponible'],
      // No Excel upload screen for end users: the history is loaded once, administratively.
      ['/control/preimportacion', 'Página no encontrada'],
      ['/not-a-page', 'Página no encontrada'],
    ];
    for (const [path, text] of expectations) {
      const html = renderPath(path);
      assert.ok(html.includes(text), path);
      assert.ok(html.includes('href="/fiorella"'), path);
      assert.ok(html.includes('href="/control"'), path);
      assert.doesNotMatch(html, /Gustos|Ropa|Abril 2026/);
      // One demo explanation, in the header badge; no repeated notices or suffixes.
      assert.equal((html.match(/data-testid="demo-mode"/g) ?? []).length, 1, path);
      // Build code in the header on every page, labelled with the commit.
      assert.ok(html.includes('data-testid="build-stamp"') && html.includes('Actualizado') && html.includes('data-testid="commit-version"'), path);
      // Control's inner texts are revised in a later phase; only its demo notice goes now.
      if (path.startsWith('/fiorella')) {
        assert.doesNotMatch(html, /Demostración de esta sesión|Historial real aún no importado|· sesión|· demo|de demostración/, path);
      }
      assert.doesNotMatch(html, /Demostración temporal/, path);
    }
    assert.ok(renderPath('/control').includes('S/ 0.00'));
    assert.ok(renderPath('/control').includes('data-contribution-person="milton"') && renderPath('/control').includes('data-contribution-person="fiorella"'));
    assert.doesNotMatch(renderPath('/control'), /solo Fiorella|únicamente Fiorella/);
    assert.ok(renderPath('/control').includes('Registrar movimiento'));
    assert.doesNotMatch(renderPath('/control'), /control-actor|control-source|control-operation/);
    assert.doesNotMatch(renderPath('/'), /S\/\s*[\d]/);
    const config = renderPath('/fiorella/configuracion');
    assert.ok(config.includes('Salud'));
    assert.ok(config.includes('Ocio'));
    assert.equal((config.match(/50% de variables/g) ?? []).length, 2);

    // Four Fiorella tabs; each stays current on the pages it opens.
    const fiorellaTabs = html => html.match(/<nav aria-label="Finanzas de Fiorella".*?<\/nav>/)[0];
    const current = html => [...fiorellaTabs(html).matchAll(/<a [^>]*aria-current="page"[^>]*href="([^"]+)"|<a [^>]*href="([^"]+)"[^>]*aria-current="page"/g)]
      .map(match => match[1] ?? match[2]);
    const tabs = fiorellaTabs(renderPath('/fiorella'));
    assert.deepEqual([...tabs.matchAll(/>([^<]+)<\/a>/g)].map(match => match[1]), ['Resumen', 'Gastos', 'Metas', 'Historial']);
    for (const [path, tab] of [['/fiorella', '/fiorella'], ['/fiorella/gastos', '/fiorella/gastos'], ['/fiorella/gastos?tipo=fijos', '/fiorella/gastos'],
      ['/fiorella/metas', '/fiorella/metas'], ['/fiorella/metas?simular', '/fiorella/metas'], ['/fiorella/historial', '/fiorella/historial']]) {
      assert.deepEqual(current(renderPath(path)), [tab], path);
    }
    assert.deepEqual(current(renderPath('/fiorella/configuracion')), []);
    // Gastos has two views from ?tipo= (variables by default) and no "Todos" filter.
    const viewOf = html => html.match(/role="tab" aria-selected="true"[^>]*>([^<]+)</)?.[1] ?? html.match(/aria-selected="true"[^>]*>([^<]+)</)[1];
    assert.equal(viewOf(renderPath('/fiorella/gastos')), 'Variables');
    assert.equal(viewOf(renderPath('/fiorella/gastos?tipo=fijos')), 'Fijos');
    assert.equal(viewOf(renderPath('/fiorella/gastos?tipo=otro')), 'Variables');
    assert.ok(renderPath('/fiorella/gastos?tipo=fijos').includes('data-testid="budget-groups"')
      && !renderPath('/fiorella/gastos?tipo=fijos').includes('data-testid="pace-chart"'));
    assert.doesNotMatch(renderPath('/fiorella/gastos'), />Todos</);
    assert.ok(renderPath('/fiorella/gastos').includes('Aún no hay gastos variables en'));
    // Metas: one page with "Nueva meta" and the "¿y si…?"; no scenarios, A/B or fractions.
    const goals = renderPath('/fiorella/metas');
    assert.ok(goals.includes('>Nueva meta<') && goals.includes('¿Y si…?') && goals.includes('Aún no tienes metas.'));
    assert.doesNotMatch(goals, /Escenario|Comparar alternativas|Proyección por periodos|fracción exacta|hipotétic/i);
    assert.doesNotMatch(renderPath('/fiorella/historial'), /Simulaciones de esta sesión/);
    assert.ok(renderPath('/fiorella').includes('href="/fiorella/metas"') && !renderPath('/fiorella').includes('/fiorella/simulador'));
    assert.ok(renderPath('/fiorella/historial').includes('aria-label="Reglas de Fiorella"'));

    // Visible spelling fixed; the official label (matched against the Excel) and the id stay.
    const fixedView = renderPath('/fiorella/gastos?tipo=fijos');
    assert.ok(fixedView.includes('Carbohidratos') && !fixedView.includes('Carbohidrados'));
    const { FIXED_SUBCATEGORIES } = await server.ssrLoadModule('/src/domain/fiorellaCategories.js');
    assert.equal(FIXED_SUBCATEGORIES.find(category => category.id === 'comida-carbohidrados').name, 'Carbohidrados');
    // The preimport screen was removed; nothing links to it.
    assert.ok(!renderPath('/control').includes('/control/preimportacion'));

    // Home: name, one line and one live figure per module, without "·" lists.
    const home = renderPath('/');
    for (const text of ['Te queda por gastar', 'Falta el ingreso del mes', 'Tareas pendientes']) assert.ok(home.includes(text), text);
    assert.doesNotMatch(home.match(/<main.*<\/main>/s)[0], / · /);

    // The summary answers "how am I doing" without the old KPI grid or details.
    const summary = renderPath('/fiorella');
    for (const id of ['remaining', 'distribution-chart', 'fixed-stat', 'variable-stat', 'savings-tracking', 'couple-savings-chart']) {
      assert.ok(summary.includes(`data-testid="${id}"`), id);
    }
    assert.doesNotMatch(summary, /data-testid="monthly-summary"|data-testid="monthly-evolution"|Sin registrar|<details/);
    assert.ok(summary.includes('href="/fiorella/gastos?tipo=fijos"') && !summary.includes('Registrar gasto'),
      'the summary links to Gastos without registering');
    assert.ok(!summary.includes('href="/fiorella/presupuestos"'), 'links go straight to the fixed view');
    // One "Registrar gasto", in the Gastos header (both views); no floating button anywhere.
    for (const path of ['/fiorella/gastos', '/fiorella/gastos?tipo=fijos']) {
      const html = renderPath(path);
      assert.equal((html.match(/>Registrar gasto</g) ?? []).length, 1, path);
      assert.match(html, /<header[^>]*>(?:(?!<\/header>).)*>Registrar gasto</s, path);
    }
    for (const path of ['/', '/fiorella', '/fiorella/metas', '/fiorella/historial', '/control']) assert.ok(!renderPath(path).includes('gastos?nuevo'), path);

    // Both modules use the same month switcher (the shared month is checked in Chromium).
    assert.ok(renderPath('/control').includes('aria-label="Mes anterior"'), 'Control uses the same month switcher');

    // The month form only asks for the income; a month saved with another GF says what will change.
    const { default: MonthlyForm } = await server.ssrLoadModule('/src/components/MonthlyForm.jsx');
    const monthlyForm = record => renderToStaticMarkup(createElement(MonthlyForm, { period: { year: 2041, month: 2 }, record }));
    assert.ok(!monthlyForm(null).includes('monthly-fixed') && monthlyForm(null).includes('monthly-income'));
    assert.ok(monthlyForm({ income: '4000', appliedFixedExpense: '1200' })
      .includes('Este mes tenía S/ 1,200.00 de GF aplicado; al guardar pasará a S/ 1,500.00.'));
    assert.ok(!monthlyForm({ income: '4000', appliedFixedExpense: '1500' }).includes('Este mes tenía'));

    const { default: DistributionDetails } = await server.ssrLoadModule('/src/components/DistributionDetails.jsx');
    const distribution = calculateDistribution({ income: '4000.01', fixedExpense: '1500' }).distribution;
    const html = renderToStaticMarkup(createElement(DistributionDetails, { distribution }));
    assert.ok(html.includes('1,000.004'));
    assert.ok(html.includes('600.0024'));
    assert.ok(html.includes('Salud'));
    assert.ok(html.includes('Ocio'));
  } finally {
    await server.close();
  }
});
