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
      await browser.waitFor(`location.pathname === ${JSON.stringify(path)} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
    };
    const clickLink = async (path, heading) => {
      await browser.evaluate(`document.querySelector('a[href="${path}"]').click()`);
      await browser.waitFor(`location.pathname === ${JSON.stringify(path)} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`);
    };
    const fill = async (id, value) => {
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
        await browser.waitFor('document.querySelector("button")?.textContent.includes("Guardar simulación")');
        if (income === '4000.01') assert.ok(await browser.evaluate('document.body.textContent.includes("600.0024")'));
        await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.includes("Guardar simulación")).click()');
        await browser.waitFor('location.pathname === "/fiorella/historial" && !!document.querySelector("details")');
        await clickLink('/control', 'Control Finanzas M&F');
        const control = await browser.evaluate('document.body.textContent');
        assert.doesNotMatch(control, /S\/\s*\d|4,000\.01|600\.0024|Aportes de Milton/);
        assert.ok(control.includes('no hay un saldo confirmado'));
        await clickLink('/fiorella', 'Finanzas de Fiorella');
        await clickLink('/fiorella/historial', 'Historial');
        if (income === '4000.01') await clickLink('/fiorella/calculadora', 'Simular distribución');
      }
      assert.equal(await browser.evaluate('document.querySelectorAll("details").length'), 2);
      await browser.evaluate('document.querySelector("summary").click()');
      assert.equal(await browser.evaluate('document.querySelector("details").open'), true);
    });

    await context.test('deficit and zero-surplus operations stay blocked with no extra history', async () => {
      await clickLink('/fiorella/calculadora', 'Simular distribución');
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
      assert.ok(await browser.evaluate('document.body.textContent.includes("Historial real aún no importado")'));
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

    await context.test('Fiorella monthly demo separates applied GF, detailed budgets and recorded actuals across periods', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await navigate('/fiorella', 'Finanzas de Fiorella');
      assert.ok((await visibleText()).includes('Sin registrar'));
      await fill('fiorella-period', '2038-04');
      await fill('monthly-income', '5432.01'); await fill('monthly-fixed', '1500');
      await submitForm('Datos mensuales de demostración');
      await browser.waitFor('document.body.textContent.includes("786.402")');
      assert.ok((await visibleText()).includes('Se perderá al recargar'));
      await fill('fiorella-period', '2038-05');
      assert.equal(await browser.evaluate('document.getElementById("monthly-income").value'), '');
      await fill('fiorella-period', '2038-04');
      assert.equal(await browser.evaluate('document.getElementById("monthly-income").value'), '5432.01');
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('01-resumen-movil.png');
      await clickLink('/fiorella/presupuestos', 'Presupuestos GF');
      await fill('budget-servicios-gas', '120.10'); await fill('actual-servicios-gas', '125.20');
      await submitForm('Presupuesto servicios-gas');
      await browser.waitFor('document.body.textContent.includes("S/ 5.10")');
      await fill('actual-servicios-gas', '110.05'); await submitForm('Presupuesto servicios-gas');
      await browser.waitFor('document.body.textContent.includes("S/ 10.05")');
      assert.ok((await visibleText()).includes('S/ 1,500.00'));
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('02-presupuestos-movil.png');
      await browser.evaluate('document.querySelector("form").scrollIntoView({block:"start"})');
      await capture('06-formulario-gf-movil.png');
    });

    await context.test('Fiorella GV accumulates, edits and handles duplicate-looking demos without redistribution', async () => {
      await clickLink('/fiorella/gastos', 'Gastos GV');
      const expense = async (description, amount, category = 'salud', date = '2038-04-09') => {
        await fill('gv-date', date); await fill('gv-description', description); await fill('gv-amount', amount);
        await browser.evaluate(`(() => { const select = document.getElementById('gv-category'); select.value = ${JSON.stringify(category)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
        await submitForm('Gasto variable de demostración');
      };
      await expense('Ejemplo sintético A', '0.10'); await browser.waitFor('document.querySelectorAll("article").length === 1');
      await expense('Ejemplo sintético B', '0.20'); await browser.waitFor('document.querySelectorAll("article").length === 2');
      assert.ok((await visibleText()).includes('S/ 0.30'));
      await expense('Ejemplo sintético ocio', '1000', 'ocio'); await browser.waitFor('document.querySelectorAll("article").length === 3');
      assert.ok((await visibleText()).includes('S/ 213.598'));
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Editar Ejemplo sintético A").click()');
      await fill('gv-amount', '0.15'); await submitForm('Gasto variable de demostración');
      await browser.waitFor('document.body.textContent.includes("S/ 0.35")');
      await expense('Ejemplo sintético A', '0.15');
      await browser.waitFor('document.querySelector("[role=alert]")?.textContent.includes("mismos datos")');
      assert.equal(await browser.evaluate('document.querySelectorAll("article").length'), 3);
      await browser.evaluate('document.getElementById("gv-similar").click()');
      await submitForm('Gasto variable de demostración');
      await browser.waitFor('document.querySelectorAll("article").length === 4');
      assert.ok((await visibleText()).includes('S/ 0.50'));
      // An expense dated in another month is saved in that month and the view follows it.
      await expense('Gasto ficticio de mayo', '2', 'salud', '2038-05-01');
      await browser.waitFor('document.querySelector("[role=status]")?.textContent.includes("mayo de 2038") && document.querySelectorAll("article").length === 1');
      assert.equal(await browser.evaluate('document.getElementById("fiorella-period").value'), '2038-05');
      await fill('fiorella-period', '2038-04');
      await browser.waitFor('document.querySelectorAll("article").length === 4');
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('03-gastos-movil.png');
      await browser.evaluate('document.querySelector("form").scrollIntoView({block:"start"})');
      await capture('07-formulario-gv-movil.png');
      await clickLink('/fiorella/historial', 'Historial');
      assert.ok((await visibleText()).includes('S/ 125.20 → S/ 110.05'));
      assert.ok((await visibleText()).includes('otro gasto con datos coincidentes'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period]").length'), 1);
      await capture('04-historial-movil.png');
    });

    await context.test('Fiorella responsive routes fit 320px, 390px, tablet and desktop with labeled forms', async () => {
      for (const width of [320, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width >= 768 ? 1024 : 844, deviceScaleFactor: 1, mobile: width < 768 });
        for (const [path, heading] of [['/fiorella', 'Finanzas de Fiorella'], ['/fiorella/presupuestos', 'Presupuestos GF'], ['/fiorella/gastos', 'Gastos GV'], ['/fiorella/historial', 'Historial']]) {
          await clickLink(path, heading);
          const geometry = await browser.evaluate(`(() => { const main = document.querySelector('main'); return { width: window.innerWidth,
            document: document.documentElement.scrollWidth, main: main.clientWidth, content: main.scrollWidth,
            unlabeled: Array.from(document.querySelectorAll('input,select')).filter(input => !document.querySelector('label[for="' + input.id + '"]')).length }; })()`);
          assert.ok(geometry.document <= geometry.width, `${width} ${path}: document overflow ${JSON.stringify(geometry)}`);
          assert.ok(geometry.content <= geometry.main + 1, `${width} ${path}: content overflow ${JSON.stringify(geometry)}`);
          assert.equal(geometry.unlabeled, 0, `${width} ${path}: inputs without explicit labels`);
        }
      }
      await clickLink('/fiorella', 'Finanzas de Fiorella'); await capture('05-resumen-escritorio.png');
      await browser.evaluate('document.querySelector("main").scrollTop = document.querySelector("main").scrollHeight');
      await clickLink('/control', 'Control Finanzas M&F');
      assert.equal(await browser.evaluate('document.querySelector("main").scrollTop'), 0);
      assert.doesNotMatch(await visibleText(), /S\/\s*\d|5432|Ejemplo sintético/);
      assert.ok((await visibleText()).includes('no hay un saldo confirmado'));
    });

    await context.test('reload removes all Fiorella demonstrations and their audit without inventing real history', async () => {
      await clickLink('/fiorella', 'Finanzas de Fiorella');
      await clickLink('/fiorella/historial', 'Historial');
      await browser.page('Page.reload');
      await browser.waitFor('document.body?.textContent.includes("Sin registros de demostración en esta sesión")');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period]").length'), 0);
      await clickLink('/fiorella', 'Finanzas de Fiorella');
      assert.equal(await browser.evaluate('document.getElementById("monthly-income").value'), '');
      assert.deepEqual(browser.exceptions, []);
    });

    await context.test('period edits preserve native drafts and applied data while incomplete GF totals stay unavailable', async () => {
      await browser.page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await clickLink('/fiorella/presupuestos', 'Presupuestos GF');
      await fill('fiorella-period', '2040-01');
      await fill('budget-servicios-gas', '80'); await submitForm('Presupuesto servicios-gas');
      await fill('actual-servicios-celular', '30'); await submitForm('Presupuesto servicios-celular');
      assert.ok((await visibleText()).includes('Sin diferencia global GF: información incompleta. 0/19'));
      assert.doesNotMatch(await visibleText(), /Diferencia a favor: S\/ 50\.00/);
      await fill('actual-servicios-gas', '90'); await submitForm('Presupuesto servicios-gas');
      assert.ok((await visibleText()).includes('Exceso: −S/ 10.00'));
      assert.ok((await visibleText()).includes('Sin diferencia global GF: información incompleta. 1/19'));
      await fill('fiorella-period', '');
      assert.equal(await browser.evaluate('document.getElementById("fiorella-period").value'), '');
      assert.equal(await browser.evaluate('document.querySelectorAll("[role=alert]").length'), 0);
      assert.ok((await visibleText()).includes('S/ 80.00'));
      await browser.evaluate('document.getElementById("fiorella-period").focus(); document.getElementById("fiorella-period").blur()');
      await browser.waitFor('document.querySelector("[role=alert]")?.textContent.includes("AAAA-MM")');
      await fill('fiorella-period', '2040-02');
      assert.equal(await browser.evaluate('document.getElementById("budget-servicios-gas").value'), '');
      await fill('fiorella-period', '2040-01');
      await browser.evaluate('Array.from(document.querySelectorAll("p")).find(p => p.textContent.startsWith("Sin diferencia global GF")).scrollIntoView({block:"start"})');
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
      await clickLink('/fiorella/presupuestos', 'Presupuestos GF');
      assert.equal(await browser.evaluate('document.getElementById("budget-servicios-gas").value'), '80');
      assert.equal(await browser.evaluate('document.getElementById("actual-servicios-gas").value'), '90');
      await clickLink('/control', 'Control Finanzas');
      assert.doesNotMatch(await visibleText(), /S\/\s*\d|Objetivo inventado|Fracción sintética/);
      await clickLink('/fiorella', 'Finanzas de Fiorella'); await clickLink('/fiorella/simulador', 'Simulador y metas');
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
      await clickLink('/fiorella', 'Finanzas de Fiorella');
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
