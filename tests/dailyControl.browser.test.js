import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { createServer as httpServer } from 'node:http';
import process from 'node:process';
import { build, createServer } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { APPROVED_ACCESS } from '../src/domain/access.js';
import { prepareControlEntry, prepareControlEntryReview } from '../src/domain/controlLedger.js';

const period = { year: 2031, month: 10 };
function record(fields, accepted = true) {
  const input = { id: crypto.randomUUID(), operationId: crypto.randomUUID(), householdId: 'daily-household', actorId: 'milton', expectedRevision: 0,
    kind: 'deposit', purpose: 'savings', period, planPeriod: null, effectiveDate: '2031-10-01', currency: 'PEN', amount: '50',
    contributorId: 'fiorella', description: 'Histórico inventado', provenanceNote: 'Prueba', ...fields };
  const prepared = prepareControlEntry(input); assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const saved = { ...prepared.value, revision: 1 };
  if (!accepted) return saved;
  const review = prepareControlEntryReview({ id: saved.id, expectedRevision: 1, reviewedBy: 'milton', decision: 'accepted', reason: 'Prueba', evidenceReference: 'Inventado' }, [saved]);
  return { ...saved, manualReviews: [{ ...review.review, id: crypto.randomUUID(), reviewedBy: 'milton', reviewedAt: '2031-10-02T12:00:00.000Z', evidenceReference: 'Inventado' }] };
}

