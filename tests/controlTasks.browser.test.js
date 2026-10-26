import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromiumPath, openBrowser } from './helpers/chromium.js';
import { fixedClockScript } from './helpers/clock.js';
import { persistedFixture } from './helpers/persistedFixture.js';
import { APPROVED_ACCESS } from '../src/domain/access.js';
import { prepareControlEntry, prepareControlEntryReview } from '../src/domain/controlLedger.js';

// Every amount and month is invented. The invented Fiorella history plans
// couple savings of S/ 432 (January 2031), S/ 456.024 (February) and S/ 528
// (March, projected); the page's today is 15 March 2031, so April (the receipt
// month of March's plan) has not started.
const month = (year, value) => ({ year, month: value });
function record(householdId, fields, pending = false) {
  const prepared = prepareControlEntry({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), householdId, expectedRevision: 0,
    actorId: 'milton', kind: 'deposit', purpose: 'savings', currency: 'PEN', amount: '10', contributorId: 'fiorella', planPeriod: null,
    description: 'Movimiento inventado', provenanceNote: 'Prueba sintética', ...fields });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const saved = { ...prepared.value, revision: 1 };
  if (pending) return saved;
  const reviewed = prepareControlEntryReview({ id: saved.id, expectedRevision: 1, decision: 'accepted', reviewedBy: 'milton', reason: 'Prueba',
    evidenceReference: 'Inventado' }, [saved]);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.errors));
  return { ...saved, manualReviews: [{ ...reviewed.review, id: crypto.randomUUID(), reviewedBy: 'milton', reviewedAt: '2031-03-01T00:00:00.000Z',
    evidenceReference: 'Inventado' }] };
}

