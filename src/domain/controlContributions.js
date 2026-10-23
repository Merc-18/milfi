import { addAmounts, compareAmounts, normalizeAmount } from './amounts.js';
import { isValidPeriod } from './models.js';

// A split describes ONE real transfer. Its parts never become ledger movements.
export function validContribution(split, amount) {
  return !!split && typeof split === 'object' && !Array.isArray(split) && split.version === 1
    && typeof split.regular === 'string' && typeof split.extra === 'string'
    && normalizeAmount(split.regular) !== null && normalizeAmount(split.extra) !== null
    && normalizeAmount(amount) !== null && addAmounts(normalizeAmount(split.regular), normalizeAmount(split.extra)) === normalizeAmount(amount);
}
export function contributionParts(record) {
  const split = record.provenance?.contribution;
  if (!split) return { kind: 'unclassified', regular: '0', extra: '0', unclassified: record.amount ?? '0' };
  if (!validContribution(split, record.amount)) return { kind: 'invalid', regular: '0', extra: '0', unclassified: record.amount ?? '0' };
  const regular = normalizeAmount(split.regular); const extra = normalizeAmount(split.extra);
  return { kind: compareAmounts(extra, '0') === 0 ? 'habitual' : compareAmounts(regular, '0') === 0 ? 'extraordinary' : 'combined',
    regular, extra, unclassified: '0' };
}
export const contributionLabel = record => ({ habitual: 'Habitual', extraordinary: 'Extraordinario', combined: 'Habitual + extra',
  unclassified: 'Sin clasificación histórica', invalid: 'Desglose por revisar' }[contributionParts(record).kind]);

// Agreements are explicit and immutable for one receipt period, never recurring
// instructions and never a source of movements or a Fiorella income.
export function prepareContributionCommitment(input) {
  if (!input || input.confirmed !== true || !isValidPeriod(input.period) || !['milton', 'fiorella'].includes(input.contributorId)
    || !['PEN', 'USD'].includes(input.currency) || !['expenses', 'savings'].includes(input.purpose)
    || typeof input.amount !== 'string' || normalizeAmount(input.amount) === null || compareAmounts(normalizeAmount(input.amount), '0') <= 0
    || typeof input.id !== 'string' || !input.id || typeof input.note !== 'string' || input.note.length > 500) {
    return { ok: false, errors: ['INVALID_CONTRIBUTION_COMMITMENT'] };
  }
  return { ok: true, value: { id: input.id, period: { ...input.period }, contributorId: input.contributorId,
    currency: input.currency, purpose: input.purpose, amount: normalizeAmount(input.amount), note: input.note.trim() || null } };
}
