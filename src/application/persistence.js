import {
  COLUMNS, commitmentFromRow, commitmentToRow, controlMovementFromRow, controlMovementToRow, controlReviewsToRows, createRepository, fixedBudgetFromRow, fixedBudgetToRow,
  monthlyPlanFromRow, monthlyPlanToRow, persistenceErrorCode, reviewFromRow, savingsGoalFromRow, savingsGoalToRow, variableExpenseFromRow, variableExpenseToRow,
} from '../infrastructure/supabase/repositories.js';

// Phase 4.2 persistence for the authenticated household. Domain functions keep
// validating every change first; the database enforces RLS, revisions and
// constraints. Failures are returned as codes and never reported as success.
const FIORELLA_TABLES = Object.freeze({
  'monthly-plan': ['fiorella_monthly_plans', monthlyPlanToRow, monthlyPlanFromRow],
  'fixed-budget': ['fiorella_fixed_budgets', fixedBudgetToRow, fixedBudgetFromRow],
  'variable-expense': ['fiorella_variable_expenses', variableExpenseToRow, variableExpenseFromRow],
  'savings-goal': ['fiorella_savings_goals', savingsGoalToRow, savingsGoalFromRow],
});
const FROM_TABLE = Object.fromEntries(Object.values(FIORELLA_TABLES).map(([table, , fromRow]) => [table, fromRow]));
const failure = error => ({ ok: false, errors: [persistenceErrorCode(error)] });

