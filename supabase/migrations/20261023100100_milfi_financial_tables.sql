-- MilFi 2.0 · Financial records for both modules.
-- Amounts are NUMERIC without scale: exact decimal values, never binary floats.
-- Clients must read them as text (amount::text) to keep every digit.

-- Stamps authorship/time and enforces optimistic concurrency: an UPDATE must
-- set revision = previous revision + 1, so a stale client cannot overwrite a
-- newer change. Ownership and identity columns are immutable.
create function private.stamp_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_by := (select auth.uid());
    new.updated_by := (select auth.uid());
    new.created_at := now();
    new.updated_at := now();
  else
    if new.id <> old.id or new.household_id <> old.household_id
      or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'IMMUTABLE_COLUMNS' using errcode = '42501';
    end if;
    if new.revision is distinct from old.revision + 1 then
      raise exception 'STALE_REVISION' using errcode = '40001';
    end if;
    new.updated_by := (select auth.uid());
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_record() from public;

-- ── Finanzas de Fiorella ─────────────────────────────────────────────────────
create table public.fiorella_monthly_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  period_year smallint not null check (period_year between 1 and 9999),
  period_month smallint not null check (period_month between 1 and 12),
  income numeric check (income >= 0),
  -- Official cap of the approved rules (fiorella-official-v1): S/ 1,500.
  applied_fixed_expense numeric check (applied_fixed_expense >= 0 and applied_fixed_expense <= 1500),
  rules_version text not null default 'fiorella-official-v1' check (rules_version = 'fiorella-official-v1'),
  currency text not null default 'PEN' check (currency = 'PEN'),
  origin text not null default 'real' check (origin in ('real', 'simulated')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'confirmed', 'rejected')),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references auth.users (id), updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (income is not null or applied_fixed_expense is not null),
  check (not (origin = 'simulated' and validation_status = 'confirmed')),
  unique (household_id, period_year, period_month)
);

create table public.fiorella_fixed_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  period_year smallint not null check (period_year between 1 and 9999),
  period_month smallint not null check (period_month between 1 and 12),
  -- The 19 official subcategories of "Track GF" (see src/domain/fiorellaCategories.js).
  category_id text not null check (category_id in (
    'servicios-gas', 'servicios-celular', 'servicios-icloud', 'servicios-luz', 'servicios-agua', 'servicios-internet',
    'transporte-trabajo', 'transporte-gym', 'transporte-otros',
    'comida-proteinas', 'comida-carbohidrados', 'comida-frutas-verduras', 'comida-condimentos-alinos', 'comida-otros',
    'bienestar-gym', 'bienestar-slinda', 'bienestar-masajes', 'bienestar-miositol',
    'otros-otros')),
  budget_amount numeric check (budget_amount >= 0),
  actual_amount numeric check (actual_amount >= 0),
  currency text not null default 'PEN' check (currency = 'PEN'),
  origin text not null default 'real' check (origin in ('real', 'simulated')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'confirmed', 'rejected')),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references auth.users (id), updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (budget_amount is not null or actual_amount is not null),
  check (not (origin = 'simulated' and validation_status = 'confirmed')),
  unique (household_id, period_year, period_month, category_id)
);

create table public.fiorella_variable_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  period_year smallint not null check (period_year between 1 and 9999),
  period_month smallint not null check (period_month between 1 and 12),
  category_id text not null check (category_id in ('salud', 'ocio')),
  effective_date date not null,
  description text not null check (length(btrim(description)) between 1 and 300),
  amount numeric not null check (amount >= 0),
  -- Explicit acknowledgment when another expense has identical data.
  distinct_operation_reason text check (distinct_operation_reason is null or length(btrim(distinct_operation_reason)) between 1 and 500),
  currency text not null default 'PEN' check (currency = 'PEN'),
  origin text not null default 'real' check (origin in ('real', 'simulated')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'confirmed', 'rejected')),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references auth.users (id), updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (extract(year from effective_date) = period_year and extract(month from effective_date) = period_month),
  check (not (origin = 'simulated' and validation_status = 'confirmed'))
);

create table public.fiorella_savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 120),
  target_amount numeric not null check (target_amount > 0),
  months integer not null check (months > 0),
  scope text not null default 'couple' check (scope = 'couple'),
  currency text not null default 'PEN' check (currency = 'PEN'),
  origin text not null default 'simulated' check (origin = 'simulated'),
  validation_status text not null default 'pending' check (validation_status = 'pending'),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references auth.users (id), updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ── Control Finanzas M&F ─────────────────────────────────────────────────────
create table public.control_import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  file_name text check (file_name is null or length(file_name) <= 200),
  sheet_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(sheet_summary) = 'array'),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  -- The same file (same SHA-256) cannot be registered twice for a household.
  unique (household_id, source_fingerprint)
);

