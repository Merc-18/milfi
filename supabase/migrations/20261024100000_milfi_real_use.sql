-- MilFi 2.0 · Real daily use.
-- 1. Fields the Fiorella tables could not keep from her workbook: projected
--    months, GV subcategory and notes, goal deadline/status/notes, provenance.
-- 2. Atomic, one-time historical load of Fiorella's workbook (SECURITY INVOKER:
--    the caller's grants and RLS policies apply to every statement inside).
-- No policy or grant from previous migrations is relaxed.

-- A projected month (future income/GF typed in advance) is not money received.
alter table public.fiorella_monthly_plans
  add column plan_status text not null default 'actual' check (plan_status in ('actual', 'projected')),
  add column provenance jsonb check (provenance is null or jsonb_typeof(provenance) = 'object');

alter table public.fiorella_fixed_budgets
  add column provenance jsonb check (provenance is null or jsonb_typeof(provenance) = 'object');

alter table public.fiorella_variable_expenses
  add column subcategory text check (subcategory is null or length(btrim(subcategory)) between 1 and 80),
  add column notes text check (notes is null or length(btrim(notes)) between 1 and 500),
  add column provenance jsonb check (provenance is null or jsonb_typeof(provenance) = 'object'),
  -- Stable source position (sheet + row) of an imported expense; NULL when typed in the app.
  add column source_ref text check (source_ref is null or length(source_ref) between 1 and 200);
create unique index fiorella_variable_expenses_source_ref
  on public.fiorella_variable_expenses (household_id, source_ref) where source_ref is not null;

-- Goals are plans, never deposits. A goal kept by Fiorella is real; session goals stay simulated.
do $$
declare item record;
begin
  for item in
    select conname from pg_constraint
    where conrelid = 'public.fiorella_savings_goals'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%origin = ''simulated''::text%'
  loop
    execute format('alter table public.fiorella_savings_goals drop constraint %I', item.conname);
  end loop;
end;
$$;
alter table public.fiorella_savings_goals
  add constraint fiorella_savings_goals_origin check (origin in ('real', 'simulated')),
  add column deadline_year smallint check (deadline_year between 1 and 9999),
  add column deadline_month smallint check (deadline_month between 1 and 12),
  -- Deadline exactly as written in the source (e.g. "Dic 2026").
  add column deadline_label text check (deadline_label is null or length(btrim(deadline_label)) between 1 and 40),
  add column status text not null default 'active' check (status in ('active', 'paused', 'achieved', 'cancelled')),
  add column notes text check (notes is null or length(btrim(notes)) between 1 and 500),
  add column provenance jsonb check (provenance is null or jsonb_typeof(provenance) = 'object'),
  add column source_ref text check (source_ref is null or length(source_ref) between 1 and 200),
  add constraint fiorella_savings_goals_deadline check ((deadline_year is null) = (deadline_month is null));
create unique index fiorella_savings_goals_source_ref
  on public.fiorella_savings_goals (household_id, source_ref) where source_ref is not null;

-- One transaction for the whole workbook: any duplicate period, subcategory or
-- source row aborts everything, so a repeated load cannot create copies.
create function public.import_fiorella_history(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  household uuid := (payload->>'household_id')::uuid;
  item jsonb;
  counts jsonb := '{}'::jsonb;
  total integer;
begin
  if household is null or jsonb_typeof(payload->'provenance') <> 'object'
    or (payload->'provenance'->>'sourceFingerprint') !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_IMPORT' using errcode = '22023';
  end if;

  total := 0;
  for item in select value from jsonb_array_elements(coalesce(payload->'monthly_plans', '[]'::jsonb)) loop
    insert into public.fiorella_monthly_plans (household_id, period_year, period_month, income, applied_fixed_expense, plan_status, origin, provenance)
    values (household, (item->>'period_year')::smallint, (item->>'period_month')::smallint, (item->>'income')::numeric,
      (item->>'applied_fixed_expense')::numeric, item->>'plan_status', 'real', item->'provenance');
    total := total + 1;
  end loop;
  counts := counts || jsonb_build_object('monthly_plans', total);

  total := 0;
  for item in select value from jsonb_array_elements(coalesce(payload->'fixed_budgets', '[]'::jsonb)) loop
    insert into public.fiorella_fixed_budgets (household_id, period_year, period_month, category_id, budget_amount, actual_amount, origin, provenance)
    values (household, (item->>'period_year')::smallint, (item->>'period_month')::smallint, item->>'category_id',
      (item->>'budget_amount')::numeric, (item->>'actual_amount')::numeric, 'real', item->'provenance');
    total := total + 1;
  end loop;
  counts := counts || jsonb_build_object('fixed_budgets', total);

  total := 0;
  for item in select value from jsonb_array_elements(coalesce(payload->'variable_expenses', '[]'::jsonb)) loop
    insert into public.fiorella_variable_expenses (household_id, period_year, period_month, category_id, subcategory, effective_date,
      description, amount, notes, distinct_operation_reason, origin, provenance, source_ref)
    values (household, (item->>'period_year')::smallint, (item->>'period_month')::smallint, item->>'category_id', item->>'subcategory',
      (item->>'effective_date')::date, item->>'description', (item->>'amount')::numeric, item->>'notes', item->>'distinct_operation_reason',
      'real', item->'provenance', item->>'source_ref');
    total := total + 1;
  end loop;
  counts := counts || jsonb_build_object('variable_expenses', total);

  total := 0;
  for item in select value from jsonb_array_elements(coalesce(payload->'savings_goals', '[]'::jsonb)) loop
    insert into public.fiorella_savings_goals (household_id, title, target_amount, months, deadline_year, deadline_month, deadline_label,
      status, notes, origin, provenance, source_ref)
    values (household, item->>'title', (item->>'target_amount')::numeric, (item->>'months')::integer, (item->>'deadline_year')::smallint,
      (item->>'deadline_month')::smallint, item->>'deadline_label', item->>'status', item->>'notes', 'real', item->'provenance', item->>'source_ref');
    total := total + 1;
  end loop;
  return counts || jsonb_build_object('savings_goals', total);
end;
$$;

revoke all on function public.import_fiorella_history(jsonb) from public, anon;
grant execute on function public.import_fiorella_history(jsonb) to authenticated;
