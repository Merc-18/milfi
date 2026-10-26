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
import { fixedClockScript } from './helpers/clock.js';

test('saved data: dashboards, filters and goals render without demo labels and respect module access', { timeout: 120000 }, async context => {
  const data = await persistedFixture();
  const executable = await chromiumPath();
  const profile = await mkdtemp(join(tmpdir(), 'milfi-persisted-test-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await openBrowser(executable, profile);
    await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    // Invented data live in 2031: the page's today is 15 March 2031.
    await browser.page('Page.addScriptToEvaluateOnNewDocument', { source: fixedClockScript('2031-03-15T12:00:00-05:00') });
    await browser.page('Page.navigate', { url: `${origin}/tests/harness/persisted.html` });
    await browser.waitFor('typeof window.mountMilfi === "function"');
    const mount = async (identity, path, period, fixture = data) => {
      await browser.evaluate(`window.mountMilfi(${JSON.stringify({ fixture, identity, access: APPROVED_ACCESS[identity], path, period })})`);
      await browser.waitFor('!!document.querySelector("h1") && !document.body.textContent.includes("Cargando")');
    };
    const text = () => browser.evaluate('document.body.textContent');
    // Saved-data screens in a real browser, served by a fake persistence.
    // Optional screenshots of invented data only, for visual review.
    const capture = async name => {
      if (!process.env.MILFI_CAPTURE_DIR) return;
      await mkdir(process.env.MILFI_CAPTURE_DIR, { recursive: true });
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      const { data } = await browser.page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 390, height: await browser.evaluate('document.querySelector("main").scrollHeight'), scale: 1 } });
      await writeFile(join(process.env.MILFI_CAPTURE_DIR, name), Buffer.from(data, 'base64'));
    };
    const fits = () => browser.evaluate('(() => { const main = document.querySelector("main"); ' +
      'return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth + 1; })()');

    await context.test('Fiorella dashboard: real month, planned vs deposited savings, monthly evolution', async () => {
      await mount('fiorella', '/fiorella', '2031-01');
      await browser.waitFor('!!document.querySelector("[data-testid=savings-tracking]")');
      const body = await text();
      assert.doesNotMatch(body, /· demo|Demostración de esta sesión|Historial real aún no importado|Datos guardados en MilFi|Modo demo/);
      assert.ok(body.includes('S/ 3,000.00'), 'income of the month');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=savings-tracking]").textContent' +
        '.includes("Sin depósitos asignados")'), 'savings deposited in Control');
      assert.ok(await browser.evaluate('!!document.querySelector("[aria-label=\'Editar ingreso del mes\']")'));
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=couple-savings-chart] svg[role=img]")'));
      assert.equal(await fits(), true);
      await capture('datos-01-panel-fiorella.png');
      const savingsCard = () => browser.evaluate('document.querySelector("[data-testid=savings-tracking]").textContent');
      assert.ok((await savingsCard()).includes('Pendiente'), 'January is past: its plan is pending');
      await mount('fiorella', '/fiorella', '2031-03');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=remaining]").textContent.includes("Proyectado")'));
      // Today is March 2031: March's couple savings are deposited in April, not late.
      assert.ok((await savingsCard()).includes('Se deposita en abril') && !(await savingsCard()).includes('Pendiente'), await savingsCard());
      assert.equal(await browser.evaluate('document.querySelector("[data-testid=savings-tracking]").dataset.light'), 'neutral');
      // The month-by-month table now lives in Historial.
      await mount('fiorella', '/fiorella/historial', '2031-01');
      const evolution = await browser.evaluate('document.querySelector("[data-testid=monthly-evolution]").textContent');
      assert.ok(evolution.includes('S/ 3,000.00') && evolution.includes('Proyectado'), 'income and projected month in the evolution');
    });

    await context.test('Fiorella GV: loaded subcategory and notes, filters by category and text', async () => {
      await mount('fiorella', '/fiorella/gastos', '2031-02');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 2');
      // Provenance, revision and notes are shown only in the edit sheet.
      assert.doesNotMatch(await text(), /Cargado del Excel|Revisión \d/);
      const details = [];
      for (const index of [0, 1]) {
        await browser.evaluate(`document.querySelectorAll("[data-expense-id] button")[${index}].click()`);
        await browser.waitFor('!!document.querySelector("dialog[open] #gv-notes")');
        details.push(await browser.evaluate('({ source: document.querySelector("dialog[open] [data-testid=expense-source]").textContent, ' +
          'notes: document.getElementById("gv-notes").value, subcategory: document.getElementById("gv-subcategory").value })'));
        await browser.evaluate('document.querySelector("dialog[open] button[aria-label=Cerrar]").click()');
        await browser.waitFor('!document.querySelector("dialog[open]")');
      }
      assert.ok(details.some(item => item.source.includes('Cargado del Excel')), JSON.stringify(details));
      assert.ok(details.some(item => item.notes === 'Nota inventada'), JSON.stringify(details));
      const chip = name => browser.evaluate(`Array.from(document.querySelectorAll("[aria-label=Categoría] button"))` +
        `.find(button => button.textContent === ${JSON.stringify(name)}).click()`);
      await chip('Salud');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 1');
      await chip('Todas');
      await browser.evaluate('(() => { const input = document.getElementById("gv-filter-text"); ' +
        'Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "antojo"); ' +
        'input.dispatchEvent(new Event("input", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 1 ' +
        '&& document.querySelector("[data-expense-id]").textContent.includes("Antojo")');
      assert.equal(await fits(), true);
    });

    await context.test('Gastos: GF and GV of the month together, NULL kept, projected months without spending', async () => {
      await mount('fiorella', '/fiorella/gastos?tipo=fijos', '2031-01');
      await browser.waitFor('!!document.querySelector("[data-testid=fixed-expenses]")');
      // January has GF actuals and no GV: the total is not empty.
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent.includes("S/ 233.70")'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-fixed-id]").length'), 19);
      await mount('fiorella', '/fiorella/gastos', '2031-01');
      assert.ok((await text()).includes('Aún no hay gastos variables en enero de 2031'));
      await mount('fiorella', '/fiorella/gastos', '2031-02');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 2');
      const summary = await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent');
      assert.ok(summary.includes('S/ 122.30') && summary.includes('Parcial'), summary);
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=pace-chart] svg[role=img]") ' +
        '&& !document.querySelector("[data-testid=fixed-expenses]")'));
      // Keyboard on the tabs: arrows move between the two views.
      await browser.evaluate('document.getElementById("gastos-tab-variables").focus()');
      await browser.page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      await browser.waitFor('document.getElementById("gastos-tab-fijos").getAttribute("aria-selected") === "true" ' +
        '&& document.activeElement.id === "gastos-tab-fijos"');
      const totals = await browser.evaluate('document.querySelector("[data-testid=budget-totals]").textContent');
      assert.ok(totals.includes('S/ 90.00') && totals.includes('18/19 subcategorías con gasto'), totals);
      assert.ok(await browser.evaluate('/sin registrar/i.test(document.querySelector("[data-fixed-id=servicios-luz]").textContent)'));
      assert.equal(await fits(), true);
      await mount('fiorella', '/fiorella', '2031-02');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=fixed-stat]").textContent.includes("S/ 90.00")'));
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=variable-stat]").textContent.includes("S/ 32.30")'));
      await mount('fiorella', '/fiorella/gastos', '2031-03');
      const projected = await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent');
      assert.ok(projected.includes('Proyectado') && projected.includes('S/ 0.00'), projected);
    });

    await context.test('Fiorella history and goals: all months filterable; saved goal keeps its attributes', async () => {
      await mount('fiorella', '/fiorella/historial', '2031-02');
      // Opens on the selected month; every month is one filter away, paged.
      await browser.waitFor('document.querySelectorAll("[data-demo-period]").length === 1 ' +
        '&& document.querySelector("[data-demo-period]").dataset.demoPeriod === "2031-02"');
      await browser.evaluate('(() => { const select = document.getElementById("history-month"); select.value = "all"; ' +
        'select.dispatchEvent(new Event("change", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("[data-demo-period] article").length === 15 && document.body.textContent.includes("Ver más")');
      await browser.evaluate('(() => { const select = document.getElementById("history-kind"); select.value = "variable-expense"; ' +
        'select.dispatchEvent(new Event("change", { bubbles: true })); })()');
      await browser.waitFor('document.querySelectorAll("[data-demo-period]").length === 1');
      // Workbook goals in Metas: one list, read-only, finished ones folded; deadline and notes in the detail.
      const finished = structuredClone(data);
      finished.fiorella.goals.push({ ...structuredClone(data.fiorella.goals[0]), id: crypto.randomUUID(),
        title: 'Meta lograda inventada', status: 'achieved' });
      await mount('fiorella', '/fiorella/metas', '2031-02', finished);
      await browser.waitFor('!!document.querySelector("[data-testid=goal-list] [data-goal-id]")');
      const goals = await browser.evaluate('document.querySelector("[data-testid=goal-list]").textContent');
      assert.ok(goals.includes('Meta inventada') && goals.includes('S/ 900.00') && goals.includes('Necesitas S/ 300.00 al mes'), goals);
      assert.doesNotMatch(goals, /Del Excel|Activa|Lograda inventada/);
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=finished-goals]").textContent')).includes('Meta lograda inventada'));
      assert.equal(await browser.evaluate('document.querySelector("[data-testid=finished-goals]").open'), false);
      await browser.evaluate('document.querySelector("[data-testid=goal-list] [data-goal-id] button").click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=goal-detail]")');
      const detail = await browser.evaluate('document.querySelector("dialog[open]").textContent');
      assert.ok(detail.includes('Fecha límite: Jun 2031') && detail.includes('Notas de prueba') && detail.includes('Del Excel de Fiorella'), detail);
      // Only the workbook's own deadline is a date; the term is a count of months.
      assert.ok(detail.includes('para lograrla en 3 meses') && detail.includes('Plazo: 3 meses') && !detail.includes('para terminar en'), detail);
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("dialog[open] button"))' +
        '.some(button => button.textContent === "Editar")'), false);
      assert.equal(await fits(), true);
    });

    await context.test('Control: separate operations, pending outside totals, filters; Fiorella only reads', async () => {
      await mount('fiorella', '/control', '2031-01');
      await browser.waitFor('!!document.querySelector("[data-testid=control-balance]")');
      const summary = await browser.evaluate('document.querySelector("[data-testid=control-balance]").textContent');
      assert.ok(summary.includes('S/ 22.50') && summary.includes('Según lo registrado y revisado'));
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-tasks]").textContent')).includes('por confirmar'));
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=balance-chart]")'));
      const table = await browser.evaluate(`({
        heads: Array.from(document.querySelectorAll('[data-testid=control-monthly] thead th')).map(cell => cell.textContent),
        note: document.querySelector('[data-testid=control-monthly] p').textContent,
        months: Array.from(document.querySelectorAll('[data-testid=control-monthly] tbody tr')).map(row => row.dataset.month),
      })`);
      assert.deepEqual(table.heads, ['Mes', 'Gastos (Milton)', 'Ahorro (Fiorella)', 'Plan del mes anterior', 'Estado', 'Retiros']);
      assert.equal(table.note, 'El ahorro de cada plan se deposita al mes siguiente.');
      // 2031 is after today's month: plan-only receipt months there are not listed empty.
      assert.equal(table.months.includes('2031-04'), false, JSON.stringify(table.months));
      assert.ok(await browser.evaluate('!document.getElementById("control-amount")') && !(await text()).includes('preimportación'));
      const cards = () => browser.evaluate('document.querySelectorAll("[data-ledger-id]").length');
      assert.equal(await cards(), 2);
      await browser.evaluate('document.getElementById("movement-history").click()');
      await browser.waitFor('document.querySelectorAll("[data-ledger-id]").length > 2');
      await browser.evaluate('document.getElementById("movement-history").click()');
      assert.equal(await fits(), true);
      await capture('datos-02-control.png');
    });

    await context.test('imported dollar suggestion needs confirmation, plan assignment preserves imported status and updates the light', async () => {
      await mount('milton', '/control', '2031-01');
      const fill = async (id, value) => browser.evaluate(`(() => { const el = document.getElementById('${id}'); ` +
        `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); ` +
        `el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const click = async label => browser.evaluate(`Array.from(document.querySelectorAll('button'))` +
        `.find(button => button.textContent === ${JSON.stringify(label)}).click()`);
      const openTasks = () => browser.evaluate('document.querySelector("[data-testid=control-tasks] button[aria-expanded=false]")?.click()');
      // Synthetic savings row imported as prepared, with no plan month yet.
      await openTasks();
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-assign-id]')).find(row => row.textContent.includes('22.50'))` +
        `.querySelector('button').click()`);
      await browser.waitFor('!!document.getElementById("assign-plan")');
      await fill('assign-plan', '2031-01'); await click('Confirmar asignación');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      const february = await browser.evaluate(`Array.from(document.querySelectorAll('[data-testid=control-monthly] tbody tr'))` +
        `.find(row => row.dataset.month === '2031-02').textContent`);
      assert.ok(february.includes('22.50') && february.includes('Parcial') && february.includes('(plan de enero)'), february);
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-ledger-id] button')).find(button => button.textContent.includes('22.50')).click()`);
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=movement-detail]")');
      await click('Cambiar mes del plan'); await browser.waitFor('!!document.getElementById("review-plan")');
      assert.equal(await browser.evaluate('document.getElementById("review-plan").value'), '2031-01');
      await fill('review-plan', '2031-02'); await click('Guardar mes del plan');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await browser.evaluate(`document.querySelector('[data-testid=control-monthly] [data-month="2031-03"] [data-light]')` +
        `.dataset.light`), 'amarillo');
      assert.equal(await browser.evaluate(`document.querySelector('[data-testid=control-monthly] [data-month="2031-02"] [data-light]').dataset.light`), 'gris');
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-balance]").textContent')).includes('S/ 22.50'));
      await openTasks();
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-review-id]'))` +
        `.find(row => row.textContent.includes('confirma el importe en US$')).querySelector('button').click()`);
      await browser.waitFor('!!document.getElementById("review-amount")');
      assert.equal(await browser.evaluate('document.getElementById("review-amount").value'), '7.5');
      // The old fixture decided PEN for every value; the owner template tested elsewhere leaves this blank.
      await fill('review-reference', 'Extracto inventado');
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-balance]").textContent')).includes('S/ 22.50'),
        'opening the suggestion cannot change totals');
      await browser.evaluate('document.getElementById("review-rejected").click()');
      await fill('review-reason', 'No corresponde: prueba inventada'); await click('Rechazar');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('[data-review-id]'))` +
        `.some(row => row.textContent.includes('confirma el importe en US$'))`), false);
      // Another invented withdrawal has no source date: both date and period can be completed.
      await openTasks();
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-review-id]'))` +
        `.find(row => row.textContent.includes('Falta la fecha del retiro')).querySelector('button').click()`);
      await browser.waitFor('!!document.getElementById("review-date")');
      await fill('review-date', '2031-02-20'); await fill('review-period', '2031-02');
      await fill('review-reference', 'Voucher inventado con fecha'); await click('Aceptar');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-balance]").textContent')).includes('S/ 19.50'));
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('Milton reads Fiorella without forms and manages Control', async () => {
      await mount('milton', '/fiorella', '2031-02');
      await browser.waitFor('document.body.textContent.includes("Solo consulta")');
      assert.ok(await browser.evaluate('!document.getElementById("monthly-income") && !document.querySelector("[aria-label=\'Editar ingreso del mes\']")'));
      await mount('milton', '/fiorella/gastos', '2031-02');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 2');
      assert.ok(await browser.evaluate('!document.querySelector("[data-expense-id] button") && !document.getElementById("gv-date") ' +
        '&& document.body.textContent.includes("Solo consulta")'));
      assert.ok(await browser.evaluate('!Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Registrar gasto") ' +
        '&& !document.querySelector(\'a[href="/fiorella/gastos?nuevo"]\')'));
      await mount('milton', '/fiorella/gastos?tipo=fijos', '2031-02');
      await browser.waitFor('!!document.querySelector("[data-testid=fixed-expenses]")');
      assert.ok(await browser.evaluate('!document.querySelector("[data-budget-id] button") && !document.body.textContent.includes("Copiar presupuestos")'));
      await mount('milton', '/fiorella/metas', '2031-02');
      await browser.waitFor('!!document.querySelector("[data-goal-id]")');
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button"))' +
        '.some(button => ["Nueva meta", "Editar", "Eliminar"].includes(button.textContent))'), false);
      await browser.evaluate('document.querySelector("[data-goal-id] button").click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=goal-detail]")');
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("dialog[open] button"))' +
        '.some(button => ["Editar", "Eliminar"].includes(button.textContent))'), false);
      await mount('milton', '/control', '2031-01');
      await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Registrar movimiento').click()`);
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
