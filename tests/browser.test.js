import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { preview } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';

test('browser regression: redirects, simulation history and financial isolation', { timeout: 90000 }, async context => {
  const executable = await chromiumPath();
  const profile = await mkdtemp(join(tmpdir(), 'milfi-browser-test-'));
  let app;
  let browser;
  try {
    app = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    const origin = `http://127.0.0.1:${app.httpServer.address().port}`;
    browser = await openBrowser(executable, profile);
    const navigate = async (path, heading) => {
      await browser.page('Page.navigate', { url: origin + path });
      await browser.waitFor(`location.pathname + location.search === ${JSON.stringify(path)} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
    };
    const clickLink = async (path, heading) => {
      await browser.evaluate(`document.querySelector('a[href="${path}"]').click()`);
      await browser.waitFor(`location.pathname + location.search === ${JSON.stringify(path)} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
    };
    // Calculadora and Presupuestos left the tab bar: they open from Metas and Gastos.
    const openCalculator = async () => { await clickLink('/fiorella/simulador', 'Simulador y metas'); await clickLink('/fiorella/calculadora', 'Simular distribución'); };
    // Budgets are the fixed view of Gastos.
    const openBudgets = async () => {
      await clickLink('/fiorella/gastos', 'Gastos');
      await browser.evaluate('document.getElementById("gastos-tab-fijos").click()');
      await browser.waitFor('location.search === "?tipo=fijos" && document.querySelectorAll("[data-budget-id]").length === 19');
    };
    const editBudget = async categoryId => {
      await browser.evaluate(`document.querySelector('[data-budget-id="${categoryId}"] button').click()`);
      await browser.waitFor(`!!document.getElementById("budget-${categoryId}")`);
    };
    const fill = async (id, value) => {
      if (/^(budget|actual)-/.test(id) && !await browser.evaluate(`!!document.getElementById(${JSON.stringify(id)})`)) {
        await editBudget(id.replace(/^(budget|actual)-/, ''));
      }
      await browser.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    };

    await context.test('all four legacy routes redirect with replacement rather than trapping Back', async () => {
      const aliases = [
        ['/calculadora', '/fiorella/calculadora', 'Simular distribución'],
        ['/historial', '/fiorella/historial', 'Historial'],
        ['/configuracion', '/fiorella/configuracion', 'Configuración oficial'],
        ['/fondo-comun', '/control', 'Control Finanzas M&F'],
      ];
      for (const [oldPath, target, heading] of aliases) {
        await navigate('/', 'MilFi');
        await browser.page('Page.navigate', { url: origin + oldPath });
        await browser.waitFor(`location.pathname === ${JSON.stringify(target)} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
        await browser.evaluate('history.back()');
        await browser.waitFor('location.pathname === "/" && document.querySelector("h1")?.textContent.includes("MilFi")');
      }
    });

    await context.test('saving two scenarios preserves both across in-app navigation without creating a Control balance', async () => {
      await navigate('/fiorella/calculadora', 'Simular distribución');
      for (const income of ['4000.01', '5000']) {
        await fill('simulation-period', '2032-05');
        await fill('simulation-income', income);
        await browser.waitFor('Array.from(document.querySelectorAll("button")).some(button => button.textContent.includes("Guardar simulación"))');
        if (income === '4000.01') assert.ok(await browser.evaluate('document.body.textContent.includes("600.0024")'));
        await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.includes("Guardar simulación")).click()');
        await browser.waitFor('location.pathname === "/fiorella/historial" && !!document.querySelector("details")');
        await clickLink('/control', 'Control Finanzas M&F');
        const control = await browser.evaluate('document.body.textContent');
        assert.doesNotMatch(control, /S\/\s*\d|4,000\.01|600\.0024|Aportes de Milton/);
        assert.ok(control.includes('no hay un saldo confirmado'));
        await clickLink('/fiorella', 'Resumen');
        await clickLink('/fiorella/historial', 'Historial');
        if (income === '4000.01') await openCalculator();
      }
      assert.equal(await browser.evaluate('document.querySelectorAll("details").length'), 2);
      await browser.evaluate('document.querySelector("summary").click()');
      assert.equal(await browser.evaluate('document.querySelector("details").open'), true);
    });

    await context.test('deficit and zero-surplus operations stay blocked with no extra history', async () => {
      await openCalculator();
      for (const income of ['1000', '1500']) {
        await fill('simulation-income', income);
        await browser.waitFor('document.body.textContent.includes("Tratamiento pendiente de aprobación")');
        assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button")).some(button => button.textContent.includes("Guardar simulación"))'), false);
      }
      await clickLink('/fiorella/historial', 'Historial');
      assert.equal(await browser.evaluate('document.querySelectorAll("details").length'), 2);
    });

    await context.test('reload clears only session scenarios and still reports real history as not imported', async () => {
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Todavía no guardaste simulaciones")');
      assert.equal(await browser.evaluate('document.querySelectorAll("details").length'), 0);
      // The demo is explained once, by the header badge.
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=demo-mode]")?.textContent === "Modo demo"'));
      await clickLink('/control', 'Control Finanzas M&F');
      assert.ok(await browser.evaluate('document.body.textContent.includes("no hay un saldo confirmado")'));
      assert.deepEqual(browser.exceptions, []);
    });

    const captures = process.env.MILFI_CAPTURE_DIR ?? join(tmpdir(), 'milfi-fase3-2-capturas');
    const capture = async name => {
      await mkdir(captures, { recursive: true });
      await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const { data } = await browser.page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(captures, name), Buffer.from(data, 'base64'));
    };
    const submitForm = label => browser.evaluate(`document.querySelector('form[aria-label="${label}"]').requestSubmit()`);
    const visibleText = () => browser.evaluate('document.body.textContent');
    // The month's income and applied GF are edited in a sheet opened from the summary.
    const openMonthly = async () => {
      await browser.evaluate('document.querySelector("[data-testid=remaining] button").click()');
      await browser.waitFor('!!document.querySelector("dialog[open] #monthly-income")');
    };
    const closeSheet = async () => {
      await browser.evaluate('document.querySelector("dialog[open] button[aria-label=Cerrar]").click()');
      await browser.waitFor('!document.querySelector("dialog[open]")');
    };
    const testText = id => browser.evaluate(`document.querySelector("[data-testid=${id}]").textContent`);

    await context.test('Fiorella monthly demo separates applied GF, detailed budgets and recorded actuals across periods', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await navigate('/fiorella', 'Resumen');
      // Without data the summary states the missing step as an action.
      assert.ok((await testText('remaining')).includes('Registra el ingreso del mes'));
      assert.ok((await testText('distribution-chart')).includes('Registra el ingreso del mes'));
      await fill('fiorella-period', '2038-04');
      await openMonthly();
      await fill('monthly-income', '5432.01');
      await submitForm('Datos mensuales');
      await browser.waitFor('document.querySelector("[data-testid=remaining]").textContent.includes("Registra el GF aplicado")');
      await fill('monthly-fixed', '1500'); await submitForm('Datos mensuales');
      // GV 40 % of 3,932.01 = 1,572.804, plus the applied GF 1,500 with no GF actual yet.
      await browser.waitFor('document.querySelector("[data-testid=remaining]").textContent.includes("S/ 3,072.804")');
      assert.ok(await browser.evaluate('document.querySelector("form[aria-label=\'Datos mensuales\'] [role=status]").textContent === "Guardado."'));
      await closeSheet();
      assert.ok((await testText('remaining')).includes('Vas bien') && (await testText('remaining')).includes('S/ 5,432.01'));
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Ver detalle").click()');
      await browser.waitFor('document.querySelector("dialog[open]")?.textContent.includes("786.402")');
      await closeSheet();
      await fill('fiorella-period', '2038-05');
      await openMonthly();
      assert.equal(await browser.evaluate('document.getElementById("monthly-income").value'), '');
      await closeSheet();
      await fill('fiorella-period', '2038-04');
      await openMonthly();
      assert.equal(await browser.evaluate('document.getElementById("monthly-income").value'), '5432.01');
      await closeSheet();
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('01-resumen-movil.png');
      await clickLink('/fiorella/gastos?tipo=fijos', 'Gastos');
      await fill('budget-servicios-gas', '120.10'); await fill('actual-servicios-gas', '125.20');
      await submitForm('Presupuesto servicios-gas');
      await browser.waitFor('document.body.textContent.includes("S/ 5.10")');
      await fill('actual-servicios-gas', '110.05'); await submitForm('Presupuesto servicios-gas');
      await browser.waitFor('document.body.textContent.includes("S/ 10.05")');
      // The three GF figures are explained once, with the applied GF as "reserved".
      assert.ok((await testText('budget-totals')).includes('Reservado (GF aplicado)') && (await testText('budget-totals')).includes('S/ 1,500.00'));
      assert.doesNotMatch(await visibleText(), />?Ayuda</);
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('02-presupuestos-movil.png');
      await editBudget('servicios-gas');
      await browser.evaluate('document.querySelector("form").scrollIntoView({block:"start"})');
      await capture('06-formulario-gf-movil.png');
    });

    await context.test('Fiorella GV accumulates, edits and handles duplicate-looking demos without redistribution', async () => {
      await clickLink('/fiorella/gastos', 'Gastos');
      await browser.waitFor('document.getElementById("gastos-tab-variables")?.getAttribute("aria-selected") === "true"');
      // The GF actual saved in the fixed view counts in the page total at once, although there is no GV yet.
      assert.ok((await testText('expense-summary')).includes('S/ 110.05') && (await testText('expense-summary')).includes('Parcial'));
      assert.ok((await visibleText()).includes('Aún no hay gastos variables en abril de 2038'));
      // April 2038 has not started: the pace sentence speaks in the future.
      assert.equal(await testText('pace-phrase'), 'Este mes aún no empieza: tendrás S/ 1,572.804 para 30 días.');
      const rows = () => browser.evaluate('document.querySelectorAll("[data-expense-id]").length');
      const openNew = async () => {
        await browser.waitFor('!document.querySelector("dialog[open]")');
        await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Registrar gasto").click()');
        await browser.waitFor('!!document.querySelector("dialog[open] #gv-amount") && document.activeElement?.id === "gv-amount"');
      };
      const expense = async (description, amount, category = 'salud', date = '2038-04-09') => {
        await openNew();
        await fill('gv-amount', amount);
        await browser.evaluate(`document.getElementById('gv-category-${category}').click()`);
        await fill('gv-description', description); await fill('gv-date', date);
        await submitForm('Gasto variable');
      };
      await expense('Ejemplo sintético A', '0.10'); await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 1');
      assert.ok(await browser.evaluate('!document.querySelector("dialog[open]")'), 'the sheet closes after saving');
      await expense('Ejemplo sintético B', '0.20'); await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 2');
      assert.ok((await testText('expense-summary')).includes('S/ 110.35'));
      await expense('Ejemplo sintético ocio', '1000', 'ocio'); await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 3');
      assert.ok((await testText('category-cards')).includes('Te pasaste por S/ 213.598'));
      await browser.waitFor('!document.querySelector("dialog[open]")');
      await browser.evaluate('document.querySelector("[data-expense-id] button[aria-label^=\'Editar Ejemplo sintético A\']").click()');
      await browser.waitFor('document.querySelector("dialog[open] [data-testid=expense-source]")?.textContent === "Revisión 1."');
      assert.equal(await browser.evaluate('document.querySelector("dialog[open] h2").textContent'), 'Editar gasto');
      await fill('gv-amount', '0.15'); await submitForm('Gasto variable');
      await browser.waitFor('document.querySelector("[data-testid=expense-summary]").textContent.includes("S/ 1,110.40")');
      // An identical expense on the same day asks first; "Guardar de todas formas" saves it.
      await expense('Ejemplo sintético A', '0.15');
      await browser.waitFor('document.querySelector("dialog[open] [data-testid=duplicate-warning]")?.textContent.includes("Ya hay un gasto igual ese día")');
      assert.equal(await rows(), 3);
      assert.equal(await browser.evaluate('document.querySelectorAll("#gv-similar").length'), 0);
      await capture('19-duplicado-movil.png');
      await browser.evaluate('Array.from(document.querySelectorAll("dialog[open] button")).find(button => button.textContent === "Guardar de todas formas").click()');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 4');
      assert.ok((await testText('expense-summary')).includes('S/ 1,110.55'));
      // An expense dated in another month is saved in that month and the view follows it.
      await expense('Gasto ficticio de mayo', '2', 'salud', '2038-05-01');
      await browser.waitFor('document.querySelector("[role=status]")?.textContent.includes("mayo de 2038") && document.querySelectorAll("[data-expense-id]").length === 1');
      assert.equal(await browser.evaluate('document.getElementById("fiorella-period").value'), '2038-05');
      await fill('fiorella-period', '2038-04');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 4');
      // Total = GF real 110.05 + GV real 1000.50, each counted once; partial while GF has 1/19 actuals.
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=expense-summary]").textContent.includes("S/ 1,110.55")'));
      // Day groups, search and chips.
      assert.equal(await browser.evaluate('document.querySelector("[aria-label=\'Gastos variables\'] h3").textContent'), '9 abr');
      await browser.evaluate('Array.from(document.querySelectorAll("[aria-label=Categoría] button")).find(button => button.textContent === "Ocio").click()');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 1');
      await browser.evaluate('Array.from(document.querySelectorAll("[aria-label=Categoría] button")).find(button => button.textContent === "Todas").click()');
      await fill('gv-filter-text', 'sintético B');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 1');
      await fill('gv-filter-text', '');
      await browser.waitFor('document.querySelectorAll("[data-expense-id]").length === 4');
      // ?nuevo opens the sheet (here from the floating button) and closing removes it from the URL.
      await browser.waitFor('!document.querySelector("dialog[open]")');
      await browser.evaluate('document.querySelector(\'a[href="/fiorella/gastos?nuevo"]\').click()');
      await browser.waitFor('location.search.startsWith("?nuevo") && !!document.querySelector("dialog[open] #gv-amount")');
      await capture('20-gasto-nuevo-movil.png');
      await browser.evaluate('Array.from(document.querySelectorAll("dialog[open] button")).find(button => button.textContent === "Cancelar").click()');
      await browser.waitFor('location.search === "" && !document.querySelector("dialog[open]")');
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('03-gastos-movil.png');
      await browser.evaluate('document.querySelector("[data-testid=pace-chart]").scrollIntoView({block:"start"})');
      await capture('07-ritmo-gv-movil.png');
      await clickLink('/fiorella/historial', 'Historial');
      assert.ok((await visibleText()).includes('S/ 125.20 → S/ 110.05'));
      assert.ok((await visibleText()).includes('otro gasto con datos coincidentes'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period]").length'), 1);
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("[data-demo-period=\'2038-04\'] h4")).filter(h => h.textContent.startsWith("GV")).length'), 4);
      await capture('04-historial-movil.png');
      await clickLink('/fiorella', 'Resumen');
      // One figure per card: GF real 110.05 of 1,500 applied, GV real 1,000.50 of 1,572.804 assigned.
      assert.ok((await testText('fixed-stat')).includes('S/ 110.05') && (await testText('fixed-stat')).includes('Vas bien'));
      assert.ok((await testText('variable-stat')).includes('S/ 1,000.50') && (await testText('variable-stat')).includes('Vas bien'));
      // (1,572.804 − 1,000.50) + (1,500 − 110.05)
      assert.ok((await testText('remaining')).includes('S/ 1,962.254'));
      assert.ok((await testText('savings-tracking')).includes('Sin depósitos'));
      assert.ok((await testText('couple-savings-chart')).includes('S/ 943.6824'));
      await openMonthly(); await fill('monthly-fixed', '1000'); await submitForm('Datos mensuales');
      // The budget detail (120.10) stays below the applied GF, so no warning; spending above it shows the excess.
      await browser.waitFor('document.querySelector("[data-testid=variable-stat]").textContent.includes("de S/ 1,772.804")');
      await closeSheet();
      await openMonthly(); await fill('monthly-fixed', '100'); await submitForm('Datos mensuales');
      await browser.waitFor('document.querySelector("[data-testid=fixed-stat]").textContent.includes("Exceso: −S/ 10.05")');
      assert.ok((await testText('fixed-stat')).includes('Presupuesto mayor al GF aplicado'));
      await closeSheet();
      await openMonthly(); await fill('monthly-fixed', '1500'); await submitForm('Datos mensuales');
      await browser.waitFor('document.querySelector("[data-testid=remaining]").textContent.includes("S/ 1,962.254")');
      await closeSheet();
      // Home shows the same live figure for the selected month.
      await clickLink('/', 'MilFi');
      assert.ok((await visibleText()).includes('S/ 1,962.254'));
      await clickLink('/fiorella', 'Resumen');
    });

    await context.test('Fiorella responsive routes fit 320px, 390px, tablet and desktop with labeled forms', async () => {
      for (const width of [320, 360, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width >= 768 ? 1024 : 844, deviceScaleFactor: 1, mobile: width < 768 });
        for (const [path, heading] of [['/fiorella', 'Resumen'], ['/fiorella/gastos?tipo=fijos', 'Gastos'], ['/fiorella/gastos', 'Gastos'], ['/fiorella/historial', 'Historial']]) {
          await clickLink(path, heading);
          const geometry = await browser.evaluate(`(() => { const main = document.querySelector('main'); return { width: window.innerWidth,
            document: document.documentElement.scrollWidth, main: main.clientWidth, content: main.scrollWidth,
            unlabeled: Array.from(document.querySelectorAll('input,select')).filter(input => !document.querySelector('label[for="' + input.id + '"]')).length }; })()`);
          assert.ok(geometry.document <= geometry.width, `${width} ${path}: document overflow ${JSON.stringify(geometry)}`);
          assert.ok(geometry.content <= geometry.main + 1, `${width} ${path}: content overflow ${JSON.stringify(geometry)}`);
          assert.equal(geometry.unlabeled, 0, `${width} ${path}: inputs without explicit labels`);
          if (path === '/fiorella' && width < 768) {
            // The floating button and the bottom bar never cover the last block.
            const clear = await browser.evaluate(`(() => { window.scrollTo(0, document.documentElement.scrollHeight);
              const fab = document.querySelector('a[href="/fiorella/gastos?nuevo"]').getBoundingClientRect();
              const page = document.querySelector('main h1').closest('main > div');
              const last = Array.from(page.children).filter(child => child.getBoundingClientRect().height > 0).pop().getBoundingClientRect();
              return { last: last.bottom, fab: fab.top }; })()`);
            assert.ok(clear.last <= clear.fab, `${width}: floating button covers content ${JSON.stringify(clear)}`);
            if (width === 360) { await browser.evaluate('window.scrollTo(0, 0)'); await capture('18-resumen-360.png'); }
          }
        }
      }
      await clickLink('/fiorella', 'Resumen'); await capture('05-resumen-escritorio.png');
      await browser.evaluate('document.querySelector("main").scrollTop = document.querySelector("main").scrollHeight');
      await clickLink('/control', 'Control Finanzas M&F');
      assert.equal(await browser.evaluate('document.querySelector("main").scrollTop'), 0);
      assert.doesNotMatch(await visibleText(), /S\/\s*\d|5432|Ejemplo sintético/);
      assert.ok((await visibleText()).includes('no hay un saldo confirmado'));
    });

    await context.test('reload removes all Fiorella demonstrations and their audit without inventing real history', async () => {
      await clickLink('/fiorella', 'Resumen');
      await clickLink('/fiorella/historial', 'Historial');
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Todavía no hay registros.")');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period]").length'), 0);
      await clickLink('/fiorella', 'Resumen');
      assert.ok((await testText('remaining')).includes('Registra el ingreso del mes'));
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('period edits preserve native drafts and applied data while incomplete GF totals stay unavailable', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await openBudgets();
      await fill('fiorella-period', '2040-01');
      await fill('budget-servicios-gas', '80'); await submitForm('Presupuesto servicios-gas');
      await fill('actual-servicios-celular', '30'); await submitForm('Presupuesto servicios-celular');
      assert.ok((await testText('budget-totals')).includes('1/19 subcategorías con presupuesto') && (await testText('budget-totals')).includes('1/19 subcategorías con gasto'));
      assert.doesNotMatch(await visibleText(), /Diferencia a favor: S\/ 50\.00/);
      await fill('actual-servicios-gas', '90'); await submitForm('Presupuesto servicios-gas');
      assert.ok((await visibleText()).includes('−S/ 10.00'));
      assert.ok((await testText('budget-totals')).includes('2/19 subcategorías con gasto'));
      await fill('fiorella-period', '');
      assert.equal(await browser.evaluate('document.getElementById("fiorella-period").value'), '');
      assert.equal(await browser.evaluate('document.querySelectorAll("[role=alert]").length'), 0);
      assert.ok((await visibleText()).includes('S/ 80.00'));
      await browser.evaluate('document.getElementById("fiorella-period").focus(); document.getElementById("fiorella-period").blur()');
      await browser.waitFor('document.querySelector("[role=alert]")?.textContent.includes("AAAA-MM")');
      const copyButton = () => browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent.includes("Copiar presupuestos"))?.disabled');
      // January's previous month (December 2039) has no budgets: copying is off and says why.
      assert.equal(await copyButton(), true);
      assert.ok((await visibleText()).includes('Diciembre de 2039 no tiene presupuestos.'));
      await fill('fiorella-period', '2040-02');
      await editBudget('servicios-gas');
      assert.equal(await browser.evaluate('document.getElementById("budget-servicios-gas").value'), '');
      await browser.page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await browser.waitFor('!document.querySelector("main form")');
      // February copies only January's budgets (Gas 80), never its actuals.
      assert.equal(await copyButton(), false);
      await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent.includes("Copiar presupuestos")).click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=copy-preview]")');
      const preview = await browser.evaluate('document.querySelector("dialog[open] [data-testid=copy-preview]").textContent');
      assert.ok(preview.includes('Gas') && preview.includes('S/ 80.00') && preview.includes('Copiar 1 presupuesto') && !preview.includes('Celular'), preview);
      await capture('21-copiar-presupuestos-movil.png');
      await browser.evaluate('Array.from(document.querySelectorAll("dialog[open] button")).find(button => button.textContent === "Copiar 1 presupuesto").click()');
      await browser.waitFor('document.querySelector("dialog[open] [data-testid=copy-result]")?.textContent.includes("Se guardaron 1 de 1")');
      await closeSheet();
      assert.equal(await copyButton(), true);
      assert.ok((await visibleText()).includes('Ya tienes presupuesto en todas las subcategorías del mes anterior.'));
      assert.ok((await browser.evaluate('document.querySelector(\'[data-budget-id="servicios-gas"]\').textContent')).includes('Gasto sin registrar, presupuesto S/ 80.00'));
      // "Solo sin registrar" keeps only rows missing a budget or an actual.
      await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Solo sin registrar").click()');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-budget-id]").length'), 19);
      // Tapping a group in the chart opens its section and moves focus there.
      await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Solo sin registrar").click()');
      await browser.evaluate('document.querySelector(\'[aria-controls="gf-rows-comida"]\').click()');
      await browser.waitFor('document.querySelector(\'[aria-controls="gf-rows-comida"]\').getAttribute("aria-expanded") === "false"');
      await browser.evaluate('Array.from(document.querySelectorAll("figure button")).find(button => button.textContent.startsWith("Comida")).click()');
      await browser.waitFor('document.querySelector(\'[aria-controls="gf-rows-comida"]\').getAttribute("aria-expanded") === "true" && document.activeElement === document.querySelector(\'[aria-controls="gf-rows-comida"]\')');
      await fill('fiorella-period', '2040-01');
      await browser.evaluate('document.querySelector("[data-testid=budget-totals]").scrollIntoView({block:"start"})');
      await capture('08-gf-incompleto-movil.png');
    });

    await context.test('scenario alternatives compare exact distributions without duplicating a projection period', async () => {
      await clickLink('/fiorella/simulador', 'Simulador y metas');
      const saveScenario = async (period, income) => {
        await fill('simulation-period', period); await fill('simulation-income', income);
        await browser.waitFor('Array.from(document.querySelectorAll("button")).some(button => button.textContent.includes("Guardar simulación") && !button.disabled)');
        await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.includes("Guardar simulación")).click()');
      };
      await saveScenario('2040-01', '4000'); await saveScenario('2040-02', '4000'); await saveScenario('2040-01', '5000');
      await browser.waitFor('document.querySelectorAll("#scenario-a option").length === 4');
      const choose = async (id, index) => browser.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); input.value = input.options[${index}].value; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
      await choose('scenario-a', 3); await choose('scenario-b', 1);
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=scenario-comparison]").textContent.includes("+S/ 240.00")'));
      await browser.evaluate('document.querySelectorAll("input[type=checkbox]")[0].click(); document.querySelectorAll("input[type=checkbox]")[2].click()');
      await browser.waitFor('document.body.textContent.includes("Elige solo una por mes")');
      assert.equal(await browser.evaluate('document.querySelector("[data-testid=projection]")'), null);
      await browser.evaluate('document.querySelectorAll("input[type=checkbox]")[0].click(); document.querySelectorAll("input[type=checkbox]")[1].click()');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=projection]").textContent.includes("S/ 1,200.00")'));
      await browser.evaluate('document.querySelector("[data-testid=scenario-comparison]").scrollIntoView({block:"start"})');
      await capture('09-comparacion-movil.png');
      await fill('simulation-income', '1000');
      await browser.waitFor('document.body.textContent.includes("Tratamiento pendiente de aprobación")');
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button")).some(button => button.textContent.includes("Guardar simulación"))'), false);
      await fill('simulation-income', '4000');
    });

    await context.test('goals use exact Excel-backed ratios, preserve revisions and exclude personal capacity', async () => {
      await fill('goal-title', 'Objetivo inventado de prueba'); await fill('goal-target', '1200'); await fill('goal-months', '2');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-estimate]").textContent.includes("S/ 600.00")'));
      await submitForm('Meta de ahorro hipotética');
      await browser.waitFor('document.querySelectorAll("[data-goal-id]").length === 1');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-capacity]").textContent.includes("coincide matemáticamente")'));
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-capacity]").textContent.includes("S/ 1,800.00")'));
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.startsWith("Editar meta")).click()');
      await fill('goal-target', '1300'); await submitForm('Meta de ahorro hipotética');
      await browser.waitFor('document.querySelector("[data-goal-id]").textContent.includes("Revisión 2")');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-capacity]").textContent.includes("Faltaría S/ 100.00")'));
      await fill('goal-title', 'Fracción sintética'); await fill('goal-target', '1'); await fill('goal-months', '3');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-estimate]").textContent.includes("1 / 3 (fracción exacta)")'));
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-estimate]").textContent.includes("redondeo monetario pendiente")'));
      await fill('goal-months', '0');
      assert.equal(await browser.evaluate('document.getElementById("goal-title").form.querySelector("button[type=submit]").disabled'), true);
      await fill('goal-months', '3');
      await browser.evaluate('document.querySelector("form").scrollIntoView({block:"start"})');
      await capture('10-meta-fraccion-movil.png');
    });

    await context.test('planning fits phone and desktop, leaves demo GF untouched and resets on reload', async () => {
      for (const width of [320, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 1024, deviceScaleFactor: 1, mobile: width < 768 });
        const sizes = await browser.evaluate('({width:innerWidth, document:document.documentElement.scrollWidth, main:document.querySelector("main").clientWidth, content:document.querySelector("main").scrollWidth})');
        assert.ok(sizes.document <= sizes.width && sizes.content <= sizes.main + 1, JSON.stringify(sizes));
        assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("input,select")).filter(input => !input.labels?.length).length'), 0);
      }
      await browser.evaluate('document.querySelector("[data-testid=projection]").scrollIntoView({block:"start"})');
      await capture('11-proyeccion-escritorio.png');
      await openBudgets();
      await editBudget('servicios-gas');
      assert.equal(await browser.evaluate('document.getElementById("budget-servicios-gas").value'), '80');
      assert.equal(await browser.evaluate('document.getElementById("actual-servicios-gas").value'), '90');
      await clickLink('/control', 'Control Finanzas');
      assert.doesNotMatch(await visibleText(), /S\/\s*\d|Objetivo inventado|Fracción sintética/);
      await clickLink('/fiorella', 'Resumen'); await clickLink('/fiorella/simulador', 'Simulador y metas');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-goal-id]").length'), 1);
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Todavía no registraste metas hipotéticas")');
      assert.equal(await browser.evaluate('document.querySelectorAll("#scenario-a option").length'), 1);
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-goal-id]").length'), 0);
      assert.deepEqual(browser.exceptions, []);
    });
    const chooseControl = async (id, value) => browser.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    const enterControl = async ({ amount = '0.1', currency = 'PEN', contributor = 'fiorella', purpose = 'expenses', actor = 'milton', kind = 'deposit', date = '2043-07-10', description = 'Ejemplo Control A', source = 'Referencia ficticia A' } = {}) => {
      await chooseControl('control-kind', kind); await fill('control-date', date); await fill('control-amount', amount); await fill('control-currency', currency);
      await chooseControl('control-contributor', contributor); await chooseControl('control-purpose', purpose); await chooseControl('control-actor', actor);
      await fill('control-description', description); await fill('control-source', source);
    };
    const openControlReview = async index => {
      await browser.evaluate(`document.querySelectorAll('[data-control-id]')[${index}].querySelectorAll('button')[1].click()`);
      await browser.waitFor('!!document.getElementById("control-reviewer")');
      await browser.waitFor(`(() => { const top = document.querySelector('form[aria-label="Revisión demostrativa de Control"]').getBoundingClientRect().top; return top >= -1 && top < innerHeight / 2; })()`);
      await chooseControl('control-reviewer', 'milton');
      await fill('control-review-reason', 'Verificación explícita de los datos inventados de esta operación');
      await fill('control-review-reference', 'Referencia sintética vinculada a esta operación');
    };
    const reviewControl = async index => { await openControlReview(index); await submitForm('Revisión demostrativa de Control'); };
    const controlSummary = () => browser.evaluate('document.querySelector("[data-testid=control-summary]").textContent');
    const controlCount = () => browser.evaluate('document.querySelectorAll("[data-control-id]").length');

    await context.test('Control registers separate contributor/destination/recorder and reviews only demonstrative money', async () => {
      await clickLink('/control', 'Control Finanzas M&F');
      await fill('control-selected-period', '2043-07');
      assert.equal(await controlCount(), 0);
      await enterControl(); await submitForm('Movimiento demostrativo de Control');
      await browser.waitFor('document.querySelectorAll("[data-control-id]").length === 1');
      assert.ok((await visibleText()).includes('Aportante: Fiorella · Destino: Gastos'));
      assert.ok((await visibleText()).includes('Registrado por: Milton (declarado)'));
      assert.doesNotMatch(await controlSummary(), /PEN 0\.10/);
      await reviewControl(0);
      await browser.waitFor('document.querySelector("[data-control-id]").dataset.controlState === "reviewed"');
      assert.ok((await controlSummary()).includes('PEN 0.10'));
      await browser.evaluate('document.getElementById("control-kind").form.scrollIntoView({block:"start"})');
      await capture('16-control-formulario-movil.png');
      assert.ok((await visibleText()).includes('Nunca confirmado'));
      assert.ok((await visibleText()).includes('no hay un saldo confirmado'));
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await browser.evaluate('document.querySelector("[data-testid=control-summary]").scrollIntoView({block:"start"})');
      await capture('12-control-resumen-movil.png');
    });

    await context.test('Control value duplicates need an explicit distinct-operation explanation', async () => {
      await enterControl(); await submitForm('Movimiento demostrativo de Control');
      await browser.waitFor('document.body.textContent.includes("Hay otra operación con los mismos datos")');
      assert.equal(await controlCount(), 1);
      await fill('control-distinct', 'Segundo depósito ficticio independiente con valores coincidentes');
      await submitForm('Movimiento demostrativo de Control');
      await browser.waitFor('document.querySelectorAll("[data-control-id]").length === 2');
      assert.ok((await controlSummary()).includes('PEN 0.10'));
    });

    await context.test('Control keeps PEN/USD and independent withdrawals apart, with unknown currency pending', async () => {
      await enterControl({ amount: '8', currency: 'USD', contributor: 'milton', purpose: 'savings', actor: 'fiorella', date: '2043-07-11', description: 'Depósito USD sintético' });
      await submitForm('Movimiento demostrativo de Control'); await reviewControl(0);
      await enterControl({ amount: '5', kind: 'withdrawal', contributor: '', purpose: 'savings', date: '2043-07-12', description: 'Retiro sintético independiente' });
      await submitForm('Movimiento demostrativo de Control'); await reviewControl(0);
      const totals = await controlSummary();
      assert.ok(totals.includes('USD 8.00')); assert.ok(totals.includes('PEN 5.00')); assert.ok(totals.includes('PEN 0.10'));
      assert.doesNotMatch(totals, /13\.10|−|\b3\.10/);
      await enterControl({ amount: '4', currency: '', date: '2043-07-13', description: 'Moneda desconocida sintética' });
      await submitForm('Movimiento demostrativo de Control'); await reviewControl(0);
      await browser.waitFor(`document.querySelector('form[aria-label="Revisión demostrativa de Control"] [role=alert]')?.textContent.includes("moneda pendiente")`);
      assert.equal(await browser.evaluate('document.querySelector("[data-control-id]").dataset.controlState'), 'pending');
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Cerrar revisión").click()');
      assert.doesNotMatch(await controlSummary(), /4\.00/);
      await browser.evaluate('document.querySelector("[data-testid=control-summary]").scrollIntoView({block:"start"})');
      await capture('13-control-monedas-movil.png');
    });

    await context.test('Control edits invalidate reviews, retain original evidence and expose before/after audit', async () => {
      await browser.evaluate('Array.from(document.querySelectorAll("[data-control-id]")).find(card => card.textContent.includes("Ejemplo Control A") && card.dataset.controlState === "reviewed").querySelector("button").click()');
      await browser.waitFor(`(() => { const top = document.querySelector('form[aria-label="Movimiento demostrativo de Control"]').getBoundingClientRect().top; return top >= -1 && top < innerHeight / 2; })()`);
      await fill('control-amount', '0.2'); await submitForm('Movimiento demostrativo de Control');
      await browser.waitFor('document.body.textContent.includes("Revisión anterior desactualizada")');
      assert.doesNotMatch(await controlSummary(), /PEN 0\.10|PEN 0\.20/);
      assert.ok((await visibleText()).includes('Antes: Depósito'));
      assert.ok((await visibleText()).includes('Después: Depósito'));
      const index = await browser.evaluate('Array.from(document.querySelectorAll("[data-control-id]")).findIndex(card => card.textContent.includes("Revisión anterior desactualizada"))');
      await reviewControl(index);
      await browser.waitFor('document.querySelector("[data-testid=control-summary]").textContent.includes("PEN 0.20")');
      await browser.evaluate(`document.querySelectorAll('[data-control-id]')[${index}].scrollIntoView({block:"start"})`);
      await capture('14-control-revision-movil.png');
    });

    await context.test('Control requires explicit cross-period assignment and keeps unapproved withdrawal/rounding pending', async () => {
      await fill('control-selected-period', '2043-08'); assert.equal(await controlCount(), 0);
      await enterControl({ amount: '3', date: '2043-07-31', description: 'Imputación interperiodo sintética' });
      await submitForm('Movimiento demostrativo de Control'); await reviewControl(0);
      await browser.waitFor(`document.querySelector('form[aria-label="Revisión demostrativa de Control"] [role=alert]')?.textContent.includes("Fecha y periodo son distintos")`);
      await capture('17-control-revision-formulario-movil.png');
      assert.doesNotMatch(await controlSummary(), /PEN 3\.00/);
      await browser.evaluate('document.getElementById("control-review-period").click()');
      await submitForm('Revisión demostrativa de Control');
      await browser.waitFor('document.querySelector("[data-testid=control-summary]").textContent.includes("PEN 3.00")');
      await enterControl({ amount: '2', kind: 'withdrawal', contributor: '', purpose: 'expenses', date: '2043-08-02', description: 'Tratamiento pendiente sintético' });
      await submitForm('Movimiento demostrativo de Control'); await reviewControl(0);
      await browser.waitFor(`document.querySelector('form[aria-label="Revisión demostrativa de Control"] [role=alert]')?.textContent.includes("retiros para gastos")`);
      assert.doesNotMatch(await controlSummary(), /PEN 2\.00/);
      await chooseControl('control-review-decision', 'rejected'); await submitForm('Revisión demostrativa de Control');
      await browser.waitFor('document.querySelector("[data-control-id]").dataset.controlState === "rejected"');
      await enterControl({ amount: '0.001', date: '2043-08-03', description: 'Fracción de céntimo sintética' });
      await submitForm('Movimiento demostrativo de Control'); await reviewControl(0);
      await browser.waitFor(`document.querySelector('form[aria-label="Revisión demostrativa de Control"] [role=alert]')?.textContent.includes("fracciones de céntimo")`);
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Cerrar revisión").click()');
      assert.doesNotMatch(await controlSummary(), /0\.001/);
    });

    await context.test('Control filters month/year/status, fits mobile/desktop and stays separate across module navigation', async () => {
      await chooseControl('control-status', 'pending'); assert.equal(await controlCount(), 1);
      await chooseControl('control-status', 'rejected'); assert.equal(await controlCount(), 1);
      await chooseControl('control-status', 'reviewed'); assert.equal(await controlCount(), 1);
      await chooseControl('control-status', 'confirmed'); assert.equal(await controlCount(), 0);
      assert.ok((await visibleText()).includes('Ninguna demostración es un movimiento confirmado'));
      await chooseControl('control-status', 'all');
      for (const width of [320, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 1024, deviceScaleFactor: 1, mobile: width < 768 });
        const sizes = await browser.evaluate('({width:innerWidth, document:document.documentElement.scrollWidth, main:document.querySelector("main").clientWidth, content:document.querySelector("main").scrollWidth})');
        assert.ok(sizes.document <= sizes.width && sizes.content <= sizes.main + 1, JSON.stringify(sizes));
        assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("input,select")).filter(input => !input.labels?.length).length'), 0);
      }
      await browser.evaluate('document.querySelector("[data-testid=control-summary]").scrollIntoView({block:"start"})');
      await capture('15-control-escritorio.png');
      await fill('control-selected-period', '2044-08'); assert.equal(await controlCount(), 0);
      await fill('control-selected-period', '2043-07'); assert.equal(await controlCount(), 5);
      await clickLink('/fiorella', 'Resumen');
      assert.doesNotMatch(await visibleText(), /Ejemplo Control|Depósito USD sintético|PEN 0\.20/);
      await clickLink('/fiorella/historial', 'Historial');
      assert.doesNotMatch(await visibleText(), /Ejemplo Control|Moneda desconocida|Retiro sintético/);
      await clickLink('/control', 'Control Finanzas M&F');
      assert.equal(await controlCount(), 5);
      await browser.page('Page.reload');
      await browser.waitFor('document.querySelector("[data-testid=control-counts]")?.textContent.includes("Depósitos registrados de demo: 0")');
      assert.equal(await controlCount(), 0);
      assert.ok((await visibleText()).includes('Sin cambios en esta sesión'));
      assert.ok((await visibleText()).includes('no hay un saldo confirmado'));
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('one month is kept across modules and sheets close with Esc returning focus', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await clickLink('/fiorella', 'Resumen');
      await fill('fiorella-period', '2047-03');
      await clickLink('/control', 'Control Finanzas M&F');
      assert.equal(await browser.evaluate('document.getElementById("control-selected-period").value'), '2047-03');
      await browser.evaluate('document.querySelector("[aria-label=\'Mes siguiente\']").click()');
      await browser.waitFor('document.getElementById("control-selected-period").value === "2047-04"');
      await clickLink('/fiorella', 'Resumen');
      assert.equal(await browser.evaluate('document.getElementById("fiorella-period").value'), '2047-04');
      await clickLink('/fiorella/historial', 'Historial');
      assert.equal(await browser.evaluate('document.getElementById("history-month").value'), '2047-04');
      for (const opener of ['[aria-label="Reglas de Fiorella"]', '[data-testid=demo-mode]']) {
        await browser.evaluate(`(() => { const button = document.querySelector('${opener}'); button.focus(); button.click(); })()`);
        await browser.waitFor('!!document.querySelector("dialog[open]")');
        if (opener.includes('Reglas')) assert.equal((await browser.evaluate('document.querySelector("dialog[open]").textContent')).match(/50% de variables/g).length, 2);
        else assert.ok((await browser.evaluate('document.querySelector("dialog[open]").textContent')).includes('se borran al recargar'));
        await browser.page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await browser.waitFor('!document.querySelector("dialog[open]")');
        assert.ok(await browser.evaluate(`document.activeElement === document.querySelector('${opener}')`), `${opener}: focus returns`);
      }
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('Access page states that authentication is not configured and no auth client stores anything', async () => {
      await navigate('/acceso', 'Acceso');
      const text = await visibleText();
      assert.ok(text.includes('Autenticación no configurada') && text.includes('No existe un inicio de sesión simulado'));
      assert.equal(await browser.evaluate('document.querySelectorAll("#login-email, #login-password").length'), 0);
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=demo-mode]")'));
      await clickLink('/control', 'Control Finanzas M&F');
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=demo-mode]")'));
      assert.deepEqual(await browser.evaluate('({local: localStorage.length, session: sessionStorage.length})'), { local: 0, session: 0 });
      assert.deepEqual(browser.exceptions, []);
    });
  } finally {
    try { if (browser) await browser.close(); } finally {
      if (app) await app.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
});
