import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { APPROVED_ACCESS } from '../src/domain/access.js';
import { persistedFixture } from './helpers/persistedFixture.js';

// Every route at phone, tablet and desktop widths, with invented saved data:
// the document and <main> never scroll sideways (screen-reader tables included).
const ROUTES = ['/', '/fiorella', '/fiorella/gastos', '/fiorella/gastos?tipo=fijos', '/fiorella/metas', '/fiorella/historial',
  '/fiorella/configuracion', '/control', '/acceso'];
const WIDTHS = [320, 390, 768, 1280];

test('no route scrolls horizontally from 320 to 1280 px', { timeout: 180000 }, async () => {
  const data = await persistedFixture();
  const profile = await mkdtemp(join(tmpdir(), 'milfi-no-scroll-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen();
    browser = await openBrowser(await chromiumPath(), profile);
    await browser.page('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/harness/persisted.html` });
    await browser.waitFor('typeof window.mountMilfi === "function"');
    const failures = [];
    for (const path of ROUTES) {
      await browser.evaluate(`window.mountMilfi(${JSON.stringify({ fixture: data, identity: 'milton', access: APPROVED_ACCESS.milton,
        path, period: '2031-02' })})`);
      await browser.waitFor('!!document.querySelector("h1") && !document.body.textContent.includes("Cargando")');
      if (path === '/control') assert.ok(await browser.evaluate('document.querySelectorAll("figure table").length > 0'), 'charts with data tables');
      for (const width of WIDTHS) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
        const sizes = await browser.evaluate(`(() => { const root = document.documentElement; const main = document.querySelector('main');
          return { document: root.scrollWidth, viewport: root.clientWidth, main: main.scrollWidth, mainClient: main.clientWidth }; })()`);
        if (sizes.document > sizes.viewport || sizes.main > sizes.mainClient + 1) failures.push(`${path} @${width}: ${JSON.stringify(sizes)}`);
      }
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(browser.exceptions, []);
  } finally {
    if (browser) await browser.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
