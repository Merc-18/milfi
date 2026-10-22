import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// TEST ONLY: in-memory PostgreSQL (PGlite) with simulated Supabase identities.
// Never used by the frontend and never holds real data.
const root = new URL('../../', import.meta.url);

export async function migrationFiles() {
  const folder = new URL('supabase/migrations/', root);
  return (await readdir(folder)).filter(name => name.endsWith('.sql')).sort().map(name => new URL(name, folder));
}

export async function createDatabase() {
  const db = new PGlite();
  await db.exec(await readFile(new URL('tests/sql/supabase-emulation.sql', root), 'utf8'));
  for (const file of await migrationFiles()) await db.exec(await readFile(file, 'utf8'));
  return db;
}

/** Synthetic household with Milton, Fiorella, an outsider and a second household. */
export async function seedSynthetic(db) {
  const ids = { milton: randomUUID(), fiorella: randomUUID(), outsider: randomUUID(), otherOwner: randomUUID() };
  for (const [name, id] of Object.entries(ids)) {
    // The outsider claims admin-like metadata: it must have no effect on authorization.
    const metadata = name === 'outsider' ? '{"role":"control_admin","identity":"milton"}' : '{}';
    await db.query('insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3::jsonb, $3::jsonb)', [id, `${name}@example.invalid`, metadata]);
  }
  const household = (await db.query("insert into public.households (name) values ('Hogar sintético') returning id")).rows[0].id;
  const otherHousehold = (await db.query("insert into public.households (name) values ('Otro hogar sintético') returning id")).rows[0].id;
  await db.query("select private.assign_member($1, $2, 'milton', 'Milton')", [ids.milton, household]);
  await db.query("select private.assign_member($1, $2, 'fiorella', 'Fiorella')", [ids.fiorella, household]);
  // A full member of a different household: a third party for this household.
  await db.query("select private.assign_member($1, $2, 'milton', 'Tercero')", [ids.otherOwner, otherHousehold]);
  return { ...ids, household, otherHousehold };
}

/**
 * Runs SQL as a non-privileged API role inside its own transaction, the way
 * PostgREST does: a non-superuser "authenticator" session, SET LOCAL ROLE and
 * the JWT claims. user = null → anon.
 */
export async function as(db, user, sql, params = [], claims = {}) {
  try {
    return await db.transaction(async tx => {
      await tx.exec('set local session authorization authenticator');
      await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: 'authenticated', ...claims } : { role: 'anon', ...claims })]);
      const result = await tx.query(sql, params);
      return { ok: true, rows: result.rows, affected: result.affectedRows ?? 0 };
    });
  } catch (error) {
    return { ok: false, error: error.message, code: error.code };
  } finally {
    // PGlite keeps SET LOCAL SESSION AUTHORIZATION after an aborted transaction
    // (PostgreSQL would revert it). Restore the owner so test setup is unaffected.
    await db.exec('set session authorization postgres');
  }
}