test('Control tasks: one count everywhere, plan assignment (single and batch), USD and month cards', { timeout: 180000 }, async context => {
  const base = await persistedFixture();
  const id = base.householdId;
  const exactJan = record(id, { amount: '432', period: month(2031, 2), effectiveDate: '2031-02-05', description: 'Depósito A inventado' });
  const exactFeb = record(id, { amount: '432', period: month(2031, 2), effectiveDate: '2031-02-20', description: 'Depósito B inventado' });
  const other = record(id, { amount: '100', period: month(2031, 3), effectiveDate: '2031-03-06', description: 'Depósito C inventado' });
  const early = record(id, { amount: '50', period: month(2030, 12), effectiveDate: '2030-12-03', description: 'Depósito anterior inventado' });
  const pending = record(id, { amount: '900', period: month(2031, 3), effectiveDate: '2031-03-08', description: 'Pendiente inventado' }, true);
  const fixture = { householdId: id, fiorella: base.fiorella, control: { ok: true, records: [exactJan, exactFeb, other, early, pending] } };
  const profile = await mkdtemp(join(tmpdir(), 'milfi-control-tasks-'));
  const server = await createServer({ envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false } });
  let browser;
  try {
    await server.listen();
    browser = await openBrowser(await chromiumPath(), profile);
    await browser.page('Page.addScriptToEvaluateOnNewDocument', { source: fixedClockScript('2031-03-15T12:00:00-05:00') });
    await browser.page('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/harness/persisted.html` });
    await browser.waitFor('typeof window.mountMilfi === "function"');
    const size = width => browser.page('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    const mount = async (path, data = fixture) => {
      const options = { fixture: data, identity: 'milton', access: APPROVED_ACCESS.milton, path, period: '2031-03' };
      await browser.evaluate(`window.mountMilfi(${JSON.stringify(options)})`);
      await browser.waitFor('!!document.querySelector("h1") && !document.body.textContent.includes("Cargando")');
    };
    const snapshot = () => browser.evaluate('window.controlSnapshot()');
    const planOf = async recordId => (await snapshot()).control.records.find(item => item.id === recordId).planPeriod;
    const click = label => browser.evaluate(`Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent === ${JSON.stringify(label)}).click()`);
    const hasButton = label => browser.evaluate(`Array.from(document.querySelectorAll('dialog[open] button'))
      .some(button => button.textContent === ${JSON.stringify(label)})`);
    const text = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
    const homeCount = () => browser.evaluate(`Array.from(document.querySelectorAll('a[href="/control"] p'))
      .find(p => p.previousElementSibling?.textContent === 'Tareas pendientes').textContent`);
    const capture = async name => {
      if (!process.env.MILFI_CAPTURE_DIR) return;
      await mkdir(process.env.MILFI_CAPTURE_DIR, { recursive: true });
      // The whole page in one viewport, so the fixed bottom bar stays at the bottom.
      const width = await browser.evaluate('innerWidth');
      const height = await browser.evaluate('document.documentElement.scrollHeight');
      await browser.page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      const { data } = await browser.page('Page.captureScreenshot', { format: 'png' });
      await size(width);
      await writeFile(join(process.env.MILFI_CAPTURE_DIR, name), Buffer.from(data, 'base64'));
    };

    await context.test('Inicio, the strip and "Por revisar" show the same count; pre-Fiorella deposits are not tasks', async () => {
      await mount('/');
      assert.equal(await homeCount(), '4');
      await mount('/control');
      assert.equal(await text('[data-testid=control-tasks] h2'), 'Tienes 4 tareas: 1 por confirmar, 3 sin mes del plan');
      assert.equal(await browser.evaluate('document.querySelector("[data-testid=control-tasks]").dataset.taskCount'), '4');
      await size(390); await capture('control-390-con-tareas.png');
      await size(1280); await capture('control-1280-con-tareas.png');
      await click('Resolver');
      assert.equal(await text('#por-revisar h3'), 'Por revisar (4)');
      assert.equal(await text('[data-testid=control-no-plan] summary'), 'Depósitos sin plan de Fiorella (1)');
      assert.ok((await text('[data-testid=control-no-plan]')).includes('No hay plan registrado para el mes anterior; no requieren acción.'));
      assert.ok((await text('[data-testid=control-no-plan]')).includes('S/ 50.00 recibido en diciembre de 2030'));
      assert.ok(!(await text('[aria-label="Sin mes del plan"]')).includes('S/ 50.00'));
    });

    await context.test('single assignment suggests the previous month and saves only after confirmation', async () => {
      await browser.evaluate(`document.querySelector('[data-assign-id="${other.id}"] button').click()`);
      await browser.waitFor('!!document.getElementById("assign-plan")');
      assert.equal(await text('[data-testid=assign-single] p'), 'S/ 100.00 recibido en marzo de 2031 → plan de febrero (previsto S/ 456.024)');
      assert.equal(await browser.evaluate('document.getElementById("assign-plan").value'), '2031-02');
      assert.equal(await planOf(other.id), null, 'opening the sheet saves nothing');
      await browser.evaluate('document.querySelector("dialog[open] button[aria-label=Cerrar]").click()');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await planOf(other.id), null, 'closing without confirming saves nothing');
      await browser.evaluate(`document.querySelector('[data-assign-id="${other.id}"] button').click()`);
      await browser.waitFor('!!document.getElementById("assign-plan")');
      await click('Confirmar asignación');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.deepEqual(await planOf(other.id), month(2031, 2));
      assert.equal(await text('[data-testid=control-tasks] h2'), 'Tienes 3 tareas: 1 por confirmar, 2 sin mes del plan');
    });

    await context.test('batch: only exact matches, boxes can be unchecked, nothing without confirming, failures one by one', async () => {
      await click('Asignar los 2 que coinciden con su plan');
      await browser.waitFor('!!document.querySelector("[data-testid=assign-batch]")');
      const checks = () => browser.evaluate('Array.from(document.querySelectorAll("[data-assign-check]")).map(box => [box.dataset.assignCheck, box.checked])');
      assert.deepEqual(await checks(), [[exactJan.id, true], [exactFeb.id, true]]);
      assert.ok(await hasButton('Confirmar 2 asignaciones'));
      await capture('control-asignacion-lote.png');
      await browser.evaluate(`document.querySelector('[data-assign-check="${exactFeb.id}"]').click()`);
      assert.ok(await hasButton('Confirmar 1 asignación'));
      assert.deepEqual([await planOf(exactJan.id), await planOf(exactFeb.id)], [null, null], 'nothing saved before confirming');
      await browser.evaluate(`document.querySelector('[data-assign-check="${exactFeb.id}"]').click()`);
      await browser.evaluate(`window.failControlSaves = [${JSON.stringify(exactFeb.id)}]`);
      await click('Confirmar 2 asignaciones');
      await browser.waitFor(`!!document.querySelector('[data-assign-failure="${exactFeb.id}"]')`);
      const alert = await text('[data-testid=assign-batch] [role=alert]');
      assert.ok(alert.startsWith('1 asignación guardada. No se pudo asignar:') && alert.includes('S/ 432.00 recibido en febrero de 2031'), alert);
      assert.ok(alert.includes('El movimiento cambió'), alert);
      assert.deepEqual([await planOf(exactJan.id), await planOf(exactFeb.id)], [month(2031, 1), null]);
      await browser.evaluate('window.failControlSaves = []');
      await click('Confirmar 1 asignación');
      await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.deepEqual(await planOf(exactFeb.id), month(2031, 1));
      assert.equal(await text('[data-testid=control-tasks] h2'), 'Tienes 1 tarea: 1 por confirmar');
      await mount('/', await snapshot());
      assert.equal(await homeCount(), '1');
    });

    await context.test('month by month: no empty future months; cards below 640 px, table above, same months', async () => {
      await mount('/control', await snapshot());
      const months = selector => browser.evaluate(`Array.from(document.querySelectorAll('${selector}')).map(el => el.dataset.month ?? el.dataset.monthCard)`);
      assert.deepEqual(await months('[data-testid=control-monthly] tr[data-month]'), ['2031-03', '2031-02', '2030-12']);
      const shown = selector => browser.evaluate(`!!document.querySelector('${selector}').offsetParent`);
      await size(390);
      assert.deepEqual([await shown('[data-month-card]'), await shown('[data-testid=control-monthly] table')], [true, false]);
      assert.deepEqual(await months('[data-month-card]'), ['2031-03', '2031-02', '2030-12']);
      assert.ok((await text('[data-month-card="2031-02"]')).includes('S/ 864.00 de S/ 432.00 (plan de enero)'));
      await size(1280);
      assert.deepEqual([await shown('[data-month-card]'), await shown('[data-testid=control-monthly] table')], [false, true]);
    });

    await context.test('dollars: nothing without USD; spent without USD deposits; savings and chart with them', async () => {
      assert.equal(await text('[data-testid=control-usd-balance]'), null);
      assert.equal(await browser.evaluate('!!document.querySelector("[data-currency-chart=USD]")'), false);
      const withdrawal = record(id, { kind: 'withdrawal', contributorId: null, currency: 'USD', amount: '5', period: month(2031, 3),
        effectiveDate: '2031-03-09' });
      await mount('/control', { ...fixture, control: { ok: true, records: [exactJan, withdrawal] } });
      assert.equal(await text('[data-testid=control-usd-balance]'), 'Gastado en dólares: US$ 5.00');
      assert.equal(await browser.evaluate('!!document.querySelector("[data-currency-chart=USD]")'), false);
      const deposit = record(id, { currency: 'USD', amount: '30', period: month(2031, 2), effectiveDate: '2031-02-09' });
      await mount('/control', { ...fixture, control: { ok: true, records: [exactJan, withdrawal, deposit] } });
      assert.equal(await text('[data-testid=control-usd-balance]'), 'Ahorro en dólares: US$ 25.00');
      assert.equal(await browser.evaluate('!!document.querySelector("[data-currency-chart=USD] svg")'), true);
    });

    await context.test('without tasks there is no strip', async () => {
      const assigned = [{ ...exactJan, planPeriod: month(2031, 1) }, { ...other, planPeriod: month(2031, 2) }];
      await mount('/control', { ...fixture, control: { ok: true, records: assigned } });
      assert.equal(await browser.evaluate('!!document.querySelector("[data-testid=control-tasks]")'), false);
      await size(390); await capture('control-390-sin-tareas.png');
      await size(1280); await capture('control-1280-sin-tareas.png');
      assert.deepEqual(browser.exceptions, []);
    });
  } finally {
    if (browser) await browser.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
