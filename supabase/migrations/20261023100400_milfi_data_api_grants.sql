-- MilFi 2.0 · Explicit Data API (PostgREST) privileges.
-- Do not rely on Supabase defaults: the API role "authenticated" receives USAGE
-- on public explicitly (its table privileges are granted in the security
-- migration and constrained by RLS). anon keeps no table, sequence or function
-- privilege.
grant usage on schema public to authenticated;

-- Functions created later by postgres (the role that owns MilFi objects) are not
-- executable by PUBLIC, anon or authenticated unless a migration grants EXECUTE
-- explicitly. The PUBLIC default is global in PostgreSQL, so it is revoked
-- without IN SCHEMA. FOR ROLE postgres: the CLI may use a temporary login role.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
