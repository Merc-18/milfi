import { useStore } from '../store/useStore.js';
import { parsePeriodInput } from './format.js';
import { summarizeFiorella } from '../domain/fiorellaSession.js';

export function useFiorellaPeriod() {
  const input = useStore(state => state.selectedFiorellaPeriod);
  const records = useStore(state => state.fiorellaDemoRecords);
  const period = parsePeriodInput(input);
  return { input, period, summary: summarizeFiorella(records, period) };
}

const errors = {
  POSSIBLE_DUPLICATE_EXPENSE: 'Ya existe un gasto con los mismos datos. Revisa la lista o indica explícitamente que se trata de otro gasto.',
  STALE_REVISION: 'Este registro cambió. Vuelve a abrir el formulario antes de actualizarlo.',
  DATE_PERIOD_MISMATCH: 'La fecha debe pertenecer al mes y año seleccionados. Cambia el periodo para registrar otra fecha.',
  FIXED_EXPENSE_ABOVE_CAP: 'El GF aplicado no puede superar el tope oficial de S/ 1,500.',
  DUPLICATE_PERIOD_CATEGORY: 'Ya existe un registro para este periodo y subcategoría. Edita el existente.',
};
export function sessionResultMessage(result) {
  if (result.ok) return result.unchanged ? 'Sin cambios; no se creó otro registro.' : 'Registrado solo en esta sesión de demostración. Se perderá al recargar.';
  return errors[result.errors?.[0]] ?? 'Revisa los campos. Usa importes no negativos con punto decimal, una fecha válida y descripción de hasta 300 caracteres.';
}

export function sessionCommand(kind, period, existing, fields) {
  return { kind, period, id: existing?.id ?? crypto.randomUUID(), expectedRevision: existing?.revision ?? 0,
    eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), ...fields };
}
