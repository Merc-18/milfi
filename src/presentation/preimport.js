export const fileErrors = {
  FILE_TOO_LARGE: 'El archivo supera el tamaño admitido (10 MB).',
  LEGACY_OR_PROTECTED_WORKBOOK: 'El archivo es un Excel antiguo (.xls) o está protegido con contraseña. Guarda una copia .xlsx sin contraseña.',
  NOT_A_ZIP: 'El archivo no es un libro .xlsx válido.',
  NOT_AN_XLSX_WORKBOOK: 'El archivo no contiene un libro de Excel reconocible.',
  ENCRYPTED_ZIP: 'El archivo está cifrado y no puede leerse localmente.',
  ACTIVE_CONTENT_NOT_ALLOWED: 'El archivo contiene macros o contenido activo. Por seguridad no se procesa.',
  XML_DTD_NOT_ALLOWED: 'El archivo contiene definiciones XML no admitidas. Por seguridad no se procesa.',
  STRUCTURE_NOT_RECOGNIZED: 'No se reconoció la estructura de Control Finanzas M&F (tablas de depósitos o retiros).',
  ALREADY_LOADED: 'Este mismo archivo ya está cargado en la sesión. No se duplicaron sus movimientos.',
};
export const fileErrorMessage = code => fileErrors[code] ?? 'No se pudo leer el archivo de forma segura. No se procesó ningún movimiento.';

export const noteMessages = {
  TOTAL_FORMULAS_EXCLUDED: 'Fórmulas de totales excluidas: no son depósitos ni retiros adicionales.',
  FORMULAS_NOT_EXECUTED: 'Fórmulas fuera de las tablas: no se ejecutan ni se importan.',
  CELLS_OUTSIDE_TABLES: 'Celdas fuera de las tablas reconocidas (títulos o resúmenes): no se importan.',
  UNKNOWN_DEPOSIT_COLUMN: 'Columnas de depósito con encabezado no reconocido: requieren revisión manual.',
  WITHDRAWAL_ROW_WITHOUT_AMOUNT: 'Filas de retiro sin importe: no se crean movimientos.',
  SHEET_NOT_RECOGNIZED: 'Hoja sin estructura de Control reconocida.',
  EXTERNAL_LINKS_IGNORED: 'Vínculos externos ignorados: no se siguen ni actualizan.',
};

export const categoryLabels = {
  all: 'Todos los movimientos', evidence: 'Respaldados por evidencia', contributor: 'Aportante desconocido o ambiguo',
  currency: 'Moneda pendiente', period: 'Periodo o fecha por revisar', duplicate: 'Posibles duplicados',
  interpretation: 'Interpretación no resuelta', prepared: 'Preparados', rejected: 'Rechazados', invalid: 'Inválidos',
};

const reasons = {
  UNRESOLVED_MONEY: 'Importe o moneda sin resolver. El Excel no indica moneda: no se asume PEN.',
  SOURCE_CURRENCY_AMBIGUOUS: 'Moneda pendiente: elige una moneda explícita y justifícala.',
  SOURCE_CURRENCY_MISMATCH: 'La moneda indicada no coincide con la evidencia.',
  MISSING_CONTRIBUTOR: 'Aportante sin identificar.',
  SOURCE_CONTRIBUTOR_ID_AMBIGUOUS: 'El encabezado de la columna no identifica inequívocamente al aportante (etiqueta relativa).',
  SOURCE_CONTRIBUTOR_ID_MISMATCH: 'El aportante indicado no coincide con el encabezado.',
  SOURCE_PERIOD_AMBIGUOUS: 'El periodo no se deduce automáticamente: requiere revisión.',
  SOURCE_PERIOD_MISMATCH: 'El periodo indicado no coincide con el mes y año del Excel.',
  MISSING_CONFIRMED_PERIOD: 'Falta un periodo válido.',
  SOURCE_EFFECTIVE_DATE_AMBIGUOUS: 'Fecha ausente o ambigua en el Excel.',
  SOURCE_EFFECTIVE_DATE_MISMATCH: 'La fecha indicada no coincide con el Excel.',
  MISSING_WITHDRAWAL_DATE: 'Retiro sin fecha.',
  PERIOD_ASSIGNMENT_REVIEW_REQUIRED: 'Fecha y periodo son de meses distintos: requiere revisión explícita de la imputación.',
  PERIOD_DATE_INCONSISTENCY: 'La imputación de periodo está marcada como inconsistente.',
  SOURCE_AMOUNT_INTERPRETATION_REQUIRED: 'El importe del Excel es texto, símbolo o expresión abierta: requiere interpretación explícita.',
  SOURCE_AMOUNT_MISMATCH: 'El importe indicado no coincide con el Excel.',
  SOURCE_FORMULA_AMOUNT_POLICY_PENDING: 'El importe es una fórmula: no se ejecuta ni se trata como operación.',
  ROUNDING_POLICY_PENDING: 'Hay fracciones de céntimo: el redondeo está pendiente de aprobación.',
  ZERO_AMOUNT_POLICY_PENDING: 'Importe cero: su tratamiento está pendiente de aprobación. Puede rechazarse.',
  UNRESOLVED_PURPOSE: 'Destino del dinero sin identificar.',
  PURPOSE_REVIEW_REQUIRED: 'El destino no coincide con el encabezado reconocido: requiere revisión.',
  WITHDRAWAL_PURPOSE_POLICY_PENDING: 'Retiro para gastos: tratamiento pendiente de aprobación.',
  POSSIBLE_DUPLICATE_VALUES: 'Otro movimiento del archivo tiene los mismos datos: confirma que es una operación distinta o recházalo.',
  OTHER_VERSION_SAME_OPERATION: 'Otra versión cargada tiene la misma operación en la misma celda. Las versiones no se concilian automáticamente.',
  DUPLICATE_ID: 'Identificador duplicado.',
  DUPLICATE_SOURCE_OPERATION: 'La misma celda de origen aparece dos veces.',
};
export const reasonMessage = code => reasons[code] ?? `Requiere revisión (${code}).`;

