import { as } from './pgHarness.js';

// TEST ONLY: a minimal supabase-js-like client over PGlite. Each request runs as
// the simulated user (authenticated/anon + JWT claims), like PostgREST, so the
// persistence code is exercised against the real schema, grants and RLS.
const identifier = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsupported identifier ${name}`);
  return name;
};
const selectList = columns => columns.split(',').map(column => column.trim()).filter(Boolean).map(column => {
  const [name, cast] = column.split('::');
  return cast ? `${identifier(name)}::${identifier(cast)} as ${identifier(name)}` : identifier(name);
}).join(', ');
const value = item => item !== null && typeof item === 'object' && !(item instanceof Date) ? JSON.stringify(item) : item;

export function createPgRestClient(db, userId) {
  const run = async (sql, params) => {
    const result = await as(db, userId, sql, params);
    return result.ok ? { data: result.rows, error: null } : { data: null, error: { code: result.code, message: result.error } };
  };
  function builder(table) {
    const state = { table: identifier(table), filters: [], order: null, limit: null, returning: null, mode: 'select', payload: null, single: null };
    const where = params => state.filters.length ? ` where ${state.filters.map(([column, item]) => { params.push(value(item)); return `${identifier(column)} = $${params.length}`; }).join(' and ')}` : '';
    const execute = async () => {
      const params = [];
      let sql;
      if (state.mode === 'select') {
        sql = `select ${selectList(state.columns)} from public.${state.table}${where(params)}`;
        if (state.order) sql += ` order by ${identifier(state.order[0])} ${state.order[1] ? 'asc' : 'desc'}`;
        if (state.limit) sql += ` limit ${Number(state.limit)}`;
      } else if (state.mode === 'insert') {
        const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
        const keys = Object.keys(rows[0]);
        const tuples = rows.map(row => `(${keys.map(key => { params.push(value(row[key])); return `$${params.length}`; }).join(', ')})`);
        sql = `insert into public.${state.table} (${keys.map(identifier).join(', ')}) values ${tuples.join(', ')}`;
      } else if (state.mode === 'update') {
        const sets = Object.entries(state.payload).map(([key, item]) => { params.push(value(item)); return `${identifier(key)} = $${params.length}`; });
        sql = `update public.${state.table} set ${sets.join(', ')}${where(params)}`;
      } else {
        sql = `delete from public.${state.table}${where(params)}`;
      }
      if (state.mode !== 'select') sql += state.returning ? ` returning ${selectList(state.returning)}` : '';
      const result = await run(sql, params);
      if (result.error) return result;
      const data = state.mode === 'select' || state.returning ? result.data : null;
      if (state.single === 'one') return data?.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not exactly one row' } };
      if (state.single === 'maybe') return data?.length > 1 ? { data: null, error: { code: 'PGRST116', message: 'multiple rows' } } : { data: data?.[0] ?? null, error: null };
      return { data, error: null };
    };
    const api = {
      select(columns = '*') { if (state.mode === 'select') state.columns = columns; else state.returning = columns; return api; },
      insert(payload) { state.mode = 'insert'; state.payload = payload; return api; },
      update(payload) { state.mode = 'update'; state.payload = payload; return api; },
      delete() { state.mode = 'delete'; return api; },
      eq(column, item) { state.filters.push([column, item]); return api; },
      order(column, { ascending = true } = {}) { state.order = [column, ascending]; return api; },
      limit(count) { state.limit = count; return api; },
      single() { state.single = 'one'; return execute(); },
      maybeSingle() { state.single = 'maybe'; return execute(); },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    return api;
  }
  return {
    from: builder,
    async rpc(name, args) {
      const entries = Object.entries(args);
      const sql = `select public.${identifier(name)}(${entries.map(([key], index) => `${identifier(key)} := $${index + 1}::jsonb`).join(', ')}) as result`;
      const result = await run(sql, entries.map(([, item]) => JSON.stringify(item)));
      return result.error ? result : { data: result.data[0].result, error: null };
    },
  };
}
