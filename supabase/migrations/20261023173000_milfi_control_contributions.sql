-- Explicit, per-period agreements. No history rewrite, recurring deposits or backfill.
create table public.control_contribution_commitments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete restrict,
  period_year smallint not null check (period_year between 1 and 9999),
  period_month smallint not null check (period_month between 1 and 12),
  contributor_identity text not null check (contributor_identity in ('milton', 'fiorella')),
  currency text not null check (currency in ('PEN', 'USD')),
  purpose text not null check (purpose in ('expenses', 'savings')),
  amount numeric not null check (amount > 0), note text check (length(note) <= 500),
  revision integer not null default 1, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (household_id, period_year, period_month, contributor_identity, currency, purpose)
);
create trigger stamp_control_contribution_commitments before insert on public.control_contribution_commitments
  for each row execute function private.stamp_record();
create trigger audit_control_contribution_commitments after insert on public.control_contribution_commitments
  for each row execute function private.audit_change('control-mf');
alter table public.control_contribution_commitments enable row level security;
revoke all on public.control_contribution_commitments from public, anon, authenticated;
grant select, insert on public.control_contribution_commitments to authenticated;
create policy control_commitments_read on public.control_contribution_commitments for select to authenticated
  using ((select private.has_module_access(household_id, 'control-mf', 'read')));
create policy control_commitments_insert on public.control_contribution_commitments for insert to authenticated
  with check ((select private.has_module_access(household_id, 'control-mf', 'manage')));

-- Classifications live in the existing audited provenance JSON. Old records
-- without a classification remain valid and unclassified, without UPDATEs.
alter table public.control_movements add constraint control_contribution_split check (
  not (provenance ? 'contribution') or (
    kind = 'deposit' and amount is not null and
    jsonb_typeof(provenance->'contribution') = 'object' and
    jsonb_typeof(provenance->'contribution'->'version') = 'number' and
    provenance->'contribution'->>'version' = '1' and
    jsonb_typeof(provenance->'contribution'->'regular') = 'string' and
    jsonb_typeof(provenance->'contribution'->'extra') = 'string' and
    length(provenance->'contribution'->>'regular') <= 100 and
    length(provenance->'contribution'->>'extra') <= 100 and
    case when provenance->'contribution'->>'regular' ~ '^[0-9]+(\.[0-9]+)?$'
      and provenance->'contribution'->>'extra' ~ '^[0-9]+(\.[0-9]+)?$'
      then (provenance->'contribution'->>'regular')::numeric + (provenance->'contribution'->>'extra')::numeric = amount
      else false end
  ) is true
);
