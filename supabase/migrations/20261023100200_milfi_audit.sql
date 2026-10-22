-- MilFi 2.0 · Change history. Written only by triggers (SECURITY DEFINER);
-- app users can read it per module permissions but never write or edit it.
create table public.audit_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete restrict,
  module text not null check (module in ('fiorella', 'control-mf')),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  revision integer,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
create index audit_events_record on public.audit_events (table_name, record_id, id);

create function private.audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  current_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  previous_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  source jsonb := coalesce(current_row, previous_row);
begin
  insert into public.audit_events (household_id, module, table_name, record_id, action, revision, actor_id, before, after)
  values ((source->>'household_id')::uuid, tg_argv[0], tg_table_name, (source->>'id')::uuid, lower(tg_op),
    (source->>'revision')::integer, (select auth.uid()), previous_row, current_row);
  return null;
end;
$$;
revoke all on function private.audit_change() from public;

create trigger audit_fiorella_monthly_plans after insert or update or delete on public.fiorella_monthly_plans for each row execute function private.audit_change('fiorella');
create trigger audit_fiorella_fixed_budgets after insert or update or delete on public.fiorella_fixed_budgets for each row execute function private.audit_change('fiorella');
create trigger audit_fiorella_variable_expenses after insert or update or delete on public.fiorella_variable_expenses for each row execute function private.audit_change('fiorella');
create trigger audit_fiorella_savings_goals after insert or update or delete on public.fiorella_savings_goals for each row execute function private.audit_change('fiorella');
create trigger audit_control_movements after insert or update or delete on public.control_movements for each row execute function private.audit_change('control-mf');
create trigger audit_control_movement_reviews after insert on public.control_movement_reviews for each row execute function private.audit_change('control-mf');
create trigger audit_control_import_batches after insert on public.control_import_batches for each row execute function private.audit_change('control-mf');
