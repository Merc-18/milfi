-- TEST ONLY. Minimal emulation of what a Supabase project provides before the
-- MilFi migrations run: API roles, the auth schema/users table and auth.uid()
-- reading the verified JWT claims PostgREST sets per request. Authentication is
-- simulated here; the real check must be repeated on a Supabase project.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
-- PostgREST's connection role: switches to anon/authenticated per request. In
-- Supabase it may also become service_role, but only with a service-role JWT,
-- which never reaches the browser; it is deliberately not granted here.
create role authenticator login noinherit;
grant anon, authenticated to authenticator;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase's permissive defaults, so the migrations' revocations are exercised.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