test('daily Control browser: explicit extras, people/currencies, reload and permission', { timeout: 90000 }, async context => {
  const folder = await mkdtemp(join(tmpdir(), 'milfi-daily-ui-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen(); browser = await openBrowser(await chromiumPath(), folder);
    await browser.page('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/harness/persisted.html` });
    await browser.waitFor('typeof window.mountMilfi === "function"');
    const fixture = { householdId: 'daily-household', fiorella: { ok: true, records: [], goals: [] }, control: { ok: true, records: [
      record({ period: { year: 2031, month: 9 }, effectiveDate: '2031-09-01' }), record({ contributorId: 'milton', currency: null, amount: '900', description: 'Moneda pendiente' }, false),
    ] } };
    const mount = async (identity, data = fixture) => {
      await browser.evaluate(`window.mountMilfi(${JSON.stringify({ fixture: data, identity, access: APPROVED_ACCESS[identity], path: '/control', period: '2031-10' })})`);
      await browser.waitFor('!!document.querySelector("[data-contribution-person=milton]") && !document.body.textContent.includes("Cargando")');
    };
    const click = text => browser.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`);
    const fill = (id, value) => browser.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const select = (id, value) => browser.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const submit = label => browser.evaluate(`document.querySelector('form[aria-label="${label}"]').requestSubmit()`);
    const snapshot = () => browser.evaluate('window.controlSnapshot()');
    const accept = async description => {
      await browser.evaluate('document.querySelector("[data-testid=control-tasks] button[aria-expanded=false]")?.click()');
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-review-id]')).find(el => el.textContent.includes(${JSON.stringify(description)})).querySelector('button').click()`);
      await browser.waitFor('!!document.getElementById("review-reference")'); await fill('review-reference', 'Voucher inventado'); await submit('Revisar movimiento');
      await browser.waitFor('!document.querySelector("dialog[open]")');
    };
    const deposit = async ({ who = 'milton', purpose = 'expenses', currency = 'PEN', amount, type, extra, description, review = true }) => {
      await click('Registrar movimiento'); await browser.waitFor('!!document.getElementById("control-amount")');
      await browser.evaluate(`document.getElementById('control-purpose-${purpose}').click();document.getElementById('control-contributor-${who}').click()`);
      await select('control-currency', currency); await select('control-contribution-type', type);
      await fill('control-amount', amount); await fill('control-date', '2031-10-12'); await fill('control-description', description);
      if (extra) await fill('control-extra', extra);
      await submit('Movimiento de Control'); await browser.waitFor('!document.querySelector("dialog[open]")');
      if (review) await accept(description);
    };
    await mount('milton');
    await context.test('both people and PEN/USD always visible; unresolved currency and historical classification stay explicit', async () => {
      const text = await browser.evaluate('document.querySelector("[data-testid=control-contributions]").textContent');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-contribution-person]").length'), 2);
      assert.ok(text.includes('Milton') && text.includes('Fiorella'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-contribution-group*=\':USD:\']").length'), 0, 'no dollars, no USD lines');
      assert.ok(text.includes('1 aporte por revisar, fuera de los totales'));
      // The historical classification is shown in the detail only.
      await browser.evaluate('document.getElementById("movement-history").click()');
      assert.ok(!(await browser.evaluate('document.querySelector("[data-testid=control-movements]").textContent')).includes('Sin clasificación histórica'));
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-ledger-id]')).find(row => row.textContent.includes('Histórico inventado')).querySelector('button').click()`);
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=movement-detail]")');
      assert.ok((await browser.evaluate('document.querySelector("dialog[open]").textContent')).includes('Sin clasificación histórica'));
      await browser.evaluate('document.querySelector("dialog[open] button[aria-label=Cerrar]").click()');
      await browser.evaluate('document.getElementById("movement-history").click()');
    });
    await context.test('two independent deposits and a combined deposit keep transfer identities and exact totals', async () => {
      await deposit({ amount: '600', type: 'habitual', description: 'Habitual inventado' });
      await deposit({ amount: '100', type: 'extraordinary', description: 'Extra inventado' });
      const expenseText = await browser.evaluate('document.querySelector("[data-contribution-group=\\"milton:PEN:expenses\\"]").textContent');
      assert.ok(expenseText.includes('S/ 700.00 este mes · S/ 700.00 acumulado') && expenseText.includes('Habitual S/ 600.00 · Extra S/ 100.00'),
        expenseText);
      // Deliberately invalid split: no extra transfer is manufactured.
      await click('Registrar movimiento'); await browser.waitFor('!!document.getElementById("control-amount")');
      await browser.evaluate('document.getElementById("control-purpose-savings").click();document.getElementById("control-contributor-milton").click()');
      await select('control-contribution-type', 'combined'); await fill('control-amount', '700'); await fill('control-extra', '800');
      await fill('control-date', '2031-10-12'); await fill('control-description', 'Combinado inventado'); await submit('Movimiento de Control');
      await browser.waitFor('document.querySelector("form[aria-label=\\"Movimiento de Control\\"] [role=alert]")?.textContent.includes("coincidir exactamente")');
      assert.equal((await snapshot()).control.records.length, 4);
      await fill('control-extra', '100'); await submit('Movimiento de Control'); await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-balance]").textContent')).includes('S/ 50.00'), 'pending transfer excluded');
      await accept('Combinado inventado');
      const data = await snapshot();
      assert.equal(data.control.records.length, 5);
      const combined = data.control.records.find(item => item.description === 'Combinado inventado');
      assert.deepEqual(combined.provenance.contribution, { version: 1, regular: '600', extra: '100' });
      assert.deepEqual([combined.amount, combined.period, combined.planPeriod, combined.effectiveDate], ['700', period, null, '2031-10-12']);
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-balance]").textContent')).includes('S/ 750.00'));
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-monthly] [data-month=\\"2031-10\\"]").textContent')).includes('Sin plan'));
    });
    await context.test('USD extraordinary deposit stays USD, agreements are explicit and do not create deposits', async () => {
      await deposit({ who: 'fiorella', purpose: 'savings', currency: 'USD', amount: '20', type: 'extraordinary', description: 'Extra USD inventado' });
      const count = (await snapshot()).control.records.length;
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-usd-balance]").textContent')).includes('US$ 20.00'));
      await click('Definir compromiso'); await browser.waitFor('!!document.getElementById("commitment-amount")');
      await fill('commitment-amount', '600'); await browser.evaluate('document.getElementById("commitment-confirm").click()');
      await submit('Compromiso de aporte'); await browser.waitFor('!document.querySelector("dialog[open]")');
      const data = await snapshot(); assert.equal(data.control.records.length, count); assert.equal(data.control.commitments[0].amount, '600');
      await deposit({ purpose: 'savings', currency: 'USD', amount: '999', type: 'extraordinary', description: 'Extra pendiente', review: false });
      assert.ok((await browser.evaluate('document.querySelector("[data-testid=control-usd-balance]").textContent')).includes('US$ 20.00'));
      assert.equal((await snapshot()).control.commitments[0].amount, '600');
    });
    await context.test('single movement history filters by person/currency/destination/period and opens transfer details', async () => {
      const filters = async () => { await click('Filtros'); await browser.waitFor('!!document.getElementById("movement-person")'); };
      await filters();
      await select('movement-person', 'milton'); await select('movement-currency', 'PEN'); await select('movement-purpose', 'expenses');
      await click('Ver movimientos'); await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.ok(await browser.evaluate('Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Filtros (3)")'));
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-ledger-id]").length'), 2);
      await browser.evaluate('document.querySelector("[data-ledger-id] button").click()');
      await browser.waitFor('!!document.querySelector("dialog[open] [data-testid=movement-detail]")');
      const detail = await browser.evaluate('document.querySelector("dialog[open]").textContent');
      assert.ok(detail.includes('Fecha de recepción') && detail.includes('Tipo de aporte') && detail.includes('Procedencia'));
      await browser.evaluate('document.querySelector("dialog[open] button[aria-label=Cerrar]").click()');
      await click('Filtros (3)'); await browser.waitFor('!!document.getElementById("movement-person")');
      await select('movement-purpose', 'all'); await select('movement-currency', 'unknown');
      await click('Ver movimientos'); await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-ledger-id]").length'), 1);
    });
    await context.test('save/remount preserves classification and agreement, responsive at 390/768/1280, Fiorella only reads', async () => {
      const data = await snapshot(); await mount('milton', data);
      assert.equal((await snapshot()).control.records.length, data.control.records.length);
      assert.deepEqual((await snapshot()).control.commitments, data.control.commitments);
      for (const width of [390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
        assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth && document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth + 1'), true, `fits ${width}`);
        await browser.evaluate('document.querySelector("[data-testid=control-contributions]").scrollIntoView({block:"start"}); window.scrollBy(0, -100)');
        const screenshot = await browser.page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(join(tmpdir(), `milfi-daily-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      await mount('fiorella', data);
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button")).some(button => ["Registrar movimiento", "Definir compromiso"].includes(button.textContent))'), false);
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-contribution-person]").length'), 2);
      assert.deepEqual(browser.exceptions, []);
    });
  } finally { if (browser) await browser.close(); await server.close(); await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('daily PWA: two real compilations replace cached version and retain fixed Peru build metadata', { timeout: 120000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'milfi-daily-pwa-'));
  const previous = process.env.VERCEL_GIT_COMMIT_SHA;
  let browser; let server;
  try {
    const builds = [];
    for (const commit of ['a1b2c3d000000000000000000000000000000000', 'b2c3d4e000000000000000000000000000000000']) {
      process.env.VERCEL_GIT_COMMIT_SHA = commit;
      const dir = join(folder, commit.slice(0, 7)); const started = Date.now();
      await build({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error', build: { outDir: dir, emptyOutDir: true } });
      builds.push({ dir, version: commit.slice(0, 7), started, finished: Date.now() });
    }
    let active = builds[0].dir;
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
    server = httpServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        let file = resolve(active, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(active + '/')) { response.writeHead(403); response.end(); return; }
        if (!(await stat(file).catch(() => null))?.isFile()) file = join(active, 'index.html');
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
        response.end(await readFile(file));
      } catch { response.writeHead(500); response.end(); }
    });
    await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
    browser = await openBrowser(await chromiumPath(), join(folder, 'profile'));
    await browser.page('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await browser.waitFor(`document.querySelector('[data-testid=commit-version]')?.textContent === 'Versión ${builds[0].version}'`);
    await browser.waitFor('!!navigator.serviceWorker.controller');
    const first = await browser.evaluate('({ label: document.querySelector("[data-testid=build-stamp]").textContent, time: document.querySelector("[data-testid=build-stamp] time").dateTime })');
    assert.match(first.label, /Actualizado: \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}/);
    const builtAt = new Date(first.time).getTime();
    assert.ok(builtAt >= builds[0].started - 1000 && builtAt <= builds[0].finished, first.time);
    await browser.page('Page.reload'); await browser.waitFor(`document.querySelector('[data-testid=commit-version]')?.textContent === 'Versión ${builds[0].version}'`);
    assert.equal(await browser.evaluate('document.querySelector("[data-testid=build-stamp] time").dateTime'), first.time);
    active = builds[1].dir;
    await browser.evaluate('(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); return true; })()');
    await browser.waitFor(`document.querySelector('[data-testid=commit-version]')?.textContent === 'Versión ${builds[1].version}'`);
    await browser.page('Page.reload'); await browser.waitFor(`document.querySelector('[data-testid=commit-version]')?.textContent === 'Versión ${builds[1].version}'`);
    assert.equal(await browser.evaluate(`document.querySelector('[data-testid=build-stamp]').textContent.includes('${builds[0].version}')`), false);
    assert.deepEqual(browser.exceptions, []);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = previous;
    if (browser) await browser.close(); if (server) await new Promise(resolveServer => server.close(resolveServer));
    await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