create table public.control_movements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  purpose text check (purpose in ('expenses', 'savings')),
  contributor_identity text check (contributor_identity in ('milton', 'fiorella')),
  -- Explicit ISO code or NULL while unresolved; never assumed.
  currency text check (currency ~ '^[A-Z]{3}$'),
  amount numeric check (amount >= 0),
  effective_date date,
  period_year smallint check (period_year between 1 and 9999),
  period_month smallint check (period_month between 1 and 12),
  description text check (description is null or length(description) <= 1000),
  origin text not null check (origin in ('real', 'simulated')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'confirmed', 'rejected')),
  source_type text not null check (source_type in ('control-excel', 'control-session-demo')),
  source_fingerprint text check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  source_sheet text check (source_sheet is null or length(btrim(source_sheet)) between 1 and 100),
  source_amount_ref text check (source_amount_ref ~ '^[A-Z]{1,3}[1-9][0-9]{0,6}$'),
  import_batch_id uuid references public.control_import_batches (id) on delete restrict,
  -- Original values, cells and evidence references of the domain contract.
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  period_assignment jsonb check (period_assignment is null or jsonb_typeof(period_assignment) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid references auth.users (id), updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, household_id),
  check ((period_year is null) = (period_month is null)),
  check ((source_type = 'control-excel') = (origin = 'real')),
  check (source_type <> 'control-excel' or (source_fingerprint is not null and source_sheet is not null and source_amount_ref is not null)),
  check (not (origin = 'simulated' and validation_status = 'confirmed')),
  -- A confirmed movement needs resolved money, period and destination; deposits
  -- need a contributor, withdrawals a date. Fractional cents await a rounding policy.
  check (validation_status <> 'confirmed' or (amount is not null and currency is not null and period_year is not null and purpose is not null)),
  check (validation_status <> 'confirmed' or kind <> 'deposit' or contributor_identity is not null),
  check (validation_status <> 'confirmed' or kind <> 'withdrawal' or effective_date is not null),
  check (validation_status <> 'confirmed' or scale(amount) <= 2),
  -- Withdrawals for expenses remain pending until a policy is approved.
  check (validation_status <> 'confirmed' or not (kind = 'withdrawal' and purpose = 'expenses'))
);

-- Physical identity of an Excel operation: file SHA-256 + sheet + amount cell.
-- Two deposits on one row have different cells and stay distinct.
create unique index control_movements_source_operation
  on public.control_movements (household_id, source_fingerprint, lower(normalize(source_sheet, NFC)), source_amount_ref)
  where source_fingerprint is not null;

-- Append-only, traceable reviews and decisions. Bound to the movement state via
-- "binding"; a later change makes them stale without deleting them.
create table public.control_movement_reviews (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  movement_id uuid not null,
  review_type text not null check (review_type in ('evidence', 'resolution', 'decision', 'demo')),
  field text check (field is null or field in ('amount', 'effectiveDate', 'currency', 'contributorId', 'period', 'purpose', 'distinct')),
  decision text not null check (decision in ('accepted', 'rejected', 'prepared')),
  binding text not null check (length(binding) between 1 and 200000),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 1 and 500),
  reviewed_by uuid not null references auth.users (id) default auth.uid(),
  reviewed_at timestamptz not null default now(),
  foreign key (movement_id, household_id) references public.control_movements (id, household_id) on delete cascade,
  check (review_type <> 'evidence' or (field in ('amount', 'effectiveDate', 'currency', 'contributorId', 'period') and decision = 'accepted')),
  check (review_type <> 'resolution' or (field in ('purpose', 'distinct') and decision = 'accepted')),
  check (review_type <> 'decision' or (field is null and decision in ('prepared', 'rejected')))
);

create function private.stamp_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.reviewed_by := (select auth.uid());
  new.reviewed_at := now();
  return new;
end;
$$;
revoke all on function private.stamp_review() from public;

create function private.stamp_creator()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.stamp_creator() from public;
create trigger stamp_control_import_batches before insert on public.control_import_batches for each row execute function private.stamp_creator();

create trigger stamp_fiorella_monthly_plans before insert or update on public.fiorella_monthly_plans for each row execute function private.stamp_record();
create trigger stamp_fiorella_fixed_budgets before insert or update on public.fiorella_fixed_budgets for each row execute function private.stamp_record();
create trigger stamp_fiorella_variable_expenses before insert or update on public.fiorella_variable_expenses for each row execute function private.stamp_record();
create trigger stamp_fiorella_savings_goals before insert or update on public.fiorella_savings_goals for each row execute function private.stamp_record();
create trigger stamp_control_movements before insert or update on public.control_movements for each row execute function private.stamp_record();
create trigger stamp_control_movement_reviews before insert on public.control_movement_reviews for each row execute function private.stamp_review();
