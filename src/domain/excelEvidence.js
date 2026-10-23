import { normalizeAmount } from './amounts.js';

const text = value => typeof value === 'string' && value.trim().length > 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
export const isExcelSource = source => typeof source?.type === 'string'
  && (source.type.endsWith('excel') || source.type === 'fiorella-template');

export function excelRange(value) {
  if (typeof value !== 'string') return null;
  const parts = value.toUpperCase().split(':');
  if (parts.length > 2) return null;
  const points = parts.map(part => {
    const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/.exec(part);
    if (!match) return null;
    const column = [...match[1]].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
    const row = Number(match[2]);
    return column <= 16384 && row <= 1048576 ? { column, row, ref: `${match[1]}${row}` } : null;
  });
  if (points.some(point => !point)) return null;
  const [first, last = first] = points;
  if (first.column > last.column || first.row > last.row) return null;
  return { first, last, ref: first.ref === last.ref ? first.ref : `${first.ref}:${last.ref}` };
}

export const columnName = number => {
  let name = '';
  for (let rest = number; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
};

const contains = (outer, inner) => outer.first.row <= inner.first.row && outer.last.row >= inner.last.row
  && outer.first.column <= inner.first.column && outer.last.column >= inner.last.column;
const fieldName = field => field === 'date' ? 'effectiveDate' : field;

export function validateExcelTrace(source) {
  if (!isExcelSource(source)) return [];
  if (!text(source.sheet) || !Number.isSafeInteger(source.row) || source.row < 1 || source.row > 1048576
    || typeof source.sourceFingerprint !== 'string' || !/^[a-f\d]{64}$/i.test(source.sourceFingerprint)
    || !text(source.importBatchId) || !plain(source.original) || !plain(source.cells)) return ['INCOMPLETE_SOURCE_TRACE'];
  const entries = Object.entries(source.original);
  if (!entries.length || !entries.some(([, value]) => text(value))
    || entries.some(([field, value]) => (value !== null && typeof value !== 'string') || !excelRange(source.cells[field]))) return ['INCOMPLETE_SOURCE_TRACE'];
  if (!plain(source.operation) || !excelRange(source.operation.range) || !excelRange(source.operation.amountRef)) return ['MISSING_SOURCE_OPERATION'];
  const range = excelRange(source.operation.range);
  const amount = excelRange(source.operation.amountRef);
  if (source.row < range.first.row || source.row > range.last.row || !contains(range, amount)) return ['SOURCE_AMOUNT_OUTSIDE_OPERATION'];
  if (!plain(source.evidence) || Object.values(source.evidence).some(refs => !Array.isArray(refs)
    || refs.some(ref => !plain(ref) || !text(ref.sheet) || !excelRange(ref.ref)
      || (ref.role !== undefined && !['month', 'year', 'calendar'].includes(ref.role))))) return ['INVALID_SOURCE_EVIDENCE'];
  return [];
}

function workbookFor(source, context) {
  if (!(context?.workbooks instanceof Map)) return null;
  return context.workbooks.get(source.sourceFingerprint?.toLowerCase()) ?? null;
}

function sheetFor(workbook, name) {
  if (!plain(workbook?.sheets) || !text(name)) return null;
  const names = Object.keys(workbook.sheets).filter(key => key.normalize('NFC').toLowerCase() === name.normalize('NFC').toLowerCase());
  return names.length === 1 ? { name: names[0], ...workbook.sheets[names[0]] } : null;
}

// Context is a separate reader-owned capture, not a verified flag supplied by a record.
function resolveReference(workbook, reference) {
  if (!plain(reference)) return null;
  const sheet = sheetFor(workbook, reference.sheet);
  const range = excelRange(reference.ref);
  if (!sheet || !plain(sheet.cells) || !range || !Array.isArray(sheet.merges)) return null;
  const merges = sheet.merges.map(excelRange);
  if (merges.some(merge => !merge)) return null;
  const matches = merges.filter(merge => contains(merge, range));
  if (matches.length > 1) return null;
  const merged = matches[0];
  if (!merged && range.first.ref !== range.last.ref) return null;
  const anchor = merged?.first.ref ?? range.first.ref;
  const cell = sheet.cells[anchor];
  if (!plain(cell) || !['text', 'number', 'blank'].includes(cell.type)
    || (cell.value !== null && typeof cell.value !== 'string') || (cell.type === 'blank' && cell.value !== null)) return null;
  return { sheet: sheet.name, anchor, range: merged?.ref ?? anchor, role: reference.role ?? null,
    type: cell.type, value: cell.value, formula: cell.formula ?? null, dateSystem: workbook.dateSystem ?? null };
}

function captures(record, field, context) {
  const source = record.provenance;
  const workbook = workbookFor(source, context);
  if (!workbook) return null;
  const refs = source.evidence?.[field] ?? [];
  const result = refs.map(ref => resolveReference(workbook, ref));
  return result.some(value => !value) ? null : result;
}

// Field/operation associations belong to the trusted workbook layout, never to
// record-supplied originals, ranges or a self-declared "related" flag. The layout
// maps each amount anchor to its operation range and exact field references;
// those references may include verified headers, merges or cross-sheet context.
function operationEvidence(record, field, context) {
  const source = record.provenance;
  const workbook = workbookFor(source, context);
  const sheet = sheetFor(workbook, source.sheet);
  const amount = resolveReference(workbook, { sheet: source.sheet, ref: source.operation.amountRef });
  const layout = amount && plain(sheet?.operations) ? sheet.operations[amount.anchor] : null;
  const range = plain(layout) && excelRange(layout.range);
  const refs = plain(layout?.fields) && layout.fields[field];
  if (!range || !amount || !contains(range, excelRange(amount.range)) || !Array.isArray(refs)
    || source.row < range.first.row || source.row > range.last.row) return null;
  const linked = refs.map(ref => plain(ref) ? resolveReference(workbook, ref) : null);
  if (linked.some(cell => !cell)) return null;
  return { range: range.ref, linked };
}

const referenceIdentity = cell => JSON.stringify([cell.sheet, cell.anchor, cell.range, cell.role]);
function matchesOperation(captured, association) {
  if (!association) return false;
  const expected = new Set(association.linked.map(referenceIdentity));
  const actual = new Set(captured.map(referenceIdentity));
  return actual.size === expected.size && [...actual].every(key => expected.has(key));
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function evidenceBinding(record, field, context) {
  if (!isExcelSource(record?.provenance) || validateExcelTrace(record.provenance).length
    || !workbookFor(record.provenance, context)) return null;
  const captured = captures(record, field, context);
  if (!captured || !captured.length) return null;
  return JSON.stringify(canonical({ sourceFingerprint: record.provenance.sourceFingerprint.toLowerCase(),
    operation: sourceOperationKey(record, context), operationRange: excelRange(record.provenance.operation.range).ref,
    field, captured, association: operationEvidence(record, field, context),
    normalized: field === 'amount' ? { amount: record.amount, currency: record.currency } : record[field] ?? null }));
}

export const EVIDENCE_FIELDS = Object.freeze(['amount', 'effectiveDate', 'currency', 'contributorId', 'period']);

export function isEvidenceReview(review) {
  return plain(review) && EVIDENCE_FIELDS.includes(review.field) && review.decision === 'accepted'
    && text(review.binding) && text(review.id) && text(review.reason) && text(review.evidenceReference)
    && ['fiorella', 'milton'].includes(review.reviewedBy) && typeof review.reviewedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(review.reviewedAt)
    && Number.isFinite(Date.parse(review.reviewedAt)) && new Date(review.reviewedAt).toISOString() === review.reviewedAt;
}

function reviewed(record, field, context) {
  const binding = evidenceBinding(record, field, context);
  if (!binding || !Array.isArray(record.evidenceReviews)) return false;
  return record.evidenceReviews.some(review => isEvidenceReview(review) && review.field === field && review.binding === binding);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function dateValue(cell) {
  if (cell.formula) return null;
  if (cell.type === 'number') {
    if (!/^\d+$/.test(cell.value ?? '') || !['1900', '1904'].includes(cell.dateSystem)) return null;
    const serial = Number(cell.value);
    if (!Number.isSafeInteger(serial) || serial > 2958465 || serial < 0 || (cell.dateSystem === '1900' && serial === 60)) return null;
    const base = cell.dateSystem === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    const adjusted = cell.dateSystem === '1900' && serial > 60 ? serial - 1 : serial;
    return validDate(new Date(base + adjusted * 86400000).toISOString().slice(0, 10));
  }
  const value = cell.value?.trim();
  if (validDate(value)) return value;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value ?? '');
  if (!match) return null;
  const candidates = [...new Set([[match[1], match[2]], [match[2], match[1]]]
    .map(([day, month]) => validDate(`${match[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)).filter(Boolean))];
  return candidates.length === 1 ? candidates[0] : null;
}

function numericValue(cell) {
  if (cell.formula) return null;
  // Numeric XML may use scientific notation. Expand exactly, without floats.
  const raw = cell.value?.trim();
  const direct = normalizeAmount(raw);
  if (direct !== null) return direct;
  const match = cell.type === 'number' && /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(raw ?? '');
  if (!match || Math.abs(Number(match[3])) > 100) return null;
  const digits = match[1] + (match[2] ?? '');
  const point = match[1].length + Number(match[3]);
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return normalizeAmount(expanded);
}

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const currencyCodes = new Set(Intl.supportedValuesOf('currency'));

function fieldValue(field, cells) {
  if (!cells.length || cells.some(cell => cell.formula)) return null;
  if (field === 'amount') return cells.length === 1 ? numericValue(cells[0]) : null;
  if (field === 'effectiveDate') return cells.length === 1 ? dateValue(cells[0]) : null;
  const raw = cells.map(cell => cell.value ?? '').join(' ').normalize('NFC');
  if (field === 'currency') {
    const codes = [...new Set((raw.match(/\b[A-Z]{3}\b/g) ?? []).filter(code => currencyCodes.has(code)))];
    if (codes.length !== 1) return null;
    const label = raw.replaceAll(codes[0], '').trim().toLowerCase();
    return /^(?:(?:moneda|currency|importe|monto(?: retirado)?)\s*[:(]?\s*\)?)?$/.test(label) ? codes[0] : null;
  }
  if (field === 'contributorId') {
    const name = /^(?:(?:ahorro|asignación) de )?(fiorella|milton)$/.exec(raw.trim().toLowerCase());
    return name?.[1] ?? null;
  }
  if (field === 'period') {
    const direct = cells.length === 1 && /^(\d{4})-(\d{2})$/.exec(raw.trim());
    if (direct && Number(direct[1]) >= 1 && Number(direct[2]) >= 1 && Number(direct[2]) <= 12) return { year: Number(direct[1]), month: Number(direct[2]) };
    const years = cells.filter(cell => cell.role === 'year' && /^\d{4}$/.test(cell.value?.trim() ?? '')).map(cell => Number(cell.value.trim()));
    const found = cells.filter(cell => cell.role === 'month').flatMap(cell => {
      const label = cell.value?.trim().toLowerCase().replace(/^\d{1,2}[.)-]?\s+/, '');
      return months.flatMap((month, index) => label === month ? [index + 1] : []);
    });
    return years.length === 1 && years[0] >= 1 && found.length === 1 ? { year: years[0], month: found[0] } : null;
  }
  return null;
}

// Read-only helpers for the workbook reader/preimport: same resolution and
// interpretation rules as the contract checks below, with no extra inference.
export const resolveExcelReference = (record, reference, context) => resolveReference(workbookFor(record.provenance, context), reference);
export function interpretExcelField(record, field, context) {
  const cells = isExcelSource(record?.provenance) && !validateExcelTrace(record.provenance).length ? captures(record, field, context) : null;
  return cells ? fieldValue(field, cells) : null;
}

export function sourceOperationKey(record, context) {
  const source = record?.provenance;
  if (!isExcelSource(source) || validateExcelTrace(source).length) return null;
  const workbook = workbookFor(source, context);
  const resolved = workbook && resolveReference(workbook, { sheet: source.sheet, ref: source.operation.amountRef });
  const anchor = resolved?.anchor ?? excelRange(source.operation.amountRef)?.first.ref;
  // ID, batch, normalized person/currency/period and declared operation labels
  // cannot change the identity of an amount at the same physical Excel position.
  return JSON.stringify([source.sourceFingerprint.toLowerCase(), source.sheet.normalize('NFC').toLowerCase(), anchor]);
}

export function inspectExcelEvidence(record, context) {
  const source = record?.provenance;
  if (!isExcelSource(source)) return { errors: [], pendingReasons: [] };
  const errors = validateExcelTrace(source);
  if (errors.length) return { errors, pendingReasons: [] };
  const workbook = workbookFor(source, context);
  if (!workbook) return { errors: [], pendingReasons: ['SOURCE_NOT_VERIFIED'] };
  const pendingReasons = [];
  // Verify legacy preserved originals against actual captured cells as well.
  for (const [field, original] of Object.entries(source.original)) {
    const reference = source.originalReferences?.[field] ?? { sheet: source.sheet, ref: source.cells[field] };
    const captured = resolveReference(workbook, reference);
    if (!captured) errors.push('UNVERIFIABLE_ORIGINAL_REFERENCE');
    else if (captured.value !== original) errors.push('ORIGINAL_VALUE_MISMATCH');
    if (field === 'amount' && captured) {
      const operation = resolveReference(workbook, { sheet: source.sheet, ref: source.operation.amountRef });
      if (!operation || operation.sheet !== captured.sheet || operation.anchor !== captured.anchor) errors.push('ORIGINAL_AMOUNT_OPERATION_MISMATCH');
    }
  }
  for (const field of EVIDENCE_FIELDS) {
    const cells = captures(record, field, context);
    if (cells === null) { errors.push('UNVERIFIABLE_FIELD_REFERENCE'); continue; }
    const optionalAbsent = (field === 'effectiveDate' && record.kind === 'deposit' && record.effectiveDate === null)
      || (field === 'contributorId' && record.kind === 'withdrawal' && record.contributorId === null);
    const association = operationEvidence(record, field, context);
    const originals = Object.entries(source.original).filter(([key]) => fieldName(key) === field);
    // A field cannot evade its preserved original by selecting a convenient
    // unrelated cell, nor by omitting a nonblank original from its evidence.
    for (const [key, original] of originals) {
      if (optionalAbsent && !cells.length && original === null) continue;
      const captured = resolveReference(workbook, source.originalReferences?.[key] ?? { sheet: source.sheet, ref: source.cells[key] });
      if (captured && !cells.some(cell => cell.sheet === captured.sheet && cell.anchor === captured.anchor)) errors.push('SOURCE_FIELD_REFERENCE_MISMATCH');
    }
    const verifiedAbsent = association && association.linked.every(cell => cell.type === 'blank' && cell.value === null && !cell.formula);
    if (!cells.length && optionalAbsent && verifiedAbsent && originals.every(([, original]) => original === null)) continue;
    const acceptedReview = reviewed(record, field, context);
    if (!cells.length) pendingReasons.push(`SOURCE_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}_EVIDENCE_REQUIRED`);
    if (!matchesOperation(cells, association) && !acceptedReview) pendingReasons.push(`SOURCE_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}_RELATION_REVIEW_REQUIRED`);
    const value = fieldValue(field, cells);
    const normalized = field === 'amount' ? normalizeAmount(record.amount) : record[field];
    const allowedBlank = normalized === null && cells.length > 0 && cells.every(cell => cell.type === 'blank' && cell.value === null)
      && ((field === 'effectiveDate' && record.kind === 'deposit') || (field === 'contributorId' && record.kind === 'withdrawal'));
    const agrees = allowedBlank || (value !== null && JSON.stringify(canonical(value)) === JSON.stringify(canonical(normalized)));
    if (!agrees && !acceptedReview) pendingReasons.push(field === 'amount'
      ? (value === null ? 'SOURCE_AMOUNT_INTERPRETATION_REQUIRED' : 'SOURCE_AMOUNT_MISMATCH')
      : `SOURCE_${fieldName(field).replace(/([A-Z])/g, '_$1').toUpperCase()}_${value === null ? 'AMBIGUOUS' : 'MISMATCH'}`);
    if (field === 'amount' && cells.length) {
      if (cells.some(cell => cell.formula)) pendingReasons.push('SOURCE_FORMULA_AMOUNT_POLICY_PENDING');
      const operation = resolveReference(workbook, { sheet: source.sheet, ref: source.operation.amountRef });
      if (!operation || cells.length !== 1 || operation.sheet !== cells[0].sheet || operation.anchor !== cells[0].anchor) errors.push('AMOUNT_OPERATION_MISMATCH');
    }
  }
  return { errors: [...new Set(errors)], pendingReasons: [...new Set(pendingReasons)] };
}
