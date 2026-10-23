import { usageStatus } from './status.js';

// Traffic light of a month: tone token and the word that always goes with it.
export const LIGHT = Object.freeze({
  ok: { light: 'verde', word: 'Bien' }, aviso: { light: 'amarillo', word: 'Cerca' },
  excedido: { light: 'rojo', word: 'Excedido' }, none: { light: 'gris', word: 'Sin datos' },
});
const light = (spent, limit) => LIGHT[spent == null || limit == null ? 'none' : usageStatus(spent, limit)] ?? LIGHT.none;

/**
 * One row of fiorellaEvolution (read with withFixedCap): GF real against that
 * month's applied GF (the cap, or the different value stored for an old month),
 * GV real against its allocation; < 90 % Bien, 90–100 % Cerca, > 100 % Excedido.
 */
export function historyLights(row) {
  return { fixed: light(row.fixedActual, row.appliedFixed), variable: light(row.variableActual, row.variablePlanned) };
}
