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
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const renderPath = path => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes)));
    const expectations = [
      ['/', 'Finanzas de Fiorella'],
      ['/fiorella', 'Historial real aún no importado'],
      ['/fiorella/calculadora', 'Solo simulación'],
      ['/fiorella/historial', 'Historial real aún no importado'],
      ['/fiorella/configuracion', 'Configuración oficial'],
      ['/control', 'Historial real pendiente de importación'],
      ['/not-a-page', 'Página no encontrada'],
    ];
    for (const [path, text] of expectations) {
      const html = renderPath(path);
      assert.ok(html.includes(text), path);
      assert.ok(html.includes('href="/fiorella"'), path);
      assert.ok(html.includes('href="/control"'), path);
      assert.doesNotMatch(html, /Gustos|Ropa|Abril 2026/);
    }
    assert.doesNotMatch(renderPath('/control'), /S\/\s*[\d]/);
    assert.doesNotMatch(renderPath('/control'), /Aportes de Milton|solo Fiorella|únicamente Fiorella/);
    for (const field of ['aportante', 'destino', 'usuario que lo registra']) assert.ok(renderPath('/control').includes(field));
    assert.doesNotMatch(renderPath('/'), /S\/\s*[\d]/);
    const config = renderPath('/fiorella/configuracion');
    assert.ok(config.includes('Salud'));
    assert.ok(config.includes('Ocio'));
    assert.equal((config.match(/50% de variables/g) ?? []).length, 2);

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
