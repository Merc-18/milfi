import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Buffer } from 'node:buffer';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { readSupabaseConfig } from '../src/infrastructure/supabase/config.js';
import { authErrorCode, createAuthGateway } from '../src/infrastructure/supabase/authGateway.js';
import { accessFromPermissions, APPROVED_ACCESS, canManage, canRead, moduleForPath, safeReturnPath } from '../src/domain/access.js';
import { createSessionStore } from '../src/store/sessionStore.js';
import { as, createDatabase, seedSynthetic } from './helpers/pgHarness.js';

// Synthetic identities only. Authentication is simulated with a fake gateway;
// no Supabase project, network call or secret is involved.
const run = promisify(execFile);
const jwt = payload => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
const configured = { status: 'configured', url: 'https://example.invalid', key: 'sb_publishable_synthetic' };

function fakeGateway({ session = null, sessionError = null, signIn = {}, access = {}, signOutResult = { ok: true } } = {}) {
  const listeners = [];
  const calls = [];
  return {
    calls, emit: (event, user) => listeners.forEach(listener => listener(event, user)),
    gateway: {
      async getSession() { calls.push('getSession'); return sessionError ? { ok: false, code: sessionError } : { ok: true, user: session }; },
      async signIn(email, password) { calls.push(['signIn', email]); return signIn[`${email}:${password}`] ?? { ok: false, code: 'INVALID_CREDENTIALS' }; },
      async signOut() { calls.push('signOut'); if (signOutResult.ok) listeners.forEach(listener => listener('SIGNED_OUT', null)); return signOutResult; },
      onChange(listener) { listeners.push(listener); return () => listeners.splice(listeners.indexOf(listener), 1); },
      async loadAccess(userId) { calls.push(['loadAccess', userId]); return access[userId] ?? { ok: true, profile: null, permissions: [] }; },
    },
  };
}
const storeWith = (fake, config = configured) => createSessionStore({ config, connect: async () => ({ gateway: fake.gateway }) });
const milton = { id: 'synthetic-milton', email: 'milton@example.invalid' };
const fiorella = { id: 'synthetic-fiorella', email: 'fiorella@example.invalid' };
const permissions = identity => Object.entries(APPROVED_ACCESS[identity]).map(([module, access]) => ({ module, access }));

test('config: only a public HTTPS project URL with a publishable/anon key is accepted', () => {
  assert.deepEqual(readSupabaseConfig({}), { status: 'unconfigured' });
  assert.deepEqual(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }), { status: 'invalid', reason: 'INCOMPLETE_CONFIGURATION' });
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a' }).reason, 'INSECURE_URL');
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_a' }).reason, 'PRIVILEGED_KEY_REJECTED');
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) }).reason, 'PRIVILEGED_KEY_REJECTED');
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'random' }).reason, 'UNRECOGNIZED_KEY');
  assert.deepEqual(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co/rest', VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }),
    { status: 'configured', url: 'https://x.supabase.co', key: jwt({ role: 'anon' }) });
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local' }).status, 'configured');
});

test('access: permissions come only from database rows and match the SQL assignment matrix', async () => {
  assert.deepEqual(accessFromPermissions([{ module: 'fiorella', access: 'read' }, { module: 'fiorella', access: 'manage' }, { module: 'x', access: 'manage' }, { module: 'control-mf', access: 'admin' }]),
    { fiorella: 'manage', 'control-mf': 'none' });
  assert.deepEqual(accessFromPermissions(null), { fiorella: 'none', 'control-mf': 'none' });
  assert.deepEqual([canRead('read'), canManage('read'), canManage('manage'), canRead('none'), canManage('demo')], [true, false, true, false, true]);
  assert.deepEqual(['/fiorella/gastos', '/control/preimportacion', '/acceso', '/'].map(moduleForPath), ['fiorella', 'control-mf', null, null]);
  assert.deepEqual(['/control', '/fiorella/gastos', '/'].map(safeReturnPath), ['/control', '/fiorella/gastos', '/']);
  for (const hostile of ['//evil.example', '/\\evil.example', '/\\/evil.example', 'https://evil.example', '/x//y', '/%2F%2Fevil', 'javascript:alert(1)', '', null, '/a b'])
    assert.equal(safeReturnPath(hostile), null, String(hostile));
  const db = await createDatabase();
  const users = await seedSynthetic(db);
  for (const identity of ['milton', 'fiorella']) {
    const rows = (await as(db, users[identity], 'select module, access from public.module_permissions where user_id = $1', [users[identity]])).rows;
    assert.deepEqual(accessFromPermissions(rows), { ...APPROVED_ACCESS[identity] });
  }
  assert.deepEqual(accessFromPermissions((await as(db, users.outsider, 'select module, access from public.module_permissions')).rows), { fiorella: 'none', 'control-mf': 'none' });
});