export const resolutionErrors = {
  INVALID_AMOUNT: 'Usa un importe no negativo con punto decimal, sin símbolos.',
  INVALID_CURRENCY: 'Elige una moneda reconocida.',
  INVALID_CONTRIBUTOR: 'Elige un aportante.',
  INVALID_DATE: 'Indica una fecha válida.',
  INVALID_PERIOD: 'Indica un periodo válido.',
  INVALID_PURPOSE: 'Elige un destino.',
  INCOMPLETE_REVIEW: 'Completa responsable, motivo y referencia de la revisión.',
  STALE_REVISION: 'El movimiento cambió. Vuelve a abrir la revisión.',
  WITHDRAWAL_CONTRIBUTOR_WITHOUT_EVIDENCE: 'Los retiros no se atribuyen a una persona sin evidencia.',
  DEPOSIT_DATE_WITHOUT_EVIDENCE: 'Los depósitos mensuales no tienen fecha exacta en el Excel.',
  FIELD_WITHOUT_EVIDENCE: 'Este campo no tiene evidencia en el Excel que pueda revisarse.',
};
export const resolutionMessage = code => resolutionErrors[code] ?? reasonMessage(code);

export const fieldLabels = { amount: 'Importe y moneda', currency: 'Moneda', contributorId: 'Aportante', effectiveDate: 'Fecha', period: 'Periodo', purpose: 'Destino', distinct: 'Operación distinta (no duplicada)' };

// Fields with evidence that may be corrected for a movement of this kind, pending ones first.
export function correctableFields(entry) {
  const all = ['amount', 'currency', entry.record.kind === 'deposit' ? 'contributorId' : 'effectiveDate', 'period', 'purpose'];
  const pending = resolvableFields(entry);
  return [...pending, ...all.filter(field => !pending.includes(field))];
}

// Fields a reviewer must resolve for a movement, from its pending reasons and kind.
export function resolvableFields(entry) {
  const { record, pendingReasons } = entry;
  const has = pattern => pendingReasons.some(reason => pattern.test(reason));
  const fields = [];
  if (has(/AMOUNT_INTERPRETATION|AMOUNT_MISMATCH/) || record.amount === null) fields.push('amount');
  if (has(/CURRENCY/) || record.currency === null) fields.push('currency');
  if (record.kind === 'deposit' && (has(/CONTRIBUTOR/) || record.contributorId === null)) fields.push('contributorId');
  if (record.kind === 'withdrawal' && has(/EFFECTIVE_DATE|WITHDRAWAL_DATE/)) fields.push('effectiveDate');
  if (has(/PERIOD/)) fields.push('period');
  if (has(/PURPOSE/)) fields.push('purpose');
  if (has(/POSSIBLE_DUPLICATE|OTHER_VERSION/)) fields.push('distinct');
  return fields;
}
