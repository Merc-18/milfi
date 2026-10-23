import { useStore } from '../store/useStore.js';
import { usePeriodStore } from '../store/periodStore.js';
import { parsePeriodInput } from './format.js';
import { summarizeFiorella } from '../domain/fiorellaSession.js';

export function useFiorellaPeriod() {
  const input = usePeriodStore(state => state.selectedPeriod);
  const records = useStore(state => state.fiorellaDemoRecords);
  const persisted = useStore(state => !!state.remote);
  const period = parsePeriodInput(input);
  return { input, period, persisted, summary: summarizeFiorella(records, period, persisted ? 'real' : 'simulated') };
}

/** True while records are loaded from and saved to Supabase (authorized session). */
export const usePersisted = () => useStore(state => !!state.remote);

const errors = {
  POSSIBLE_DUPLICATE_EXPENSE: 'Ya existe un gasto con los mismos datos. Revisa la lista o indica explícitamente que se trata de otro gasto.',
  STALE_REVISION: 'Este registro cambió. Vuelve a abrir el formulario antes de actualizarlo.',
  DATE_PERIOD_MISMATCH: 'La fecha debe pertenecer al mes y año seleccionados. Cambia el periodo para registrar otra fecha.',
  FIXED_EXPENSE_ABOVE_CAP: 'El GF aplicado no puede superar el tope oficial de S/ 1,500.',
  DUPLICATE_PERIOD_CATEGORY: 'Ya existe un registro para este periodo y subcategoría. Edita el existente.',
  DUPLICATE: 'Otro dispositivo ya registró este dato. Se recargó la información; revísala antes de volver a guardar.',
  FORBIDDEN: 'Tu usuario no tiene permiso para guardar este registro. No se guardó nada.',
  CONSTRAINT_VIOLATION: 'La base de datos rechazó los valores por no cumplir las reglas. No se guardó nada.',
  SESSION_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo; no se guardó nada.',
  NOT_FOUND_OR_FORBIDDEN: 'El registro ya no existe o no tienes permiso para modificarlo.',
  NOT_CONNECTED: 'No hay conexión con MilFi. No se guardó nada.',
  PERSISTENCE_ERROR: 'No se pudo guardar en MilFi (error de conexión o del servidor). No se guardó nada; inténtalo de nuevo.',
};
export function sessionResultMessage(result, persisted = false) {
  if (result.ok) return result.unchanged ? 'Sin cambios; no se creó otro registro.'
    : persisted ? 'Guardado en MilFi. Se conserva al cerrar sesión y se ve desde otros dispositivos.' : 'Guardado.';
  return errors[result.errors?.[0]] ?? 'Revisa los campos. Usa importes no negativos con punto decimal, una fecha válida y descripción de hasta 300 caracteres.';
}

export function sessionCommand(kind, period, existing, fields) {
  return { kind, period, id: existing?.id ?? crypto.randomUUID(), expectedRevision: existing?.revision ?? 0,
    eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), ...fields };
}