test('session: demo mode without configuration never pretends to authenticate', async () => {
  const store = createSessionStore({ config: { status: 'unconfigured' }, connect: async () => assert.fail('must not connect') });
  assert.deepEqual([store.getState().mode, store.getState().status], ['demo', 'demo']);
  await store.getState().start();
  assert.deepEqual(await store.getState().signIn('a@example.invalid', 'x'), { ok: false, code: 'AUTH_NOT_CONFIGURED' });
  const invalid = createSessionStore({ config: { status: 'invalid', reason: 'PRIVILEGED_KEY_REJECTED' }, connect: async () => assert.fail('must not connect') });
  await invalid.getState().start();
  assert.deepEqual([invalid.getState().status, invalid.getState().error], ['config-error', 'PRIVILEGED_KEY_REJECTED']);
});

test('session: sign-in loads permissions from the database, handles errors and users without access', async () => {
  const fake = fakeGateway({
    signIn: { 'milton@example.invalid:clave': { ok: true, user: milton }, 'otro@example.invalid:clave': { ok: true, user: { id: 'synthetic-other' } } },
    access: { [milton.id]: { ok: true, profile: { identity: 'milton', display_name: 'Milton' }, permissions: permissions('milton') } },
  });
  const store = storeWith(fake);
  await store.getState().start();
  assert.equal(store.getState().status, 'signed-out');
  assert.deepEqual(await store.getState().signIn('milton@example.invalid', 'mala'), { ok: false, code: 'INVALID_CREDENTIALS' });
  assert.deepEqual([store.getState().status, store.getState().error], ['signed-out', 'INVALID_CREDENTIALS']);
  assert.deepEqual(await store.getState().signIn(' ', ''), { ok: false, code: 'MISSING_CREDENTIALS' });
  assert.equal((await store.getState().signIn('milton@example.invalid', 'clave')).ok, true);
  assert.equal(store.getState().status, 'ready');
  assert.deepEqual(store.getState().access, { fiorella: 'read', 'control-mf': 'manage' });
  await store.getState().signOut();
  assert.deepEqual([store.getState().status, store.getState().user, store.getState().access], ['signed-out', null, null]);
  await store.getState().signIn('otro@example.invalid', 'clave');
  assert.equal(store.getState().status, 'no-access');
});

test('session: recovered sessions, expiry, revocation and backend failures are explicit states', async () => {
  const recovered = fakeGateway({ session: fiorella, access: { [fiorella.id]: { ok: true, profile: { identity: 'fiorella' }, permissions: permissions('fiorella') } } });
  const store = storeWith(recovered);
  await store.getState().start();
  assert.deepEqual([store.getState().status, store.getState().access], ['ready', { fiorella: 'manage', 'control-mf': 'read' }]);
  recovered.emit('SIGNED_OUT', null);
  assert.deepEqual([store.getState().status, store.getState().error, store.getState().access], ['expired', 'SESSION_EXPIRED', null]);
  const broken = storeWith(fakeGateway({ sessionError: 'SESSION_EXPIRED' }));
  await broken.getState().start();
  assert.equal(broken.getState().status, 'expired');
  const failing = storeWith(fakeGateway({ session: fiorella, access: { [fiorella.id]: { ok: false, code: 'ACCESS_LOAD_FAILED' } } }));
  await failing.getState().start();
  assert.deepEqual([failing.getState().status, failing.getState().access], ['error', null]);
  const unreachable = createSessionStore({ config: configured, connect: async () => { throw new Error('offline'); } });
  await unreachable.getState().start();
  assert.deepEqual([unreachable.getState().status, unreachable.getState().error], ['error', 'AUTH_CLIENT_UNAVAILABLE']);
});

