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
      ['/fiorella', 'Datos mensuales'],
      ['/fiorella/calculadora', 'Solo simulación'],
      ['/fiorella/historial', 'Todavía no hay registros.'],
      ['/fiorella/configuracion', 'Configuración oficial'],
      ['/fiorella/presupuestos', 'Presupuestos GF'],
      ['/fiorella/gastos', 'Gastos'],
      ['/fiorella/simulador', 'Escenarios hipotéticos'],
      ['/control', 'Historial real pendiente de importación'],
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
      // Control's inner texts are revised in a later phase; only its demo notice goes now.
      if (path.startsWith('/fiorella')) assert.doesNotMatch(html, /Demostración de esta sesión|Historial real aún no importado|· sesión|· demo|de demostración/, path);
      assert.doesNotMatch(html, /Demostración temporal/, path);
    }
    assert.doesNotMatch(renderPath('/control'), /S\/\s*[\d]/);
    assert.doesNotMatch(renderPath('/control'), /Aportes de Milton|solo Fiorella|únicamente Fiorella/);
    for (const field of ['aportante', 'destino', 'usuario que lo registra']) assert.ok(renderPath('/control').includes(field));
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
    for (const [path, tab] of [['/fiorella', '/fiorella'], ['/fiorella/gastos', '/fiorella/gastos'], ['/fiorella/presupuestos', '/fiorella/gastos'],
      ['/fiorella/simulador', '/fiorella/simulador'], ['/fiorella/calculadora', '/fiorella/simulador'], ['/fiorella/historial', '/fiorella/historial']]) {
      assert.deepEqual(current(renderPath(path)), [tab], path);
    }
    assert.deepEqual(current(renderPath('/fiorella/configuracion')), []);
    assert.ok(renderPath('/fiorella/gastos').includes('href="/fiorella/presupuestos"'));
    assert.ok(renderPath('/fiorella/simulador').includes('href="/fiorella/calculadora"'));
    assert.ok(renderPath('/fiorella/historial').includes('aria-label="Reglas de Fiorella"'));

    // Both modules use the same month switcher (the shared month is checked in Chromium).
    assert.ok(renderPath('/control').includes('aria-label="Mes anterior"'), 'Control uses the same month switcher');

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
