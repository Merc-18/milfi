import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { APPROVED_ACCESS } from '../src/domain/access.js';
import { persistedFixture } from './helpers/persistedFixture.js';

test('saved data: dashboards, filters and goals render without demo labels and respect module access', { timeout: 120000 }, async context => {
  const data = await persistedFixture();
  const executable = await chromiumPath();
  const profile = await mkdtemp(join(tmpdir(), 'milfi-persisted-test-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await openBrowser(executable, profile);
    await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await browser.page('Page.navigate', { url: `${origin}/tests/harness/persisted.html` });
    await browser.waitFor('typeof window.mountMilfi === "function"');
    const mount = async (identity, path, period) => {
      await browser.evaluate(`window.mountMilfi(${JSON.stringify({ fixture: data, identity, access: APPROVED_ACCESS[identity], path, period })})`);
      await browser.waitFor('!!document.querySelector("h1") && !document.body.textContent.includes("Cargando")');
    };
    const text = () => browser.evaluate('document.body.textContent');
    // Saved-data screens in a real browser, served by a fake persistence.
    // Optional screenshots of invented data only, for visual review.
    const capture = async name => {
      if (!process.env.MILFI_CAPTURE_DIR) return;
      await mkdir(process.env.MILFI_CAPTURE_DIR, { recursive: true });
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      const { data } = await browser.page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: await browser.evaluate('document.querySelector("main").scrollHeight'), scale: 1 } });
      await writeFile(join(process.env.MILFI_CAPTURE_DIR, name), Buffer.from(data, 'base64'));
    };
    const fits = () => browser.evaluate('(() => { const main = document.querySelector("main"); return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth + 1; })()');

    await context.test('Fiorella dashboard: real month, planned vs deposited savings, monthly evolution', async () => {
      await mount('fiorella', '/fiorella', '2031-01');
      await browser.waitFor('!!document.querySelector("[data-testid=monthly-evolution]")');
      const body = await text();
      assert.doesNotMatch(body, /· demo|Demostración de esta sesión|Historial real aún no importado|Datos guardados en MilFi/);
      assert.ok(body.includes('S/ 3,000.00') && body.includes('Proyectado'), 'income and projected month in the evolution');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=savings-tracking]").textContent.includes("PEN 22.50")'), 'savings deposited in Control');
      assert.ok(await browser.evaluate('!!document.getElementById("monthly-income")'));
      assert.equal(await fits(), true);
      await capture('datos-01-panel-fiorella.png');
      await mount('fiorella', '/fiorella', '2031-03');
      assert.ok((await text()).includes('Mes proyectado'));
    });

    await context.test('Fiorella GV: loaded subcategory and notes, filters by category and text', async () => {
      await mount('fiorella', '/fiorella/gastos', '2031-02');
      await browser.waitFor('document.querySelectorAll("article").length === 2');
      assert.ok((await text()).includes('Cargado del Excel') && (await text()).includes('Nota inventada'));
      await browser.evaluate('(() => { const select = document.getElementById("gv-filter-category"); select.value = "salud"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("article").length === 1');
      await browser.evaluate('(() => { const select = document.getElementById("gv-filter-category"); select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); const input = document.getElementById("gv-filter-text"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "antojo"); input.dispatchEvent(new Event("input", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("article").length === 1 && document.querySelector("article").textContent.includes("Antojo")');
      assert.ok(await browser.evaluate('!!document.getElementById("gv-subcategory") && !!document.getElementById("gv-notes")'));
      assert.equal(await fits(), true);
    });

    await context.test('Gastos: GF and GV of the month together, NULL kept, projected months without spending', async () => {
      await mount('fiorella', '/fiorella/gastos', '2031-01');
      await browser.waitFor('!!document.querySelector("[data-testid=fixed-expenses]")');
      // January has GF actuals and no GV: the screen is not empty.
      assert.ok((await text()).includes('Sin gastos variables registrados'));
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent.includes("S/ 233.70")'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-fixed-id]").length'), 19);
      await mount('fiorella', '/fiorella/gastos', '2031-02');
      await browser.waitFor('document.querySelectorAll("article").length === 2');
      const summary = await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent');
      assert.ok(summary.includes('S/ 90.00') && summary.includes('S/ 32.30') && summary.includes('S/ 122.30') && summary.includes('parcial') && summary.includes('18/19'), summary);
      assert.ok(await browser.evaluate('document.querySelector("[data-fixed-id=servicios-luz]").textContent.includes("Sin registrar")'));
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Fijos").click()');
      await browser.waitFor('document.querySelector("[aria-label=\'Gastos variables\']").closest("[hidden]") !== null');
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Variables").click()');
      await browser.waitFor('document.querySelector("[data-testid=fixed-expenses]").closest("[hidden]") !== null');
      assert.equal(await fits(), true);
      await mount('fiorella', '/fiorella', '2031-02');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=expense-total]").textContent.includes("S/ 122.30")'));
      await mount('fiorella', '/fiorella/gastos', '2031-03');
      assert.ok((await text()).includes('Mes proyectado') && await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent.includes("Sin registrar")'));
    });

    await context.test('Fiorella history and goals: all months filterable; saved goal keeps its attributes', async () => {
      await mount('fiorella', '/fiorella/historial', '2031-02');
      // Opens on the selected month; every month is one filter away, paged.
      await browser.waitFor('document.querySelectorAll("[data-demo-period]").length === 1 && document.querySelector("[data-demo-period]").dataset.demoPeriod === "2031-02"');
      await browser.evaluate('(() => { const select = document.getElementById("history-month"); select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("[data-demo-period] article").length === 15 && document.body.textContent.includes("Ver más")');
      await browser.evaluate('(() => { const select = document.getElementById("history-kind"); select.value = "variable-expense"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("[data-demo-period]").length === 1');
      await mount('fiorella', '/fiorella/simulador', '2031-02');
      await browser.waitFor('!!document.querySelector("[data-testid=saved-goals]")');
      const goals = await browser.evaluate('document.querySelector("[data-testid=saved-goals]").textContent');
      assert.ok(goals.includes('Meta inventada') && goals.includes('Jun 2031') && goals.includes('S/ 300.00') && goals.includes('Notas de prueba'));
    });

    await context.test('Control: separate operations, pending outside totals, filters; Fiorella only reads', async () => {
      await mount('fiorella', '/control', '2031-01');
      await browser.waitFor('!!document.querySelector("[data-testid=control-summary]")');
      const summary = await browser.evaluate('document.querySelector("[data-testid=control-summary]").textContent');
      assert.ok(summary.includes('Depósitos para ahorro') && summary.includes('PEN 22.50') && summary.includes('pendientes de revisión'));
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=control-evolution]")'));
      assert.ok(await browser.evaluate('!document.getElementById("control-amount")') && !(await text()).includes('preimportación'));
      const cards = () => browser.evaluate('document.querySelectorAll("[data-ledger-id]").length');
      assert.equal(await cards(), 2);
      await browser.evaluate('(() => { const select = document.getElementById("control-status"); select.value = "pending"; select.dispatchEvent(new Event("change", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("[data-ledger-id]").length === 1');
      assert.equal(await fits(), true);
      await capture('datos-02-control.png');
    });

    await context.test('Milton reads Fiorella without forms and manages Control', async () => {
      await mount('milton', '/fiorella', '2031-02');
      await browser.waitFor('document.body.textContent.includes("Solo consulta")');
      assert.ok(await browser.evaluate('!document.getElementById("monthly-income")'));
      await mount('milton', '/fiorella/gastos', '2031-02');
      await browser.waitFor('!!document.querySelector("[data-testid=fixed-expenses]")');
      assert.ok(await browser.evaluate('!document.getElementById("gv-date") && !document.body.textContent.includes("Editar gasto fijo") && !document.body.textContent.includes("Registrar gasto variable") && document.body.textContent.includes("Solo consulta")'));
      await mount('milton', '/control', '2031-01');
      await browser.waitFor('!!document.getElementById("control-amount")');
      assert.deepEqual(browser.exceptions, []);
    });
  } finally {
    try { if (browser) await browser.close(); } finally {
      await server.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
});
