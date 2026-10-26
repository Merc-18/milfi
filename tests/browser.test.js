import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { preview } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { addMonths } from '../src/presentation/goalPlan.js';
import { currentPeriodInput, formatPeriod, parsePeriodInput } from '../src/presentation/format.js';

// Goals start in the current month (Lima): the M-th contribution falls in current + M − 1.
const arrival = months => formatPeriod(addMonths(parsePeriodInput(currentPeriodInput()), months - 1));

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

    await context.test('legacy routes redirect with replacement rather than trapping Back', async () => {
      const aliases = [
        // Simulador and Calculadora are the Metas page; the calculator opens its "¿y si…?".
        ['/calculadora', '/fiorella/metas?simular', 'Metas'],
        ['/fiorella/simulador', '/fiorella/metas', 'Metas'],
        ['/fiorella/calculadora', '/fiorella/metas?simular', 'Metas'],
        ['/historial', '/fiorella/historial', 'Historial'],
        ['/configuracion', '/fiorella/configuracion', 'Configuración oficial'],
        ['/fondo-comun', '/control', 'Control M&F'],
        // Presupuestos is now the fixed view of Gastos.
        ['/fiorella/presupuestos', '/fiorella/gastos?tipo=fijos', 'Gastos'],
      ];
      for (const [oldPath, target, heading] of aliases) {
        await navigate('/', 'MilFi');
        await browser.page('Page.navigate', { url: origin + oldPath });
        await browser.waitFor(`location.pathname + location.search === ${JSON.stringify(target)} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
        await browser.evaluate('history.back()');
        await browser.waitFor('location.pathname === "/" && document.querySelector("h1")?.textContent.includes("MilFi")');
      }
    });

    // Topmost open sheet (a sheet can open another one inside it).
    const topSheet = () => "Array.from(document.querySelectorAll('dialog[open]')).at(-1)";
    const closeTop = async () => {
      const before = await browser.evaluate('document.querySelectorAll("dialog[open]").length');
      await browser.evaluate(`${topSheet()}.querySelector('button[aria-label=Cerrar]').click()`);
      await browser.waitFor(`document.querySelectorAll("dialog[open]").length === ${before - 1}`);
    };

    await context.test('the "¿y si…?" previews a distribution without saving anything or touching Control', async () => {
      await browser.page('Page.navigate', { url: origin + '/fiorella/calculadora' });
      await browser.waitFor('location.pathname + location.search === "/fiorella/metas?simular" && !!document.querySelector("dialog[open] [data-testid=page-whatif-panel]")');
      await fill('page-whatif-income', '4000.01');
      await browser.waitFor('document.querySelector("[data-testid=page-whatif-result]").textContent.includes("Ahorro de pareja: S/ 600.0024 al mes")');
      await browser.evaluate(`Array.from(${topSheet()}.querySelectorAll("button")).find(button => button.textContent === "Ver reparto completo").click()`);
      await browser.waitFor(`${topSheet()}.textContent.includes("1,000.004") && ${topSheet()}.textContent.includes("600.0024")`);
      await closeTop(); await closeTop();
      assert.equal(await browser.evaluate('location.search'), '');
      await clickLink('/fiorella/historial', 'Historial');
      assert.ok((await visibleText()).includes('Todavía no hay registros.'));
      assert.doesNotMatch(await visibleText(), /Simulaciones de esta sesión|4,000\.01|600\.0024/);
      await clickLink('/control', 'Control M&F');
      const control = await browser.evaluate('document.body.textContent');
      assert.doesNotMatch(control, /S\/\s*(?!0\.00(?!\d))\d|4,000\.01|600\.0024/);
      assert.ok(control.includes('Saldo de ahorro según lo registrado'));
    });

    await context.test('the "¿y si…?" explains deficit, zero surplus and the GF cap without a split', async () => {
      await clickLink('/fiorella', 'Resumen'); await clickLink('/fiorella/metas', 'Metas');
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=goal-capacity]").textContent.includes("Registra el ingreso del mes para estimar tus metas")'));
      await capture('22-metas-vacio-movil.png');
      await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "¿Y si…?").click()');
      await browser.waitFor('location.search.startsWith("?simular") && !!document.getElementById("page-whatif-income")');
      const result = () => browser.evaluate('document.querySelector("[data-testid=page-whatif-result]").textContent');
      await fill('page-whatif-income', '1000');
      await browser.waitFor('document.querySelector("[data-testid=page-whatif-result]").textContent.includes("El ingreso es menor que el gasto fijo")');
      await fill('page-whatif-income', '1500');
      await browser.waitFor('document.querySelector("[data-testid=page-whatif-result]").textContent.includes("El sobrante es cero")');
      assert.doesNotMatch(await result(), /Ahorro de pareja|Ver reparto completo/);
      // The GF is always the cap: the "¿y si…?" only changes the income.
      assert.equal(await browser.evaluate('document.querySelectorAll("#page-whatif-fixed").length'), 0);
      assert.ok(await browser.evaluate('document.querySelector("dialog[open]").textContent.includes("S/ 1,500.00 reservados para gastos fijos")'));
      await closeTop();
    });

    await context.test('reload keeps the demo explained once and still reports real history as not imported', async () => {
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Aún no tienes metas.")');
      // The demo is explained once, by the header badge.
      assert.ok(await browser.evaluate('document.querySelector("[data-testid=demo-mode]")?.textContent === "Modo demo"'));
      await clickLink('/control', 'Control M&F');
      assert.ok(await browser.evaluate('document.body.textContent.includes("Saldo de ahorro según lo registrado")'));
      assert.deepEqual(browser.exceptions, []);
    });


    await context.test('Fiorella monthly demo separates applied GF, detailed budgets and recorded actuals across periods', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await navigate('/fiorella', 'Resumen');
      // Without data the summary states the missing step as an action.
      assert.ok((await testText('remaining')).includes('Registra el ingreso del mes'));
      assert.ok((await testText('distribution-chart')).includes('Registra el ingreso del mes'));
      await fill('fiorella-period', '2038-04');
      await openMonthly();
      // Only the income is asked: the applied GF is always the S/ 1,500 cap.
      assert.equal(await browser.evaluate('document.querySelectorAll("#monthly-fixed").length'), 0);
      await fill('monthly-income', '5432.01');
      await submitForm('Datos mensuales');
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
      assert.ok((await testText('budget-totals')).includes('Reservado para gastos fijos') && (await testText('budget-totals')).includes('S/ 1,500.00'));
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
      assert.equal(await browser.evaluate('document.activeElement.textContent'), 'Guardar de todas formas');
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
      // The header's single "Registrar gasto" opens the sheet as ?nuevo; closing removes it from the URL.
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button")).filter(button => button.textContent === "Registrar gasto").length'), 1);
      await browser.evaluate('Array.from(document.querySelectorAll("main header button")).find(button => button.textContent === "Registrar gasto").click()');
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
      // The budget detail (120.10) stays below the reserved GF, so no warning badge.
      assert.doesNotMatch(await testText('fixed-stat'), /Presupuesto mayor/);
      // Home shows the same live figure for the selected month.
      await clickLink('/', 'MilFi');
      assert.ok((await visibleText()).includes('S/ 1,962.254'));
      await clickLink('/fiorella', 'Resumen');
    });

    await context.test('fixed expenses use the same sheet: add to an empty or registered total, or replace it, budget untouched', async () => {
      await clickLink('/fiorella/gastos', 'Gastos');
      const openFixed = async () => {
        await browser.waitFor('!document.querySelector("dialog[open]")');
        await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Registrar gasto").click()');
        await browser.waitFor('!!document.getElementById("gasto-tipo-fijo")');
        await browser.evaluate('document.getElementById("gasto-tipo-fijo").click()');
        await browser.waitFor('!!document.querySelector("dialog[open] #gf-category")');
      };
      const choose = id => browser.evaluate(`(() => { const select = document.getElementById('gf-category'); select.value = ${JSON.stringify(id)};
        select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const preview = () => testText('fixed-preview');
      await openFixed();
      // Grouped subcategories with their display names, and no date field.
      assert.ok(await browser.evaluate('Array.from(document.querySelectorAll("#gf-category optgroup")).map(group => group.label).join() === "Servicios,Transporte,Comida,Bienestar,Otros"'));
      assert.ok(await browser.evaluate('Array.from(document.querySelectorAll("#gf-category option")).some(option => option.textContent === "Carbohidratos")'));
      assert.equal(await browser.evaluate('document.querySelectorAll("dialog[open] input[type=date]").length'), 0);
      await choose('servicios-luz'); await fill('gf-amount', '80');
      assert.ok((await preview()).includes('Se suma a abril de 2038') && (await preview()).includes('Luz: sin registrar → S/ 80.00 este mes'), await preview());
      await capture('27-gasto-fijo-movil.png');
      await submitForm('Gasto fijo');
      await browser.waitFor('!document.querySelector("dialog[open]") && document.querySelector("[role=status]")?.textContent.includes("Luz: S/ 80.00 en abril de 2038")');
      await openFixed(); await choose('servicios-luz'); await fill('gf-amount', '80');
      assert.ok((await preview()).includes('Luz: S/ 80.00 → S/ 160.00 este mes'));
      await submitForm('Gasto fijo');
      await openFixed(); await choose('servicios-gas'); await fill('gf-amount', '1500');
      await browser.evaluate('document.getElementById("gf-mode-replace").click()');
      assert.ok((await preview()).includes('Reemplaza el total de abril de 2038') && (await preview()).includes('Gas: S/ 110.05 → S/ 1,500.00 este mes'), await preview());
      await submitForm('Gasto fijo');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      // The budgets stay as they were: Gas keeps 120.10 and Luz has none.
      await browser.evaluate('document.getElementById("gastos-tab-fijos").click()');
      await browser.waitFor('!!document.querySelector("[data-budget-id=servicios-gas]")');
      assert.ok((await browser.evaluate('document.querySelector("[data-budget-id=servicios-gas]").textContent')).includes('S/ 1,500.00 de S/ 120.10'));
      assert.ok((await browser.evaluate('document.querySelector("[data-budget-id=servicios-luz]").textContent')).includes('S/ 160.00, presupuesto sin registrar'));
      // GF real 1,660 above the S/ 1,500 reserved: the summary shows the excess.
      await clickLink('/fiorella', 'Resumen');
      assert.ok((await testText('fixed-stat')).includes('Exceso: −S/ 160.00'), await testText('fixed-stat'));
      // The three cards wear their traffic light as background, with the word visible.
      const lights = await browser.evaluate(`['fixed-stat', 'variable-stat', 'savings-tracking'].map(id => {
        const card = document.querySelector('[data-testid=' + id + ']');
        return [card.dataset.light, getComputedStyle(card).color, card.querySelector('[data-testid=' + id + '-state]')?.textContent]; })`);
      assert.deepEqual(lights.map(([light]) => light), ['excedido', 'ok', 'neutral']);
      assert.equal(lights[0][1], 'rgb(255, 255, 255)', 'white text on the red card');
      assert.deepEqual(lights.map(([, , word]) => word), ['Exceso: −S/ 160.00', 'Vas bien', 'Pendiente']);
      await capture('28-resumen-semaforo-movil.png');
      // Historial: the month-by-month table is always visible at the top with a word next to each light.
      await clickLink('/fiorella/historial', 'Historial');
      assert.equal(await browser.evaluate('document.querySelector("[data-testid=monthly-evolution]").tagName'), 'SECTION');
      const april = await browser.evaluate('Array.from(document.querySelectorAll("[data-month=\'2038-04\'] [data-light]")).map(cell => [cell.dataset.light, cell.textContent])');
      assert.deepEqual(april.map(([light]) => light), ['rojo', 'verde']);
      assert.ok(april[0][1].includes('S/ 1,660.00 / S/ 1,500.00') && april[0][1].endsWith('Excedido') && april[1][1].endsWith('Bien'), JSON.stringify(april));
      await capture('29-historial-semaforo-movil.png');
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
          // No floating button anywhere; "Registrar gasto" lives only in the Gastos header, once.
          const register = await browser.evaluate(`({ links: document.querySelectorAll('a[href="/fiorella/gastos?nuevo"]').length,
            buttons: Array.from(document.querySelectorAll('button')).filter(button => button.textContent === 'Registrar gasto').length,
            header: !!Array.from(document.querySelectorAll('main header button')).find(button => button.textContent === 'Registrar gasto') })`);
          assert.deepEqual(register, path.startsWith('/fiorella/gastos') ? { links: 0, buttons: 1, header: true } : { links: 0, buttons: 0, header: false }, `${width} ${path}`);
          if (path === '/fiorella' && width === 360) { await browser.evaluate('window.scrollTo(0, 0)'); await capture('18-resumen-360.png'); }
        }
      }
      await clickLink('/fiorella', 'Resumen'); await capture('05-resumen-escritorio.png');
      await browser.evaluate('document.querySelector("main").scrollTop = document.querySelector("main").scrollHeight');
      await clickLink('/control', 'Control M&F');
      assert.equal(await browser.evaluate('document.querySelector("main").scrollTop'), 0);
      assert.doesNotMatch(await visibleText(), /5432|Ejemplo sintético/);
      assert.ok((await visibleText()).includes('Saldo de ahorro según lo registrado'));
    });

    await context.test('reload removes all Fiorella demonstrations and their audit without inventing real history', async () => {
      await clickLink('/fiorella', 'Resumen');
      await clickLink('/fiorella/historial', 'Historial');
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Todavía no hay registros.")');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period]").length'), 0);
      await clickLink('/fiorella', 'Resumen');
      assert.ok((await testText('remaining')).includes('Registra el ingreso del mes'));
      // A ?nuevo link still opens the expense sheet directly.
      await browser.page('Page.navigate', { url: origin + '/fiorella/gastos?nuevo' });
      await browser.waitFor('location.search.startsWith("?nuevo") && !!document.querySelector("dialog[open] #gv-amount")');
      await closeTop();
      assert.equal(await browser.evaluate('location.search'), '');
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

    await context.test('goals: months prefilled from the plan, preview, arrival from the current month and on-time state', async () => {
      // Without a distribution the page asks for the month's income, right there.
      await clickLink('/fiorella/metas', 'Metas');
      await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Registra el ingreso del mes").click()');
      await browser.waitFor('!!document.querySelector("dialog[open] #monthly-income")');
      await fill('monthly-income', '5432.01'); await submitForm('Datos mensuales');
      await closeTop();
      // Capacity = 24 % of 3,932.01 from the selected month (January 2040).
      const capacity = await testText('goal-capacity');
      assert.ok(capacity.includes('S/ 943.6824') && capacity.includes('enero de 2040'), capacity);
      const newGoal = async (title, target, months) => {
        await browser.evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Nueva meta").click()');
        await browser.waitFor('!!document.querySelector("dialog[open] #goal-title") && document.activeElement?.id === "goal-title"');
        await fill('goal-title', title); await fill('goal-target', target);
        if (months) await fill('goal-months', months);
      };
      await newGoal('Viaje inventado', '1200');
      // Months start as M = ⌈1200 / 943.6824⌉ = 2 until the person types a value.
      assert.equal(await browser.evaluate('document.getElementById("goal-months").value'), '2');
      assert.ok((await browser.evaluate('document.getElementById("goal-months-help").textContent')).includes('Con tu plan, unos 2 meses'));
      assert.equal(await testText('goal-preview'), 'Necesitas S/ 600.00 al mes; llegas en unos 2 meses');
      await capture('23-meta-formulario-movil.png');
      await fill('goal-months', '6'); await fill('goal-target', '1300');
      assert.equal(await browser.evaluate('document.getElementById("goal-months").value'), '6', 'a typed value is kept');
      await fill('goal-target', '1200');
      assert.ok((await testText('goal-preview')).startsWith('Necesitas S/ 200.00 al mes'));
      await submitForm('Meta de ahorro');
      await browser.waitFor('document.querySelectorAll("[data-goal-id]").length === 1 && !document.querySelector("dialog[open]")');
      await newGoal('Auto inventado', '20000', '12');
      // N = 20000 / 12 = 1,666.666… → shown as S/ 1,666.67; shortfall 722.98426… → S/ 722.99.
      assert.ok((await testText('goal-preview')).startsWith('Necesitas S/ 1,666.67 al mes; llegas en unos 22 meses'));
      await submitForm('Meta de ahorro');
      await browser.waitFor('document.querySelectorAll("[data-goal-id]").length === 2 && !document.querySelector("dialog[open]")');
      const card = title => browser.evaluate(`Array.from(document.querySelectorAll("[data-goal-id]")).find(item => item.textContent.includes(${JSON.stringify(title)})).textContent`);
      const trip = await card('Viaje inventado');
      assert.ok(trip.includes('Vas a tiempo') && trip.includes(`Llegas en unos 2 meses (${arrival(2)})`) && trip.includes('Necesitas S/ 200.00 al mes'), trip);
      const car = await card('Auto inventado');
      assert.ok(car.includes('Te faltan S/ 722.99 al mes') && car.includes(`Llegas en unos 22 meses (${arrival(22)})`), car);
      assert.doesNotMatch(await visibleText(), /\d+ \/ \d+ \(fracción|hipotétic|no acredita|Revisión/i);
    });

    await context.test('goal detail draws its path and the "¿y si…?" changes the arrival without saving', async () => {
      await browser.evaluate('Array.from(document.querySelectorAll("[data-goal-id] button")).find(button => button.textContent.includes("Auto inventado")).click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=goal-detail] svg[role=img]")');
      const reading = await testText('goal-reading');
      assert.ok(reading.includes(`Llegas en unos 22 meses (${arrival(22)})`) && reading.includes('te faltan S/ 722.99 al mes'), reading);
      assert.ok(reading.includes('necesitarías un ingreso de S/ 8,444.45'), reading);
      // The term reads as a count of months; only the estimated arrival has a date.
      assert.ok(reading.includes('Necesitas S/ 1,666.67 al mes para lograrla en 12 meses'), reading);
      const path = await browser.evaluate('document.querySelector("dialog[open] [data-testid=goal-detail] figure").textContent');
      assert.ok(path.includes('Plazo: 12 meses') && path.includes(`Llegada: `), path);
      assert.doesNotMatch(path, new RegExp(`Plazo: [a-z]{3} \\d{2}|${formatPeriod(addMonths(parsePeriodInput(currentPeriodInput()), 11))}`));
      assert.equal((reading.match(/Estimación lineal/g) ?? []).length, 1);
      await capture('24-meta-detalle-movil.png');
      await browser.evaluate('document.querySelector("dialog[open] [data-testid=goal-detail] details summary").click()');
      await fill('goal-whatif-income', '10000');
      // C' = 24 % of 8,500 = 2,040; M' = ⌈20000 / 2040⌉ = 10.
      await browser.waitFor('document.querySelector("[data-testid=goal-whatif-result]").textContent.includes("Ahorro de pareja: S/ 2,040.00 al mes (antes S/ 943.6824)")');
      assert.ok((await testText('goal-whatif-result')).includes(`Llegarías en unos 10 meses (${arrival(10)})`));
      assert.equal(await browser.evaluate('document.querySelectorAll("dialog[open] [data-testid=goal-detail] svg polyline").length'), 2);
      await browser.evaluate('document.querySelector("dialog[open] [data-testid=goal-whatif-panel]").scrollIntoView({block:"center"})');
      await capture('25-meta-y-si-movil.png');
      await closeTop();
      // Nothing was saved: the card keeps its estimate and Historial has the same records.
      assert.ok((await browser.evaluate('Array.from(document.querySelectorAll("[data-goal-id]")).find(item => item.textContent.includes("Auto")).textContent')).includes('22 meses'));
      await browser.evaluate('Array.from(document.querySelectorAll("[data-goal-id] button")).find(button => button.textContent.includes("Viaje inventado")).click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=goal-detail]")');
      assert.ok((await browser.evaluate(`${topSheet()}.textContent`)).includes('Revisión 1.'));
      await browser.evaluate(`Array.from(${topSheet()}.querySelectorAll("button")).find(button => button.textContent === "Editar").click()`);
      await browser.waitFor('document.getElementById("goal-months")?.value === "6" && document.getElementById("goal-target").value === "1200"');
      await fill('goal-target', '1300'); await submitForm('Meta de ahorro');
      await browser.waitFor('!document.querySelector("dialog[open]") && document.querySelector("[role=status]")?.textContent === "Meta actualizada."');
      await browser.evaluate('Array.from(document.querySelectorAll("[data-goal-id] button")).find(button => button.textContent.includes("Viaje inventado")).click()');
      await browser.waitFor(`${topSheet()}?.textContent.includes("Revisión 2.") && ${topSheet()}.textContent.includes("S/ 1,300.00")`);
      await closeTop();
    });

    await context.test('Metas fits phone and desktop, leaves demo GF untouched and resets goals on reload', async () => {
      for (const width of [320, 360, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 1024, deviceScaleFactor: 1, mobile: width < 768 });
        const sizes = await browser.evaluate('({width:document.documentElement.clientWidth, document:document.documentElement.scrollWidth, main:document.querySelector("main").clientWidth, content:document.querySelector("main").scrollWidth})');
        assert.ok(sizes.document <= sizes.width && sizes.content <= sizes.main + 1, JSON.stringify(sizes));
        assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("input,select")).filter(input => !input.labels?.length).length'), 0);
      }
      await openBudgets();
      await editBudget('servicios-gas');
      assert.equal(await browser.evaluate('document.getElementById("budget-servicios-gas").value'), '80');
      assert.equal(await browser.evaluate('document.getElementById("actual-servicios-gas").value'), '90');
      await clickLink('/control', 'Control M&F');
      assert.doesNotMatch(await visibleText(), /Viaje inventado|Auto inventado/);
      await clickLink('/fiorella', 'Resumen'); await clickLink('/fiorella/metas', 'Metas');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-goal-id]").length'), 2);
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Aún no tienes metas.")');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-goal-id]").length'), 0);
      assert.deepEqual(browser.exceptions, []);
    });
    const clickText = async text => browser.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`);
    const select = async (id, value) => browser.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const balance = () => testText('control-balance');
    const count = () => browser.evaluate('document.querySelectorAll("[data-ledger-id]").length');
    const enter = async ({amount = '100', kind = 'deposit', purpose = 'savings', date = '2043-07-10', plan = '2043-06', description = ''} = {}) => {
      await clickText('Registrar movimiento');
      await browser.waitFor('!!document.querySelector("dialog[open] #control-amount")');
      await browser.evaluate(`document.getElementById('control-kind-${kind}').click()`);
      if (kind === 'deposit') await browser.evaluate(`document.getElementById('control-purpose-${purpose}').click()`);
      await fill('control-date', date); await fill('control-amount', amount);
      if (kind === 'deposit') await select('control-contribution-type', 'habitual');
      if (kind === 'deposit' && purpose === 'savings') { await browser.evaluate('document.getElementById("control-assign-plan").click()'); await fill('control-plan', plan); }
      if (description) await fill('control-description', description);
      await submitForm('Movimiento de Control');
      await browser.waitFor('!document.querySelector("dialog[open]")');
    };
    const accept = async () => {
      await browser.evaluate('document.querySelector("[data-review-id] button").click()');
      await browser.waitFor('!!document.getElementById("review-reference")');
      await fill('review-reference', 'Voucher inventado');
      await submitForm('Revisar movimiento');
      await browser.waitFor('!document.querySelector("dialog[open]")');
    };

    await context.test('Control demo: register, review, savings balance, arrival month versus plan month and withdrawals', async () => {
      await clickLink('/control', 'Control M&F');
      await fill('control-selected-period', '2043-07');
      assert.equal(await count(), 0);
      await enter();
      assert.ok((await balance()).includes('S/ 0.00') && (await balance()).includes('1 movimiento por revisar'));
      await accept();
      assert.ok((await balance()).includes('S/ 100.00'));
      const rows = await browser.evaluate('Array.from(document.querySelectorAll("[data-testid=control-monthly] tbody tr")).map(row => ({ key: row.dataset.month, cells: Array.from(row.cells).map(cell => cell.textContent) }))');
      assert.ok(rows.find(row => row.key === '2043-07').cells[2].includes('100.00'));
      assert.ok(rows.find(row => row.key === '2043-07').cells[4].includes('100.00'));
      assert.ok(rows.find(row => row.key === '2043-07').cells[3].includes('Plan: junio de 2043'));
      assert.equal(rows.some(row => row.key === '2043-06'), false, 'the original plan month is not an invented receipt month');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-testid=balance-chart] svg circle").length'), 0);
      await enter({ amount: '20', kind: 'withdrawal', description: 'Retiro inventado', date: '2043-07-12' });
      await accept();
      assert.ok((await balance()).includes('S/ 80.00'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-testid=balance-chart] svg circle").length'), 1);
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=balance-chart] svg circle title").textContent')).includes('Retiro inventado'));
      // USD is recorded separately and never subtracted from the PEN balance.
      await clickText('Registrar movimiento');
      await browser.waitFor('!!document.getElementById("control-amount")');
      await browser.evaluate('document.getElementById("control-kind-withdrawal").click()');
      await fill('control-amount', '7.5'); await select('control-currency', 'USD');
      await fill('control-date', '2043-07-13'); await fill('control-description', 'Retiro USD inventado');
      await submitForm('Movimiento de Control'); await browser.waitFor('!document.querySelector("dialog[open]")'); await accept();
      assert.ok((await balance()).includes('S/ 80.00') && (await balance()).includes('US$ 7.50'));
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('Control edit invalidates review, duplicate needs a reason, rejected rows stay outside balance', async () => {
      await browser.evaluate('Array.from(document.querySelectorAll("[data-ledger-id] button")).find(button => button.textContent.includes("100.00")).click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=movement-detail]")');
      assert.ok((await browser.evaluate('document.querySelector("dialog[open]").textContent')).includes('Operación'));
      const references = await browser.evaluate('document.querySelector("dialog[open] [data-testid=movement-detail]").textContent');
      assert.ok(references.includes('Fecha de recepción') && references.includes('2043-07-10'));
      assert.ok(references.includes('Mes recibido') && references.includes('julio de 2043'));
      assert.ok(references.includes('Mes del plan asignado') && references.includes('junio de 2043'));
      await clickText('Editar'); await browser.waitFor('!!document.getElementById("control-amount")');
      assert.equal(await browser.evaluate('!!document.getElementById("control-actor") || !!document.getElementById("control-operation") || !!document.getElementById("control-period")'), false);
      await fill('control-amount', '150'); await submitForm('Movimiento de Control');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.ok((await balance()).includes('−S/ 20.00'));
      await accept(); assert.ok((await balance()).includes('S/ 130.00'));
      await clickText('Registrar movimiento'); await browser.waitFor('!!document.getElementById("control-amount")');
      await browser.evaluate('document.getElementById("control-purpose-savings").click()');
      await select('control-contribution-type', 'habitual');
      await browser.evaluate('document.getElementById("control-assign-plan").click()');
      await fill('control-amount', '150'); await fill('control-date', '2043-07-10'); await fill('control-plan', '2043-06');
      await submitForm('Movimiento de Control');
      await browser.waitFor('!!document.getElementById("control-distinct")');
      assert.equal(await count(), 3);
      await fill('control-distinct', 'Otro depósito inventado con voucher distinto'); await submitForm('Movimiento de Control');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      await browser.evaluate('document.querySelector("[data-review-id] button").click()');
      await browser.waitFor('!!document.getElementById("review-rejected")');
      await browser.evaluate('document.getElementById("review-rejected").click()');
      await fill('review-reason', 'Registro inventado descartado'); await submitForm('Revisar movimiento');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.ok((await balance()).includes('S/ 130.00'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-review-id]").length'), 0);
    });

    await context.test('Control filters, responsive screens and form; state survives navigation and clears on reload', async () => {
      await clickText('Retiros'); assert.equal(await count(), 2);
      await clickText('Depósitos'); assert.equal(await count(), 2);
      await clickText('Por revisar'); assert.equal(await count(), 0);
      await clickText('Todos'); assert.equal(await count(), 4);
      for (const width of [320, 360, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 844 : 1024, deviceScaleFactor: 1, mobile: width < 768 });
        const fits = await browser.evaluate('document.documentElement.scrollWidth <= innerWidth && document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth + 1');
        assert.equal(fits, true, `Control fits ${width}`);
        await clickText('Registrar movimiento'); await browser.waitFor('!!document.getElementById("control-amount")');
        assert.equal(await browser.evaluate('document.querySelector("dialog[open]").scrollWidth <= document.querySelector("dialog[open]").clientWidth + 1'), true);
        assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("input,select")).filter(input => !input.labels?.length).length'), 0);
        await closeSheet();
      }
      await capture('30-control-fase4.png');
      await fill('control-selected-period', '2043-08'); assert.equal(await count(), 0);
      await fill('control-selected-period', '2043-07'); assert.equal(await count(), 4);
      await clickLink('/fiorella', 'Resumen'); assert.doesNotMatch(await visibleText(), /Retiro inventado|S\/ 130\.00/);
      await clickLink('/control', 'Control M&F'); assert.equal(await count(), 4);
      await browser.page('Page.reload');
      await browser.waitFor('!!document.querySelector("[data-testid=control-balance]") && !document.body.textContent.includes("Cargando")');
      assert.equal(await count(), 0); assert.ok((await balance()).includes('S/ 0.00'));
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('fixed form choices stay on one line at 360px; an own goal can be deleted', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 360, height: 844, deviceScaleFactor: 1, mobile: true });
      await clickLink('/fiorella', 'Resumen'); await clickLink('/fiorella/gastos', 'Gastos'); await clickText('Registrar gasto');
      await browser.waitFor('!!document.getElementById("gasto-tipo-fijo")');
      await browser.evaluate('document.getElementById("gasto-tipo-fijo").click()');
      const labels = await browser.evaluate('Array.from(document.querySelectorAll("label[for^=gf-mode]")).map(el => ({text: el.textContent, height: el.clientHeight, line: parseFloat(getComputedStyle(el).lineHeight)}))');
      assert.deepEqual(labels.map(item => item.text), ['Sumar', 'Reemplazar']);
      assert.ok(labels.every(item => item.height < item.line * 3), JSON.stringify(labels));
      await closeSheet();
      await clickLink('/fiorella/metas', 'Metas'); await clickText('Nueva meta');
      await browser.waitFor('!!document.getElementById("goal-title")');
      await fill('goal-title', 'Meta para eliminar'); await fill('goal-target', '100'); await fill('goal-months', '2');
      await submitForm('Meta de ahorro'); await browser.waitFor('!document.querySelector("dialog[open]")');
      await browser.evaluate('document.querySelector("[data-goal-id] button").click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=goal-detail]")');
      await clickText('Eliminar'); await clickText('Confirmar eliminación');
      await browser.waitFor('!document.querySelector("dialog[open]") && !document.querySelector("[data-goal-id]")');
      assert.ok((await visibleText()).includes('Meta eliminada.'));
    });

    await context.test('one month is kept across modules and sheets close with Esc returning focus', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await clickLink('/fiorella', 'Resumen');
      await fill('fiorella-period', '2047-03');
      await clickLink('/control', 'Control M&F');
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
      // Commit and build code, also in the header; the header fits at 320px with the demo badge.
      assert.match(await testText('app-version'), /^Versión \S+ · Compilado: \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2} \(Perú\)$/);
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
      const header = await browser.evaluate(`(() => { const stamp = document.querySelector('[data-testid=build-stamp]').getBoundingClientRect();
        const badge = document.querySelector('[data-testid=demo-mode]').getBoundingClientRect(); const bar = document.querySelector('header > div');
        return { stamp: document.querySelector('[data-testid=build-stamp]').textContent, overlap: stamp.right > badge.left && stamp.bottom > badge.top,
          fits: bar.scrollWidth <= bar.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth, width: stamp.width }; })()`);
      assert.ok(/Actualizado:/.test(header.stamp) && /Versión/.test(header.stamp) && !header.overlap && header.fits && header.width > 0, JSON.stringify(header));
      await capture('26-cabecera-320.png');
      assert.equal(await browser.evaluate('document.querySelectorAll("#login-email, #login-password").length'), 0);
      assert.ok(await browser.evaluate('!!document.querySelector("[data-testid=demo-mode]")'));
      await clickLink('/control', 'Control M&F');
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
