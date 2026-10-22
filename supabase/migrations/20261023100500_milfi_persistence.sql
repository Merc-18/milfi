-- MilFi 2.0 · Phase 4.2 persistence.
-- 1. Real manual Control movements entered in the app ("control-manual").
-- 2. "manual" reviews for those movements (append-only, like the others).
-- 3. Atomic import of explicitly prepared preimport movements (SECURITY INVOKER:
--    the caller's grants and RLS policies apply to every statement inside).
-- No policy or grant from previous migrations is relaxed.

do $$
declare item record;
begin
  -- Locate the generated constraints by definition rather than by name.
  for item in
    select conname from pg_constraint
    where conrelid = 'public.control_movements'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%source_type = ANY%'
        or pg_get_constraintdef(oid) like '%(source_type = ''control-excel''::text) = (origin = ''real''::text)%')
  loop
    execute format('alter table public.control_movements drop constraint %I', item.conname);
  end loop;
  for item in
    select conname from pg_constraint
    where conrelid = 'public.control_movement_reviews'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%review_type = ANY%'
  loop
    execute format('alter table public.control_movement_reviews drop constraint %I', item.conname);
  end loop;
end;
$$;

alter table public.control_movements
  add constraint control_movements_source_type check (source_type in ('control-excel', 'control-session-demo', 'control-manual')),
  -- Excel and manual entries are real; session demos are simulated.
  add constraint control_movements_source_origin check ((origin = 'real') = (source_type in ('control-excel', 'control-manual')));

alter table public.control_movement_reviews
  add constraint control_movement_reviews_review_type check (review_type in ('evidence', 'resolution', 'decision', 'demo', 'manual')),
  add constraint control_movement_reviews_manual_decision check (review_type <> 'manual' or (field is null and decision in ('accepted', 'rejected')));

create function public.import_control_batch(batch jsonb, movements jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  batch_id uuid;
  movement_id uuid;
  item jsonb;
  review jsonb;
  imported jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(movements) <> 'array' or jsonb_array_length(movements) = 0 then
    raise exception 'EMPTY_IMPORT' using errcode = '22023';
  end if;
  insert into public.control_import_batches (household_id, source_fingerprint, file_name, sheet_summary)
  values ((batch->>'household_id')::uuid, batch->>'source_fingerprint', batch->>'file_name', coalesce(batch->'sheet_summary', '[]'::jsonb))
  returning id into batch_id;
  for item in select value from jsonb_array_elements(movements) loop
    if item->>'source_type' <> 'control-excel' or item->>'source_fingerprint' <> batch->>'source_fingerprint'
      or item->>'household_id' <> batch->>'household_id' then
      raise exception 'IMPORT_SOURCE_MISMATCH' using errcode = '22023';
    end if;
    insert into public.control_movements (household_id, kind, purpose, contributor_identity, currency, amount, effective_date,
      period_year, period_month, description, origin, validation_status, source_type, source_fingerprint, source_sheet,
      source_amount_ref, import_batch_id, provenance, period_assignment)
    values ((item->>'household_id')::uuid, item->>'kind', item->>'purpose', item->>'contributor_identity', item->>'currency',
      (item->>'amount')::numeric, (item->>'effective_date')::date, (item->>'period_year')::smallint, (item->>'period_month')::smallint,
      item->>'description', 'real', 'pending', 'control-excel', item->>'source_fingerprint', item->>'source_sheet',
      item->>'source_amount_ref', batch_id, item->'provenance', nullif(item->'period_assignment', 'null'::jsonb))
    returning id into movement_id;
    for review in select value from jsonb_array_elements(coalesce(item->'reviews', '[]'::jsonb)) loop
      insert into public.control_movement_reviews (household_id, movement_id, review_type, field, decision, binding, reason, evidence_reference)
      values ((item->>'household_id')::uuid, movement_id, review->>'review_type', review->>'field', review->>'decision',
        review->>'binding', review->>'reason', review->>'evidence_reference');
    end loop;
    imported := imported || jsonb_build_array(movement_id);
  end loop;
  return jsonb_build_object('batch_id', batch_id, 'movement_ids', imported);
end;
$$;

-- Explicit grant: only authenticated users, still constrained by RLS inside.
revoke all on function public.import_control_batch(jsonb, jsonb) from public, anon;
grant execute on function public.import_control_batch(jsonb, jsonb) to authenticated;