export function createMilfiPersistence(client, { householdId }) {
  if (!client || typeof householdId !== 'string' || !householdId) throw new Error('A client and household are required');
  const repository = table => createRepository(client, table);

  async function save(table, toRow, fromRow, record, previous) {
    const row = toRow(record, householdId);
    const result = previous
      ? await repository(table).update(record.id, previous.revision, row)
      : await repository(table).insert({ ...row, id: record.id });
    return result.ok ? { ok: true, value: fromRow(result.row) } : { ok: false, errors: [result.code] };
  }

  async function auditEvents(module) {
    const { data, error } = await client.from('audit_events').select('id, table_name, record_id, action, revision, actor_id, occurred_at, before, after')
      .eq('household_id', householdId).eq('module', module).order('id', { ascending: false }).limit(500);
    return error ? failure(error) : { ok: true, rows: data };
  }

  return {
    householdId,
    async loadFiorella() {
      const loaded = await Promise.all(Object.values(FIORELLA_TABLES).map(([table, , fromRow]) =>
        repository(table).list({ household_id: householdId }).then(result => result.ok ? { ok: true, rows: result.rows.map(fromRow) } : result)));
      const failed = loaded.find(result => !result.ok);
      if (failed) return { ok: false, errors: [failed.code] };
      const rows = loaded.flatMap(result => result.rows);
      return { ok: true, records: rows.filter(record => record.kind !== 'savings-goal'), goals: rows.filter(record => record.kind === 'savings-goal') };
    },
    saveFiorellaRecord(record, previous) {
      const entry = FIORELLA_TABLES[record.kind];
      if (!entry) return Promise.resolve({ ok: false, errors: ['UNSUPPORTED_RECORD'] });
      const [table, toRow, fromRow] = entry;
      return save(table, toRow, fromRow, record, previous);
    },
    // Audit rows mapped to the session event shape used by the history screen.
    async loadFiorellaHistory() {
      const result = await auditEvents('fiorella');
      if (!result.ok) return result;
      return { ok: true, events: result.rows.filter(row => FROM_TABLE[row.table_name] && row.table_name !== 'fiorella_savings_goals' && row.action !== 'delete').map(row => {
        const after = FROM_TABLE[row.table_name](row.after);
        return { id: `audit-${row.id}`, recordId: row.record_id, revision: row.revision, period: after.period, moduleId: 'fiorella', origin: after.origin,
          actorId: row.actor_id, action: row.action === 'insert' ? 'created' : 'updated', occurredAt: new Date(row.occurred_at).toISOString(),
          similarExpenseAcknowledged: !!row.after?.distinct_operation_reason, before: row.before ? FROM_TABLE[row.table_name](row.before) : null, after };
      }).reverse() };
    },

    async loadControl() {
      const movements = await repository('control_movements').list({ household_id: householdId });
      if (!movements.ok) return { ok: false, errors: [movements.code] };
      const reviews = await repository('control_movement_reviews').list({ household_id: householdId });
      if (!reviews.ok) return { ok: false, errors: [reviews.code] };
      const agreements = await client.from('control_contribution_commitments').select(COLUMNS.control_contribution_commitments).eq('household_id', householdId);
      const missing = ['42P01', 'PGRST205', 'PGRST204'].includes(agreements.error?.code);
      if (agreements.error && !missing) return failure(agreements.error);
      return { ok: true, records: movements.rows.map(row => controlMovementFromRow(row, reviews.rows.filter(review => review.movement_id === row.id))),
        commitments: (agreements.data ?? []).map(commitmentFromRow), commitmentsAvailable: !missing };
    },
    async saveContributionCommitment(record) {
      return save('control_contribution_commitments', commitmentToRow, commitmentFromRow, record, null);
    },
    // Own (simulated) goals only; the app never asks to delete a workbook goal.
    async deleteSavingsGoal(goal) {
      const result = await repository('fiorella_savings_goals').remove(goal.id, goal.revision);
      return result.ok ? { ok: true } : { ok: false, errors: [result.code] };
    },
    async saveControlEntry(record, previous) {
      const result = await save('control_movements', controlMovementToRow, row => controlMovementFromRow(row, []), record, previous);
      if (result.ok) result.value.manualReviews = structuredClone(record.manualReviews ?? []);
      return result;
    },
    async addControlReview(record, previous, review, changed) {
      let current = previous;
      if (changed) {
        const updated = await save('control_movements', controlMovementToRow, row => controlMovementFromRow(row, []), record, previous);
        if (!updated.ok) return updated;
        current = updated.value;
      }
      const inserted = await repository('control_movement_reviews').insert({ ...review, household_id: householdId, movement_id: record.id });
      // A stored assignment without its review is reported, never shown as a completed review.
      if (!inserted.ok) return { ok: false, errors: [inserted.code], partial: changed };
      return { ok: true, value: { ...current, manualReviews: [...(previous.manualReviews ?? []), reviewFromRow(inserted.row)] } };
    },
    async loadControlHistory() {
      const result = await auditEvents('control-mf');
      if (!result.ok) return result;
      return { ok: true, events: result.rows.filter(row => row.table_name === 'control_movements').map(row => ({ id: `audit-${row.id}`, recordId: row.record_id,
        action: row.action === 'insert' ? 'create' : row.action === 'update' ? 'edit' : 'delete', occurredAt: new Date(row.occurred_at).toISOString(), actorId: row.actor_id,
        before: row.before ? controlMovementFromRow(row.before) : null, after: row.after ? controlMovementFromRow(row.after) : null })).reverse() };
    },
    // Atomic: batch, movements and their reviews are inserted in one transaction (RPC).
    async importPrepared(batch, records) {
      const movements = records.map(record => ({ ...controlMovementToRow(record, householdId), reviews: controlReviewsToRows(record, householdId, null)
        .map(({ review_type, field, decision, binding, reason, evidence_reference }) => ({ review_type, field, decision, binding, reason, evidence_reference })) }));
      const { data, error } = await client.rpc('import_control_batch', {
        batch: { household_id: householdId, source_fingerprint: batch.fingerprint, file_name: batch.fileName ?? null, sheet_summary: batch.sheets ?? [] }, movements });
      return error ? failure(error) : { ok: true, value: { batchId: data.batch_id, movementIds: data.movement_ids } };
    },
    columns: COLUMNS,
  };
}
