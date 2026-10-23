// Persistence adapters prepared for Phase 4.2 (not wired to the forms yet).
// Amounts travel as strings in both directions and are selected as ::text,
// because PostgREST would otherwise serialize NUMERIC as a lossy JSON number.
// Domain contracts are unchanged: these functions only translate shapes.

const AUDIT = 'revision, created_by, updated_by, created_at, updated_at';
export const COLUMNS = Object.freeze({
  control_contribution_commitments: `id, household_id, period_year, period_month, contributor_identity, currency, purpose, amount::text, note, ${AUDIT}`,
  fiorella_monthly_plans: `id, household_id, period_year, period_month, income::text, applied_fixed_expense::text, plan_status, provenance, rules_version, currency, origin, validation_status, ${AUDIT}`,
  fiorella_fixed_budgets: `id, household_id, period_year, period_month, category_id, budget_amount::text, actual_amount::text, provenance, currency, origin, validation_status, ${AUDIT}`,
  fiorella_variable_expenses: `id, household_id, period_year, period_month, category_id, subcategory, effective_date, description, amount::text, notes, distinct_operation_reason, provenance, source_ref, currency, origin, validation_status, ${AUDIT}`,
  fiorella_savings_goals: `id, household_id, title, target_amount::text, months, deadline_year, deadline_month, deadline_label, status, notes, provenance, source_ref, scope, currency, origin, validation_status, ${AUDIT}`,
  control_movements: `id, household_id, kind, purpose, contributor_identity, currency, amount::text, effective_date, period_year, period_month, plan_year, plan_month, description, origin, validation_status, source_type, source_fingerprint, source_sheet, source_amount_ref, import_batch_id, provenance, period_assignment, ${AUDIT}`,
  control_movement_reviews: 'id, household_id, movement_id, review_type, field, decision, binding, reason, evidence_reference, reviewed_by, reviewed_at',
});

const period = row => row.period_year == null ? null : { year: row.period_year, month: row.period_month };
// PostgREST returns DATE as 'YYYY-MM-DD'; a direct Postgres client may return a Date.
// Amounts come as strings from ::text columns; audit JSON snapshots may carry numbers.
const money = value => value == null ? null : String(value);
const isoTime = value => value == null ? null : new Date(value).toISOString();
const isoDate = value => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

// ── Control Finanzas M&F ─────────────────────────────────────────────────────
export function controlMovementToRow(record, householdId) {
  const source = record.provenance;
  const excel = source?.type === 'control-excel';
  return { household_id: householdId, kind: record.kind, purpose: record.purpose ?? null, contributor_identity: record.contributorId ?? null,
    currency: record.currency ?? null, amount: record.amount ?? null, effective_date: record.effectiveDate ?? null,
    period_year: record.period?.year ?? null, period_month: record.period?.month ?? null,
    plan_year: record.planPeriod?.year ?? null, plan_month: record.planPeriod?.month ?? null, description: record.description ?? null,
    origin: record.origin, validation_status: record.validationStatus, source_type: source.type,
    source_fingerprint: excel ? source.sourceFingerprint.toLowerCase() : null, source_sheet: excel ? source.sheet : null,
    source_amount_ref: excel ? source.operation.amountRef : null, provenance: source, period_assignment: record.periodAssignment ?? null };
}

const REVIEW_TYPES = [['evidenceReviews', 'evidence'], ['preimportResolutions', 'resolution'], ['preimportDecisions', 'decision'], ['demoReviews', 'demo'], ['manualReviews', 'manual']];
export function controlReviewsToRows(record, householdId, movementId) {
  return REVIEW_TYPES.flatMap(([key, type]) => (record[key] ?? []).map(review => ({ household_id: householdId, movement_id: movementId, review_type: type,
    field: review.field ?? null, decision: review.decision, binding: review.binding, reason: review.reason, evidence_reference: review.evidenceReference })));
}

export const reviewFromRow = review => ({ id: review.id, ...(review.field ? { field: review.field } : {}), decision: review.decision, binding: review.binding,
  reason: review.reason, reviewedBy: review.reviewed_by, reviewedAt: new Date(review.reviewed_at).toISOString(), evidenceReference: review.evidence_reference });

export function controlMovementFromRow(row, reviews = []) {
  const typed = type => reviews.filter(review => review.review_type === type).map(reviewFromRow);
  return { id: row.id, schemaVersion: 1, householdId: row.household_id, revision: row.revision, moduleId: 'control-mf', origin: row.origin,
    validationStatus: row.validation_status, actorId: row.provenance?.enteredBy ?? null, kind: row.kind, purpose: row.purpose, contributorId: row.contributor_identity,
    currency: row.currency, amount: money(row.amount), effectiveDate: isoDate(row.effective_date),
    period: period(row), planPeriod: row.plan_year == null ? null : { year: row.plan_year, month: row.plan_month },
    description: row.description, provenance: row.provenance,
    ...(row.period_assignment ? { periodAssignment: row.period_assignment } : {}),
    evidenceReviews: typed('evidence'), preimportResolutions: typed('resolution'), preimportDecisions: typed('decision'), demoReviews: typed('demo'), manualReviews: typed('manual'),
    createdAt: isoTime(row.created_at), updatedAt: isoTime(row.updated_at) };
}

export const commitmentToRow = (record, householdId) => ({ household_id: householdId, period_year: record.period.year,
  period_month: record.period.month, contributor_identity: record.contributorId, currency: record.currency,
  purpose: record.purpose, amount: record.amount, note: record.note });
export const commitmentFromRow = row => ({ id: row.id, period: period(row), contributorId: row.contributor_identity,
  currency: row.currency, purpose: row.purpose, amount: money(row.amount), note: row.note, revision: row.revision });

