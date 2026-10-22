import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, access, mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { preview } from 'vite';

async function chromiumPath() {
  if (process.env.MILFI_CHROMIUM_PATH) return process.env.MILFI_CHROMIUM_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  for (const folder of (await readdir(cache).catch(() => [])).sort().reverse()) {
    if (!folder.startsWith('chromium-')) continue;
    const candidate = join(cache, folder, 'chrome-linux64', 'chrome');
    try { await access(candidate); return candidate; } catch { /* Try next installed browser. */ }
  }
  throw new Error('Set MILFI_CHROMIUM_PATH to an existing Chromium executable. No browser is downloaded.');
}

async function openBrowser(executable, profile) {
  let stderr = '';
  const child = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
    '--disable-features=BackForwardCache',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chromium startup timed out.')), 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited before connecting (${code}).`)); });
      child.stderr.on('data', chunk => {
        stderr = (stderr + chunk.toString()).slice(-8000);
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    const exceptions = [];
    socket.addEventListener('close', () => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Chromium disconnected.')); }
      pending.clear();
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        const description = (details.exception?.description ?? details.text).slice(0, 1000);
        if (!exceptions.includes(description) && exceptions.length < 10) exceptions.push(description);
      }
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) { reject(new Error(`Chromium unavailable (${child.exitCode}): ${stderr.slice(-1000)}`)); return; }
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    await page('Page.enable');
    await page('Runtime.enable');
    await page('Network.enable');
    await page('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    const evaluate = async expression => {
      const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      const state = await evaluate('({path: location.pathname, heading: document.querySelector("h1")?.textContent})');
      throw new Error(`Browser condition timed out: ${expression}; state=${JSON.stringify(state)}; exceptions=${JSON.stringify(exceptions)}`);
    };
    return { child, exceptions, evaluate, waitFor, page, close: async () => {
      try { if (socket.readyState === WebSocket.OPEN) await send('Browser.close'); } catch { /* Already disconnected. */ } finally {
        socket.close();
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Browser closed.')); }
        child.kill('SIGTERM');
      }
    } };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

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
        ['/historial', '/fiorella/historial', 'Historial y simulaciones'],
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
        await clickLink('/fiorella/historial', 'Historial y simulaciones');
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
      await clickLink('/fiorella/historial', 'Historial y simulaciones');
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

    const captures = process.env.MILFI_CAPTURE_DIR ?? join(tmpdir(), 'milfi-fase2-2-capturas');
    const capture = async name => {
      await mkdir(captures, { recursive: true });
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
      await clickLink('/fiorella/gastos', 'Seguimiento GV');
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
      await expense('Periodo ficticio incorrecto', '2', 'salud', '2038-05-01');
      await browser.waitFor('document.querySelector("[role=alert]")?.textContent.includes("mes y año")');
      assert.equal(await browser.evaluate('document.querySelectorAll("article").length'), 4);
      await browser.evaluate('document.querySelector("main").scrollTop = 0');
      await capture('03-gastos-movil.png');
      await browser.evaluate('document.querySelector("form").scrollIntoView({block:"start"})');
      await capture('07-formulario-gv-movil.png');
      await clickLink('/fiorella/historial', 'Historial y simulaciones');
      assert.ok((await visibleText()).includes('S/ 125.20 → S/ 110.05'));
      assert.ok((await visibleText()).includes('otro gasto con datos coincidentes'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period]").length'), 1);
      await capture('04-historial-movil.png');
    });

    await context.test('Fiorella responsive routes fit 320px, 390px, tablet and desktop with labeled forms', async () => {
      for (const width of [320, 390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: width >= 768 ? 1024 : 844, deviceScaleFactor: 1, mobile: width < 768 });
        for (const [path, heading] of [['/fiorella', 'Finanzas de Fiorella'], ['/fiorella/presupuestos', 'Presupuestos GF'], ['/fiorella/gastos', 'Seguimiento GV'], ['/fiorella/historial', 'Historial y simulaciones']]) {
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
      await clickLink('/fiorella/historial', 'Historial y simulaciones');
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
  } finally {
    try { if (browser) await browser.close(); } finally {
      if (app) await app.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
});
