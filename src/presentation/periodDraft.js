import { parsePeriodInput } from './format.js';

export function periodDraftState(draft, applied, blurred = false) {
  const valid = parsePeriodInput(draft) !== null;
  return { valid, applied: valid ? draft : applied, showError: blurred && !valid };
}
