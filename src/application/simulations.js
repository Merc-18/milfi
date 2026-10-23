import { calculateDistribution } from '../domain/distribution.js';
import { isValidDate, isValidPeriod, MODULES, ORIGINS, VALIDATION } from '../domain/models.js';

export function prepareSimulation({ id, period, income, fixedExpense, createdAt }) {
  if (typeof id !== 'string' || !id.trim()) return { ok: false, errors: ['INVALID_ID'] };
  if (!isValidPeriod(period)) return { ok: false, errors: ['INVALID_PERIOD'] };
  if (typeof createdAt !== 'string' || !isValidDate(createdAt.slice(0, 10))
    || !Number.isFinite(Date.parse(createdAt))) return { ok: false, errors: ['INVALID_TIMESTAMP'] };
  const calculation = calculateDistribution({ income, fixedExpense });
  if (calculation.status !== 'calculated') return { ok: false, calculation };
  return {
    ok: true,
    value: {
      id,
      schemaVersion: 1,
      householdId: null,
      revision: 0,
      moduleId: MODULES.FIORELLA,
      origin: ORIGINS.SIMULATED,
      // A pending simulation cannot be mistaken for a confirmed financial record.
      validationStatus: VALIDATION.PENDING,
      actorId: null,
      period: { ...period },
      provenance: { type: 'manual-simulation', sourceId: 'session-calculator' },
      createdAt,
      requiresRoundingDecision: calculation.requiresRoundingDecision,
      distribution: calculation.distribution,
    },
  };
}
