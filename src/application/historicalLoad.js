import { stableJson } from '../domain/controlPreimport.js';
import { inspectPreimport } from '../domain/controlPreimport.js';
import { normalizeLabel } from '../domain/controlWorkbook.js';
import { IDENTITIES } from '../domain/models.js';
import { prepareFieldResolution, preparePreimportDecision } from './controlPreimport.js';

// One-time historical load, prepared offline and applied by the module manager
// with a real session. Previews only count and compare; they never write. The
// digest binds the later write to exactly the payload that was reviewed.
const fail = (...errors) => ({ ok: false, errors });

// ── Finanzas de Fiorella ─────────────────────────────────────────────────────
export function fiorellaLoadPayload(plan, householdId) {
  return { household_id: householdId, provenance: { type: 'fiorella-excel', sourceFingerprint: plan.fingerprint, cutoff: plan.cutoff },
    monthly_plans: plan.monthlyPlans, fixed_budgets: plan.fixedBudgets, variable_expenses: plan.variableExpenses, savings_goals: plan.savingsGoals };
}

const monthKey = row => `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
const sameExpense = (a, b) => a.effective_date === b.effective_date && a.category_id === b.category_id
  && normalizeLabel(a.description) === normalizeLabel(b.description) && Number(a.amount) === Number(b.amount);

/** existing: rows already stored for the household (any origin). */
export function fiorellaLoadPreview(plan, existing = {}) {
  const conflicts = [];
  const months = new Set((existing.monthlyPlans ?? []).map(monthKey));
  const budgets = new Set((existing.fixedBudgets ?? []).map(row => `${monthKey(row)}:${row.category_id}`));
  const expenseRefs = new Set((existing.variableExpenses ?? []).map(row => row.source_ref).filter(Boolean));
  const goalRefs = new Set((existing.savingsGoals ?? []).map(row => row.source_ref).filter(Boolean));
  for (const row of plan.monthlyPlans) if (months.has(monthKey(row))) conflicts.push({ code: 'MONTH_ALREADY_STORED', period: monthKey(row) });
  for (const row of plan.fixedBudgets) if (budgets.has(`${monthKey(row)}:${row.category_id}`)) conflicts.push({ code: 'GF_ALREADY_STORED', period: monthKey(row), category: row.category_id });
  for (const row of plan.variableExpenses) {
    if (expenseRefs.has(row.source_ref)) conflicts.push({ code: 'GV_ALREADY_LOADED', ref: row.source_ref });
    else if ((existing.variableExpenses ?? []).some(other => !other.source_ref && sameExpense(other, row))) conflicts.push({ code: 'GV_SAME_AS_APP_ENTRY', ref: row.source_ref });
  }
  for (const row of plan.savingsGoals) if (goalRefs.has(row.source_ref)) conflicts.push({ code: 'GOAL_ALREADY_LOADED', ref: row.source_ref });
  const failedChecks = plan.checks.filter(check => !check.ok);
  return {
    counts: { monthlyPlans: plan.monthlyPlans.length, projectedMonths: plan.monthlyPlans.filter(row => row.plan_status === 'projected').length,
      fixedBudgets: plan.fixedBudgets.length, fixedWithoutActual: plan.fixedBudgets.filter(row => row.actual_amount === null).length,
      variableExpenses: plan.variableExpenses.length, savingsGoals: plan.savingsGoals.length, pending: plan.pending.length, omitted: plan.omitted.length },
    checks: plan.checks, failedChecks, conflicts,
    // Reconciliation mismatches or stored copies stop the load; pending rows are simply not loaded.
    blocked: failedChecks.length > 0 || conflicts.length > 0,
  };
}

// ── Control Finanzas M&F ─────────────────────────────────────────────────────
// decisions: { reviewedBy, resolutions: [{ field, value, match, reason, evidenceReference }] }
// match: { kind?, purpose?, header? (column header text), refs? (amount cells) }.
// value "month-of-date" assigns each withdrawal the month of its own date.
function selects(record, match = {}) {
  const source = record.provenance;
  if (match.kind && record.kind !== match.kind) return false;
  if (match.purpose && record.purpose !== match.purpose) return false;
  if (match.refs && !match.refs.includes(source.operation?.amountRef)) return false;
  if (match.header && normalizeLabel(source.original?.contributorId ?? source.original?.purpose ?? '') !== normalizeLabel(match.header)) return false;
  return true;
}

export function applyControlDecisions(read, decisions, occurredAt) {
  if (!read?.ok) return fail('UNREADABLE_WORKBOOK');
  const context = { workbooks: new Map([[read.batch.fingerprint, read.workbook]]) };
  let records = structuredClone(read.records);
  const applied = [];
  if (decisions) {
    if (!IDENTITIES.some(identity => identity.id === decisions.reviewedBy) || !Array.isArray(decisions.resolutions)) return fail('INVALID_DECISIONS_FILE');
    for (const [index, resolution] of decisions.resolutions.entries()) {
      const targets = records.filter(record => selects(record, resolution.match));
      if (!targets.length) { applied.push({ index, field: resolution.field, matched: 0 }); continue; }
      const groups = resolution.value === 'month-of-date'
        ? Object.values(Object.groupBy(targets.filter(record => record.effectiveDate), record => record.effectiveDate.slice(0, 7)))
          .map(group => [group, { year: Number(group[0].effectiveDate.slice(0, 4)), month: Number(group[0].effectiveDate.slice(5, 7)) }])
        : [[targets, resolution.value]];
      for (const [groupIndex, [group, value]] of groups.entries()) {
        const result = prepareFieldResolution({ recordIds: group.map(record => record.id), field: resolution.field, value, reason: resolution.reason,
          evidenceReference: resolution.evidenceReference, reviewedBy: decisions.reviewedBy, occurredAt, reviewId: `carga-${index}-${groupIndex}` }, records, context);
        if (!result.ok) return fail(`RESOLUTION_${index}_${result.errors[0]}`);
        const updated = new Map(result.value.map(record => [record.id, record]));
        records = records.map(record => updated.get(record.id) ?? record);
      }
      applied.push({ index, field: resolution.field, matched: targets.length });
    }
  }
  // Everything fully resolved is marked prepared; the rest is loaded as pending review.
  for (const entry of inspectPreimport(records, context).filter(item => !item.errors.length && !item.pendingReasons.length)) {
    const result = preparePreimportDecision({ recordId: entry.record.id, expectedRevision: entry.record.revision, decision: 'prepared',
      reason: 'Carga histórica única: todos los campos resueltos con evidencia', evidenceReference: `${read.batch.fingerprint.slice(0, 12)}`,
      reviewedBy: decisions?.reviewedBy ?? 'milton', occurredAt, reviewId: `carga-preparado-${entry.record.id}` }, records, context);
    if (!result.ok) return fail(`DECISION_${result.errors[0]}`);
    records = records.map(record => record.id === result.value.id ? result.value : record);
  }
  const entries = inspectPreimport(records, context);
  const loadable = entries.filter(entry => !entry.errors.length && entry.status !== 'rejected');
  const reasons = {};
  for (const entry of loadable) for (const reason of entry.pendingReasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  return { ok: true, batch: read.batch, applied, records: loadable.map(entry => entry.record),
    counts: { identified: entries.length, deposits: loadable.filter(entry => entry.record.kind === 'deposit').length,
      withdrawals: loadable.filter(entry => entry.record.kind === 'withdrawal').length,
      prepared: loadable.filter(entry => entry.status === 'prepared').length, pendingReview: loadable.filter(entry => entry.status === 'pending').length,
      excludedInvalid: entries.filter(entry => entry.errors.length).length },
    pendingReasons: reasons, excluded: entries.filter(entry => entry.errors.length).map(entry => ({ ref: entry.record.provenance?.operation?.amountRef, errors: entry.errors })) };
}

export function controlLoadPreview(prepared, existingBatches = [], existingRecords = []) {
  const conflicts = [];
  if (existingBatches.some(batch => batch.source_fingerprint === prepared.batch.fingerprint)) conflicts.push({ code: 'FILE_ALREADY_LOADED' });
  const stored = new Set(existingRecords.filter(record => record.provenance?.type === 'control-excel')
    .map(record => `${record.provenance.sheet}!${record.provenance.operation?.amountRef}`));
  const repeated = prepared.records.filter(record => stored.has(`${record.provenance.sheet}!${record.provenance.operation.amountRef}`)).length;
  if (repeated) conflicts.push({ code: 'SAME_CELLS_FROM_OTHER_FILE', count: repeated });
  return { counts: prepared.counts, pendingReasons: prepared.pendingReasons, excluded: prepared.excluded, conflicts,
    // A repeated file never loads twice; the same cells from another version need the owner's decision.
    blocked: conflicts.length > 0 || prepared.records.length === 0 };
}

export const payloadDigestSource = payload => stableJson(payload);