// ── Finanzas de Fiorella ─────────────────────────────────────────────────────
// Same record shape as the session domain (fiorellaSession.js), marked real.
// Rows loaded from her workbook keep their stored provenance; app entries have none.
const fiorellaMeta = row => ({ schemaVersion: 1, moduleId: 'fiorella', ownerId: 'fiorella', actorId: null, householdId: row.household_id,
  origin: row.origin, validationStatus: row.validation_status, currency: row.currency, revision: row.revision,
  provenance: row.provenance ?? { type: 'manual-entry', sourceId: 'milfi-app', rulesVersion: 'fiorella-official-v1' },
  createdAt: isoTime(row.created_at), updatedAt: isoTime(row.updated_at) });
export const monthlyPlanToRow = (record, householdId) => ({ household_id: householdId, period_year: record.period.year, period_month: record.period.month,
  income: record.income ?? null, applied_fixed_expense: record.appliedFixedExpense ?? null, plan_status: record.planStatus ?? 'actual', origin: 'real', validation_status: 'pending' });
export const monthlyPlanFromRow = row => ({ ...fiorellaMeta(row), id: row.id, kind: 'monthly-plan', period: period(row), income: money(row.income),
  appliedFixedExpense: money(row.applied_fixed_expense), planStatus: row.plan_status ?? 'actual', currency: row.currency, origin: row.origin, validationStatus: row.validation_status, revision: row.revision });
export const fixedBudgetToRow = (record, householdId) => ({ household_id: householdId, period_year: record.period.year, period_month: record.period.month,
  category_id: record.categoryId, budget_amount: record.budgetAmount ?? null, actual_amount: record.actualAmount ?? null, origin: 'real', validation_status: 'pending' });
export const fixedBudgetFromRow = row => ({ ...fiorellaMeta(row), id: row.id, kind: 'fixed-budget', period: period(row), categoryId: row.category_id,
  budgetAmount: money(row.budget_amount), actualAmount: money(row.actual_amount), currency: row.currency, origin: row.origin, validationStatus: row.validation_status, revision: row.revision });
export const variableExpenseToRow = (record, householdId) => ({ household_id: householdId, period_year: record.period.year, period_month: record.period.month,
  category_id: record.categoryId, subcategory: record.subcategory ?? null, effective_date: record.effectiveDate, description: record.description, amount: record.amount,
  notes: record.notes ?? null, distinct_operation_reason: record.distinctOperationReason ?? null, origin: 'real', validation_status: 'pending' });
export const variableExpenseFromRow = row => ({ ...fiorellaMeta(row), id: row.id, kind: 'variable-expense', period: period(row), categoryId: row.category_id,
  subcategory: row.subcategory ?? null, effectiveDate: isoDate(row.effective_date), description: row.description, amount: money(row.amount), notes: row.notes ?? null,
  sourceRef: row.source_ref ?? null, currency: row.currency,
  origin: row.origin, validationStatus: row.validation_status, revision: row.revision });
export const savingsGoalToRow = (record, householdId) => ({ household_id: householdId, title: record.title, target_amount: record.target, months: Number(record.months) });
export const savingsGoalFromRow = row => ({ ...fiorellaMeta(row), provenance: row.provenance ?? { type: 'manual-simulation', sourceId: 'session-savings-goal' }, id: row.id, kind: 'savings-goal', period: null, scope: row.scope, title: row.title, target: money(row.target_amount),
  months: String(row.months), deadline: row.deadline_year == null ? null : { year: row.deadline_year, month: row.deadline_month }, deadlineLabel: row.deadline_label ?? null,
  status: row.status ?? 'active', notes: row.notes ?? null, currency: row.currency, origin: row.origin, validationStatus: row.validation_status, revision: row.revision });

// ── Generic repository with optimistic concurrency ───────────────────────────
// Postgres error codes only; messages may echo data and are never surfaced.
export function persistenceErrorCode(error) {
  if (!error) return null;
  return { 42501: 'FORBIDDEN', 23505: 'DUPLICATE', 23514: 'CONSTRAINT_VIOLATION', 23503: 'REFERENCE_VIOLATION', 23502: 'MISSING_VALUE',
    40001: 'STALE_REVISION', PGRST301: 'SESSION_EXPIRED' }[error.code] ?? 'PERSISTENCE_ERROR';
}

export function createRepository(client, table) {
  const columns = COLUMNS[table];
  if (!columns) throw new Error(`Unknown table ${table}`);
  const failure = error => ({ ok: false, code: persistenceErrorCode(error) });
  return {
    async list(filters = {}) {
      let query = client.from(table).select(columns);
      for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
      const { data, error } = await query;
      return error ? failure(error) : { ok: true, rows: data };
    },
    async insert(row) {
      const { data, error } = await client.from(table).insert(row).select(columns).single();
      return error ? failure(error) : { ok: true, row: data };
    },
    // Applies only if the stored revision is still the one the client read.
    async update(id, expectedRevision, changes) {
      const { data, error } = await client.from(table).update({ ...changes, revision: expectedRevision + 1 })
        .eq('id', id).eq('revision', expectedRevision).select(columns);
      if (error) return failure(error);
      if (data.length) return { ok: true, row: data[0] };
      const current = await client.from(table).select('id, revision').eq('id', id).maybeSingle();
      return { ok: false, code: current.data ? 'STALE_REVISION' : 'NOT_FOUND_OR_FORBIDDEN' };
    },
    async remove(id, expectedRevision) {
      const { data, error } = await client.from(table).delete().eq('id', id).eq('revision', expectedRevision).select('id');
      if (error) return failure(error);
      return data.length ? { ok: true } : { ok: false, code: 'STALE_OR_NOT_ALLOWED' };
    },
  };
}
