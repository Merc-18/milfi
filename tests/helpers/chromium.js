import { spawn } from 'node:child_process';
import { readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

// Shared headless Chromium (CDP) helpers for the browser tests and the live
// check script. Uses an already installed Chromium; nothing is downloaded.
export async function chromiumPath() {
  if (process.env.MILFI_CHROMIUM_PATH) return process.env.MILFI_CHROMIUM_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  for (const folder of (await readdir(cache).catch(() => [])).sort().reverse()) {
    if (!folder.startsWith('chromium-')) continue;
    const candidate = join(cache, folder, 'chrome-linux64', 'chrome');
    try { await access(candidate); return candidate; } catch { /* Try next installed browser. */ }
  }
  throw new Error('Set MILFI_CHROMIUM_PATH to an existing Chromium executable. No browser is downloaded.');
}

export async function openBrowser(executable, profile) {
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
      const state = await evaluate('({path: location.pathname, heading: document.querySelector("h1")?.textContent, formTops: Array.from(document.querySelectorAll("form")).map(form => ({label: form.getAttribute("aria-label"), top: form.getBoundingClientRect().top})), viewportHeight: innerHeight})');
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
