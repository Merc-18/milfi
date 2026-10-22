export const controlFieldClass = 'w-full min-w-0 min-h-11 rounded-xl border border-secundario bg-white px-3 py-3 text-base';
export const controlButtonClass = 'min-h-11 rounded-xl bg-principal px-4 py-3 font-bold disabled:opacity-50';
export const controlCardClass = 'min-w-0 rounded-[24px] bg-white p-5 shadow-soft space-y-3';
export const personName = id => ({ milton: 'Milton', fiorella: 'Fiorella' }[id] ?? 'Sin identificar');
export const purposeName = purpose => ({ expenses: 'Gastos', savings: 'Ahorro' }[purpose] ?? 'Destino pendiente');
export const kindName = kind => kind === 'deposit' ? 'Depósito' : 'Retiro';
export const statusName = status => ({ reviewed: 'Demo revisada', pending: 'Demo pendiente de revisión', rejected: 'Demo rechazada', invalid: 'Demo inválida' }[status] ?? 'Pendiente');

// Currency is always explicit. Preserve every decimal digit, without Number/rounding.
export function controlMoney(amount, currency) {
  if (!currency || typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount)) return 'Importe o moneda pendiente';
  const [integer, fraction = ''] = amount.split('.');
  return `${currency} ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}

const explanations = {
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
  STALE_REVISION: 'El movimiento cambió desde que abriste el formulario. Vuelve a abrirlo y revisa los datos.',
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
};
export const controlExplanation = code => explanations[code] ?? 'Los datos o su procedencia requieren revisión. No se aplicó el cambio.';
