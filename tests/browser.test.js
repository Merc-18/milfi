import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, access } from 'node:fs/promises';
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
  } finally {
    try { if (browser) await browser.close(); } finally {
      if (app) await app.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
});
