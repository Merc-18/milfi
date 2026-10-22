-- MilFi 2.0 · Grants and Row Level Security.
-- Supabase grants every new public table to anon/authenticated by default; start
-- from nothing and grant back only what the policies below are meant to govern.
revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated, public;

grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.has_module_access(uuid, text, text) to authenticated;

-- Membership data: readable by members of the same household, never writable by apps.
grant select on public.households, public.profiles, public.module_permissions to authenticated;
-- Financial tables: full DML, constrained per row by the policies.
grant select, insert, update, delete on
  public.fiorella_monthly_plans, public.fiorella_fixed_budgets, public.fiorella_variable_expenses,
  public.fiorella_savings_goals, public.control_movements to authenticated;
-- Append-only records.
grant select, insert on public.control_movement_reviews, public.control_import_batches to authenticated;
grant select on public.audit_events to authenticated;
-- anon receives no grant at all: unauthenticated requests are denied before RLS.

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.module_permissions enable row level security;
alter table public.fiorella_monthly_plans enable row level security;
alter table public.fiorella_fixed_budgets enable row level security;
alter table public.fiorella_variable_expenses enable row level security;
alter table public.fiorella_savings_goals enable row level security;
alter table public.control_import_batches enable row level security;
alter table public.control_movements enable row level security;
alter table public.control_movement_reviews enable row level security;
alter table public.audit_events enable row level security;

create policy households_select_members on public.households for select to authenticated
  using ((select private.is_household_member(id)));
create policy profiles_select_household on public.profiles for select to authenticated
  using ((select private.is_household_member(household_id)));
create policy permissions_select_household on public.module_permissions for select to authenticated
  using ((select private.is_household_member(household_id)));

-- Finanzas de Fiorella: managed by Fiorella, readable by Milton.
create policy fiorella_monthly_plans_read on public.fiorella_monthly_plans for select to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'read')));
create policy fiorella_monthly_plans_insert on public.fiorella_monthly_plans for insert to authenticated
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_monthly_plans_update on public.fiorella_monthly_plans for update to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')))
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_monthly_plans_delete on public.fiorella_monthly_plans for delete to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')));

create policy fiorella_fixed_budgets_read on public.fiorella_fixed_budgets for select to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'read')));
create policy fiorella_fixed_budgets_insert on public.fiorella_fixed_budgets for insert to authenticated
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_fixed_budgets_update on public.fiorella_fixed_budgets for update to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')))
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_fixed_budgets_delete on public.fiorella_fixed_budgets for delete to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')));

create policy fiorella_variable_expenses_read on public.fiorella_variable_expenses for select to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'read')));
create policy fiorella_variable_expenses_insert on public.fiorella_variable_expenses for insert to authenticated
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_variable_expenses_update on public.fiorella_variable_expenses for update to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')))
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_variable_expenses_delete on public.fiorella_variable_expenses for delete to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')));

create policy fiorella_savings_goals_read on public.fiorella_savings_goals for select to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'read')));
create policy fiorella_savings_goals_insert on public.fiorella_savings_goals for insert to authenticated
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_savings_goals_update on public.fiorella_savings_goals for update to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')))
  with check ((select private.has_module_access(household_id, 'fiorella', 'manage')));
create policy fiorella_savings_goals_delete on public.fiorella_savings_goals for delete to authenticated
  using ((select private.has_module_access(household_id, 'fiorella', 'manage')));

-- Control Finanzas M&F: managed by Milton, readable by Fiorella.
create policy control_movements_read on public.control_movements for select to authenticated
  using ((select private.has_module_access(household_id, 'control-mf', 'read')));
create policy control_movements_insert on public.control_movements for insert to authenticated
  with check ((select private.has_module_access(household_id, 'control-mf', 'manage')));
create policy control_movements_update on public.control_movements for update to authenticated
  using ((select private.has_module_access(household_id, 'control-mf', 'manage')))
  with check ((select private.has_module_access(household_id, 'control-mf', 'manage')));
create policy control_movements_delete on public.control_movements for delete to authenticated
  using ((select private.has_module_access(household_id, 'control-mf', 'manage')));

create policy control_import_batches_read on public.control_import_batches for select to authenticated
  using ((select private.has_module_access(household_id, 'control-mf', 'read')));
create policy control_import_batches_insert on public.control_import_batches for insert to authenticated
  with check ((select private.has_module_access(household_id, 'control-mf', 'manage')));

create policy control_movement_reviews_read on public.control_movement_reviews for select to authenticated
  using ((select private.has_module_access(household_id, 'control-mf', 'read')));
create policy control_movement_reviews_insert on public.control_movement_reviews for insert to authenticated
  with check ((select private.has_module_access(household_id, 'control-mf', 'manage')));

create policy audit_events_read on public.audit_events for select to authenticated
  using ((select private.has_module_access(household_id, module, 'read')));
