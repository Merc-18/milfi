import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createServer } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { gfBudgetFixture } from './helpers/gfBudgetFixture.js';
import { summarizeFiorella } from '../src/domain/fiorellaSession.js';
import { summarizeExpenses } from '../src/domain/fiorellaDashboard.js';
import { formatAmount } from '../src/presentation/format.js';

test('compact GF budgets: responsive rows, editing, shared totals and read-only access', { timeout: 90000 }, async context => {
  const fixture = gfBudgetFixture();
  const profile = await mkdtemp(join(tmpdir(), 'milfi-gf-browser-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen();
    browser = await openBrowser(await chromiumPath(), profile);
    await browser.page('Network.setBlockedURLs', { urls: ['https://*'] });
    const url = `http://127.0.0.1:${server.httpServer.address().port}/tests/harness/persisted.html`;
    const openHarness = async () => {
      await browser.page('Page.navigate', { url });
      await browser.waitFor('typeof window.mountMilfi === "function"');
    };
    const mount = async (identity = 'fiorella', data = fixture) => {
      await browser.evaluate(`window.mountMilfi(${JSON.stringify({ fixture: data, identity, access: { fiorella: identity === 'fiorella' ? 'manage' : 'read', 'control-mf': identity === 'fiorella' ? 'read' : 'manage' }, path: '/fiorella/presupuestos', fiorellaPeriod: '2038-04', controlPeriod: '2038-04' })})`);
      await browser.waitFor('document.querySelectorAll("[data-budget-id]").length === 19 && !document.body.textContent.includes("Cargando")');
    };
    const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const edit = async id => { await click(`[data-budget-id="${id}"] button`); await browser.waitFor(`!!document.getElementById("budget-${id}")`); };
    const fill = async (id, value) => browser.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    const row = id => browser.evaluate(`document.querySelector('[data-budget-id="${id}"]').textContent`);
    const text = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
    const submit = () => browser.evaluate('document.querySelector("main form").requestSubmit()');
    await openHarness(); await mount();

    await context.test('all 19 rows visible at 390/768/1280; null, zero, excess and partial coverage stay distinct', async () => {
      assert.ok((await row('servicios-icloud')).includes('−S/ 12.005'));
      assert.ok((await row('servicios-celular')).includes('S/ 0.00'));
      assert.ok((await row('servicios-agua')).includes('—'));
      assert.ok((await row('servicios-luz')).includes('—'));
      assert.ok((await text('[data-testid=budget-summary-servicios]')).includes('parcial'));
      for (const width of [390, 768, 1280]) {
        await browser.page('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
        await browser.evaluate('document.activeElement?.blur(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const geometry = await browser.evaluate(`({width:innerWidth,document:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
          groups:document.querySelectorAll('[data-testid=budget-groups] > section').length,
          hidden:Array.from(document.querySelectorAll('[data-budget-id]')).filter(el=>!el.getBoundingClientRect().height || el.closest('details:not([open])')).length,
          overflow:Array.from(document.querySelectorAll('[data-budget-id] [role=cell]')).some(el=>el.scrollWidth>el.clientWidth+1),
          forms:document.querySelectorAll('main form').length})`);
        assert.equal(geometry.document, width); assert.equal(geometry.groups, 5); assert.equal(geometry.hidden, 0); assert.equal(geometry.forms, 0); assert.equal(geometry.overflow, false);
        console.log('GF geometry', JSON.stringify(geometry));
        if (process.env.MILFI_CAPTURE_DIR) {
          await mkdir(process.env.MILFI_CAPTURE_DIR, { recursive: true });
          const { data } = await browser.page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: geometry.height, scale: 1 } });
          await writeFile(join(process.env.MILFI_CAPTURE_DIR, `after-${width}.png`), Buffer.from(data, 'base64'));
        }
        await edit('servicios-gas');
        assert.equal(await browser.evaluate('document.activeElement.id'), 'budget-servicios-gas');
        assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth && document.querySelector("main form").scrollWidth <= document.querySelector("main form").clientWidth + 1'), true);
        await browser.page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        await browser.page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
        await browser.waitFor('!document.querySelector("main form")');
        await browser.waitFor('document.activeElement.getAttribute("aria-label") === "Editar Gas"');
        assert.equal(await browser.evaluate('document.activeElement.getAttribute("aria-label")'), 'Editar Gas');
        await browser.evaluate('window.scrollTo(0,0)');
      }
      await fill('fiorella-period', '2038-05');
      await browser.waitFor('document.querySelector("[data-testid=budget-totals]").textContent.includes("Detalle completo")');
      assert.ok((await text('[data-testid=budget-totals]')).includes('+S/ 19.19'));
      await fill('fiorella-period', '2038-04');
    });

    // Fake persistence in memory: the real saveFiorellaDemo validation/refresh
    // path runs; no Supabase connection or database is created by this test.
    await browser.evaluate(`(async () => {
      const {useStore} = await import('/src/store/useStore.js');
      window.gfStore = useStore;
      const remote = useStore.getState().remote;
      window.gfData = {records:structuredClone(useStore.getState().fiorellaDemoRecords), events:[], calls:0, fail:false};
      remote.loadFiorella = async () => ({ok:true,records:structuredClone(window.gfData.records),goals:[]});
      remote.loadFiorellaHistory = async () => ({ok:true,events:structuredClone(window.gfData.events)});
      remote.saveFiorellaRecord = async (record, previous) => {
        window.gfData.calls++;
        await new Promise(resolve=>setTimeout(resolve,250));
        if (window.gfData.fail) return {ok:false,errors:['PERSISTENCE_ERROR']};
        window.gfData.records = window.gfData.records.filter(item=>item.id !== record.id).concat(structuredClone(record));
        window.gfData.events.push({id:crypto.randomUUID(),recordId:record.id,revision:record.revision,period:record.period,moduleId:'fiorella',origin:'real',action:previous?'updated':'created',occurredAt:record.updatedAt,before:previous,after:record});
        return {ok:true,value:structuredClone(record)};
      };
    })()`);
    const baseline = await browser.evaluate('structuredClone(window.gfData.records)');

    await context.test('one editor, cancel without writing, validation errors and duplicate-submit protection', async () => {
      await edit('servicios-gas'); await fill('actual-servicios-gas', '999');
      await click('main form button[type=button]');
      assert.equal(await browser.evaluate('window.gfData.calls'), 0);
      assert.ok((await row('servicios-gas')).includes('S/ 31.50'));
      await edit('servicios-gas'); await fill('actual-servicios-gas', '99');
      await browser.evaluate(`window.gfData.records.find(record => record.kind === 'fixed-budget' && record.period.month === 4 && record.categoryId === 'servicios-gas').revision++; window.gfStore.getState().refreshRemote()`);
      await submit();
      await browser.waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Este registro cambió")');
      assert.equal(await browser.evaluate('window.gfData.calls'), 0);
      await click('main form button[type=button]');
      await browser.evaluate(`window.gfData.records = ${JSON.stringify(baseline)}; window.gfStore.getState().refreshRemote()`);
      await edit('servicios-gas'); await edit('servicios-celular');
      assert.equal(await browser.evaluate('document.querySelectorAll("main form").length'), 1);
      await fill('actual-servicios-celular', '-1'); await submit();
      await browser.waitFor('!!document.querySelector("main [role=alert]")');
      assert.equal(await browser.evaluate('window.gfData.calls'), 0);
      await click('main form button[type=button]');
      await edit('servicios-gas'); await fill('budget-servicios-gas', '70.10');
      await browser.evaluate('document.querySelector("main form").requestSubmit();document.querySelector("main form").requestSubmit()');
      await browser.waitFor('document.querySelector("main form")?.getAttribute("aria-busy") === "true"');
      await browser.waitFor('!document.querySelector("main form") && document.body.textContent.includes("Guardado · Gas")');
      await browser.waitFor('document.activeElement.getAttribute("aria-label") === "Editar Gas"');
      assert.equal(await browser.evaluate('window.gfData.calls'), 1);
      assert.ok((await row('servicios-gas')).includes('S/ 70.10') && (await row('servicios-gas')).includes('S/ 31.50'));
      await edit('servicios-gas'); await fill('actual-servicios-gas', '45.123');
      await browser.evaluate('window.gfData.fail = true'); await submit();
      await browser.waitFor('!!document.querySelector("main [role=alert]") && !document.querySelector("main form").matches("[aria-busy=true]")');
      assert.ok((await row('servicios-gas')).includes('S/ 31.50'));
      await browser.evaluate('window.gfData.fail = false'); await submit();
      await browser.waitFor('!document.querySelector("main form")');
      assert.ok((await row('servicios-gas')).includes('S/ 45.123'));
      assert.ok((await text('[data-testid=budget-summary-servicios]')).includes('S/ 180.128'));
      assert.equal(await browser.evaluate('window.gfData.records.length'), baseline.length);
    });

    await context.test('Gastos, Panel and history share the update once; applied GF and Control stay unchanged; remount retains saved data', async () => {
      const saved = await browser.evaluate('structuredClone(window.gfData.records)');
      const before = summarizeFiorella(baseline, { year: 2038, month: 4 }, 'real');
      const after = summarizeFiorella(saved, { year: 2038, month: 4 }, 'real');
      assert.deepEqual(after.variable, before.variable);
      assert.deepEqual(after.monthly, before.monthly);
      assert.deepEqual(after.calculation, before.calculation);
      assert.equal(after.fixed.length, 19);
      assert.equal(after.fixed.find(item => item.categoryId === 'servicios-gas').revision, before.fixed.find(item => item.categoryId === 'servicios-gas').revision + 2);
      const expenses = summarizeExpenses(after);
      await click('a[href="/fiorella/gastos"]'); await browser.waitFor('!!document.querySelector("[data-testid=fixed-expenses]")');
      assert.ok((await text('[data-fixed-id=servicios-gas]')).includes('S/ 45.123'));
      assert.ok((await text('[data-testid=expense-summary]')).includes(formatAmount(expenses.total.amount)));
      await click('a[href="/fiorella"]'); await browser.waitFor('!!document.querySelector("[data-testid=expense-total]")');
      assert.ok((await text('[data-testid=expense-total]')).includes(formatAmount(expenses.total.amount)));
      await click('a[href="/fiorella/historial"]'); await browser.waitFor('!!document.getElementById("history-search")');
      await fill('history-search', 'Servicios / Gas');
      await browser.waitFor('document.querySelectorAll("[data-demo-period] article").length >= 1');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-demo-period] > div > article").length'), 1);
      assert.ok((await text('[data-demo-period]')).includes('S/ 45.123'));
      assert.equal(await browser.evaluate('window.gfData.events.length'), 2);
      assert.deepEqual(await browser.evaluate(`import('/src/store/ledgerStore.js').then(({useLedgerStore})=>useLedgerStore.getState().records)`), []);
      await openHarness(); await mount('fiorella', { ...fixture, fiorella: { ok: true, records: saved, goals: [] } });
      assert.ok((await row('servicios-gas')).includes('S/ 45.123'));
    });

    await context.test('Milton sees all rows without editors or write controls', async () => {
      await mount('milton');
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-budget-id] button, main form").length'), 0);
      assert.equal(await browser.evaluate('document.querySelectorAll("[data-budget-id]").length'), 19);
      assert.ok((await text('main')).includes('Solo consulta'));
    });
    assert.deepEqual(browser.exceptions, []);
  } finally {
    await browser?.close(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
