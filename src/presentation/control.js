export const controlFieldClass = 'w-full min-w-0 min-h-11 rounded-xl border border-secundario bg-white px-3 py-3 text-base';
export const controlButtonClass = 'min-h-11 rounded-xl bg-principal px-4 py-3 font-bold disabled:opacity-50';
export const controlCardClass = 'min-w-0 rounded-[24px] bg-white p-5 shadow-soft space-y-3';
export const personName = id => ({ milton: 'Milton', fiorella: 'Fiorella' }[id] ?? 'Sin identificar');
export const purposeName = purpose => ({ expenses: 'Gastos', savings: 'Ahorro' }[purpose] ?? 'Destino pendiente');
// Review states as palette tones; the label always states the state in words.
export const statusTone = status => ({ pending: 'aviso', invalid: 'aviso', rejected: 'excedido' }[status] ?? 'neutral');
export const kindName = kind => kind === 'deposit' ? 'Depósito' : 'Retiro';
export const statusName = status => ({ reviewed: 'Revisado', imported: 'Cargado del Excel', pending: 'Por revisar', rejected: 'Rechazado', invalid: 'Inválido' }[status]
  ?? 'Por revisar');

// Currency is always explicit. Preserve every decimal digit, without Number/rounding.
export function controlMoney(amount, currency) {
  if (!currency || typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount)) return 'Importe o moneda pendiente';
  const [integer, fraction = ''] = amount.split('.');
  return `${currency} ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}

export const currencyOriginWarning = record => record.provenance?.type === 'control-excel' && record.currency === 'PEN'
  && typeof record.provenance.original?.amount === 'string' && /^\s*\$/.test(record.provenance.original.amount)
  ? 'El original usa $ y figura PEN: confirma la moneda con su referencia.' : null;

const explanations = {
  INVALID_CONTRIBUTION_SPLIT: 'El habitual más el extraordinario deben coincidir exactamente con el importe de la transferencia.',
  INVALID_CONTRIBUTION_COMMITMENT: 'Completa el compromiso del periodo y confirma expresamente el acuerdo.',
  COMMITMENTS_UNAVAILABLE: 'El registro de compromisos aún no está habilitado.',
  INVALID_DATE_OR_PERIOD: 'Completa una fecha real del calendario y un periodo válido.',
  INVALID_AMOUNT: 'Usa un importe no negativo con punto decimal, sin símbolos ni separadores.',
  INVALID_CURRENCY: 'Indica un código de moneda reconocido (por ejemplo PEN o USD), o déjalo pendiente.',
  INVALID_CONTRIBUTOR: 'Selecciona un aportante conocido o déjalo pendiente.',
  INVALID_PURPOSE: 'Selecciona un destino conocido o déjalo pendiente.',
  INVALID_MOVEMENT_KIND: 'Selecciona depósito o retiro.',
  INCOMPLETE_DECLARATION: 'Identifica quién registra y describe la procedencia de este ejemplo inventado.',
  POSSIBLE_DUPLICATE_REQUIRES_REVIEW: 'Hay otra operación con los mismos datos. Si es distinta, explica por qué antes de registrarla.',
  DUPLICATE_ID: 'Ese identificador ya existe. No se duplicó el movimiento.',
  DUPLICATE_SOURCE_OPERATION: 'La operación de origen ya está registrada. No se duplicó el movimiento.',
  STALE_REVISION: 'El movimiento cambió desde que abriste el formulario (quizá en otro dispositivo). Vuelve a abrirlo y revisa los datos.',
  FORBIDDEN: 'Tu usuario no tiene permiso para esta operación. No se guardó nada.',
  DUPLICATE: 'Ese movimiento o archivo ya está guardado. No se duplicó.',
  CONSTRAINT_VIOLATION: 'La base de datos rechazó los valores por no cumplir las reglas. No se guardó nada.',
  NOT_FOUND_OR_FORBIDDEN: 'El movimiento ya no existe o no tienes permiso para modificarlo.',
  SESSION_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo; no se guardó nada.',
  NOT_CONNECTED: 'No hay conexión con MilFi. No se guardó nada.',
  PERSISTENCE_ERROR: 'No se pudo guardar en MilFi (conexión o servidor). No se guardó nada; inténtalo de nuevo.',
  MOVEMENT_NOT_FOUND: 'El movimiento ya no está disponible. Actualiza los datos.',
  BACKDATED_CHANGE: 'La fecha del cambio no puede preceder al último cambio registrado.',
  INCOMPLETE_DEMO_REVIEW: 'Completa responsable, motivo, referencia y decisión de la revisión demostrativa.',
  UNRESOLVED_MONEY: 'Importe o moneda pendiente: elige una moneda explícita antes de revisar.',
  MISSING_CONTRIBUTOR: 'Falta identificar al aportante del depósito.',
  UNRESOLVED_PURPOSE: 'Falta evidencia declarada del destino del dinero.',
  ROUNDING_POLICY_PENDING: 'Hay fracciones de céntimo. El tratamiento de redondeo está pendiente de aprobación.',
  ZERO_AMOUNT_POLICY_PENDING: 'El tratamiento de operaciones con importe cero está pendiente de aprobación.',
  PERIOD_ASSIGNMENT_REVIEW_REQUIRED: 'Fecha y periodo son distintos: requiere revisión explícita de esta imputación.',
  PERIOD_DATE_INCONSISTENCY: 'La imputación de periodo está marcada como inconsistente.',
  WITHDRAWAL_PURPOSE_POLICY_PENDING: 'El tratamiento de retiros para gastos está pendiente de aprobación; se conserva fuera del resumen revisado.',
  DEMO_DATE_REQUIRED: 'Falta la fecha de la operación demostrativa.',
  DECLARED_RECORDER_REQUIRED: 'Falta declarar quién registra el ejemplo.',
  MISSING_CONFIRMED_PERIOD: 'Falta definir el mes al que corresponde.',
  MISSING_WITHDRAWAL_DATE: 'Falta la fecha del retiro.',
  IMPORT_REVIEW_REQUIRED: 'Cargado del Excel sin todos sus campos resueltos: pendiente de revisión.',
  MISSING_PLAN_PERIOD: 'Elige a qué mes del plan corresponde el depósito de ahorro.',
  INVALID_PLAN_PERIOD: 'El mes del plan no es válido.',
  SAVINGS_DEPOSIT_REQUIRED: 'Solo los depósitos de ahorro tienen mes del plan.',
  INVALID_CORRECTION: 'Ese dato no se puede corregir aquí.',
  INVALID_PERIOD: 'Elige un mes válido.',
  IMPORTED_MOVEMENT_REQUIRED: 'Este movimiento no viene del Excel.',
};
export const controlExplanation = code => explanations[code] ?? 'Los datos o su procedencia requieren revisión. No se aplicó el cambio.';