test('gateway: maps auth errors to codes and reads permissions without user metadata', async () => {
  assert.deepEqual([
    { code: 'invalid_credentials' }, { message: 'Invalid login credentials' }, { status: 429 }, { name: 'AuthRetryableFetchError' },
    { code: 'refresh_token_not_found' }, { message: 'unexpected' },
  ].map(authErrorCode), ['INVALID_CREDENTIALS', 'INVALID_CREDENTIALS', 'RATE_LIMITED', 'NETWORK_ERROR', 'SESSION_EXPIRED', 'AUTH_ERROR']);
  const queries = [];
  const query = table => {
    const state = { table, filters: [] };
    const builder = {
      select(columns) { state.columns = columns; return builder; },
      eq(column, value) { state.filters.push([column, value]); return builder; },
      maybeSingle: async () => ({ data: { user_id: 'u', household_id: 'h', identity: 'milton', display_name: 'Milton' }, error: null }),
      then: (resolve) => resolve({ data: [{ module: 'control-mf', access: 'manage' }], error: null }),
    };
    queries.push(state);
    return builder;
  };
  const client = { from: query, auth: { getSession: async () => ({ data: { session: { user: { id: 'u', email: 'x', user_metadata: { role: 'admin' } } } }, error: null }) } };
  const gateway = createAuthGateway(client);
  assert.deepEqual(await gateway.getSession(), { ok: true, user: { id: 'u', email: 'x' }, expiresAt: null });
  const loaded = await gateway.loadAccess('u');
  assert.deepEqual(loaded.permissions, [{ module: 'control-mf', access: 'manage' }]);
  assert.deepEqual(queries.map(item => [item.table, item.filters]), [['profiles', [['user_id', 'u']]], ['module_permissions', [['user_id', 'u'], ['household_id', 'h']]]]);
});

test('screens: routes and management controls follow the loaded module access', async () => {
  const server = await createServer({ configFile: false, envDir: new URL('./fixtures/no-env/', import.meta.url).pathname, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { AppRoutes, SessionViewContext } = await server.ssrLoadModule('/tests/helpers/ssrEntry.js');
    let view = null;
    const tree = path => createElement(MemoryRouter, { initialEntries: [path] }, createElement(AppRoutes));
    const render = path => renderToStaticMarkup(view ? createElement(SessionViewContext.Provider, { value: view }, tree(path)) : tree(path));
    assert.ok(render('/control').includes('data-testid="demo-mode"'));
    assert.ok(render('/acceso').includes('Autenticación no configurada'));
    const setSession = (status, access = null) => { view = { mode: 'auth', status, access }; };
    setSession('ready', APPROVED_ACCESS.fiorella);
    let html = render('/control');
    assert.ok(html.includes('Solo consulta') && !html.includes('Registrar ejemplo temporal') && !html.includes('Abrir preimportación'));
    assert.ok(render('/control/preimportacion').includes('Página no encontrada'));
    html = render('/fiorella');
    assert.ok(html.includes('Registrar datos del mes') && !html.includes('Solo consulta'));
    setSession('ready', APPROVED_ACCESS.milton);
    html = render('/fiorella');
    assert.ok(html.includes('Solo consulta') && !html.includes('Registrar datos del mes'));
    for (const path of ['/fiorella/gastos', '/fiorella/presupuestos', '/fiorella/simulador']) assert.ok(render(path).includes('Solo consulta'), path);
    assert.ok(render('/control').includes('Registrar ejemplo temporal'));
    setSession('ready', { fiorella: 'none', 'control-mf': 'read' });
    assert.ok(render('/fiorella').includes('Sin permiso para este módulo'));
    setSession('no-access', { fiorella: 'none', 'control-mf': 'none' });
    assert.ok(render('/control').includes('Sin permisos asignados'));
    for (const status of ['signed-out', 'expired']) { setSession(status); assert.ok(!render('/control').includes('Control Finanzas M&amp;F</h1>'), status); }
    setSession('initializing');
    assert.ok(render('/fiorella').includes('Verificando la sesión'));
  } finally {
    await server.close();
  }
});

test('secrets: no privileged key, env file or service-role reference is committed or bundled', async () => {
  const { stdout } = await run('git', ['ls-files'], { cwd: new URL('..', import.meta.url) });
  const tracked = stdout.split('\n').filter(Boolean);
  assert.ok(!tracked.some(file => /(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example')));
  const sources = (await readdir(new URL('../src/', import.meta.url), { recursive: true })).filter(name => /\.(js|jsx)$/.test(name));
  for (const name of sources) {
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /SERVICE_ROLE|service_role_key|sb_secret_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, name);
  }
  const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(example, /^VITE_SUPABASE_URL=$/m);
  assert.doesNotMatch(example, /SERVICE|SECRET|=[^\n]+/);
});
