-- MilFi 2.0 · Identity, households and trusted module permissions.
-- Authorization depends only on auth.uid() and on rows written by trusted admin
-- functions; never on user_metadata, app_metadata or any client-editable value.

create schema if not exists private;
revoke all on schema private from public;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete restrict,
  identity text not null check (identity in ('milton', 'fiorella')),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (household_id, identity)
);

create table public.module_permissions (
  household_id uuid not null,
  user_id uuid not null,
  module text not null check (module in ('fiorella', 'control-mf')),
  access text not null check (access in ('read', 'manage')),
  primary key (household_id, user_id, module),
  foreign key (user_id) references public.profiles (user_id) on delete cascade,
  foreign key (household_id) references public.households (id) on delete cascade
);

-- Policy helpers. SECURITY DEFINER with an empty search_path so they can read the
-- permission tables regardless of the caller's own grants, without injection.
create function private.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and household_id = target_household
  );
$$;

create function private.has_module_access(target_household uuid, target_module text, required_access text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.module_permissions permission
    join public.profiles profile
      on profile.user_id = permission.user_id and profile.household_id = permission.household_id
    where permission.user_id = (select auth.uid())
      and permission.household_id = target_household
      and permission.module = target_module
      and (permission.access = 'manage' or required_access = 'read')
  );
$$;

-- Admin-only assignment with the approved fixed matrix:
--   fiorella: manages "fiorella", reads "control-mf"
--   milton:   reads "fiorella", manages "control-mf"
-- Executable only by the database owner/service role, never by app users.
create function private.assign_member(target_user uuid, target_household uuid, member_identity text, member_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if member_identity not in ('milton', 'fiorella') then
    raise exception 'UNSUPPORTED_IDENTITY' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, household_id, identity, display_name)
  values (target_user, target_household, member_identity, member_name)
  on conflict (user_id) do update set household_id = excluded.household_id, identity = excluded.identity, display_name = excluded.display_name;
  delete from public.module_permissions where user_id = target_user;
  insert into public.module_permissions (household_id, user_id, module, access) values
    (target_household, target_user, 'fiorella', case member_identity when 'fiorella' then 'manage' else 'read' end),
    (target_household, target_user, 'control-mf', case member_identity when 'milton' then 'manage' else 'read' end);
end;
$$;

revoke all on function private.is_household_member(uuid) from public;
revoke all on function private.has_module_access(uuid, text, text) from public;
revoke all on function private.assign_member(uuid, uuid, text, text) from public;
