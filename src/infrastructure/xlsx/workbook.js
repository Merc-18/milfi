import { columnName, excelRange } from '../../domain/excelEvidence.js';
import { fail, readZipDirectory, readZipEntry, WorkbookFormatError } from './zip.js';
import { attribute, element, elements, parseXml, textContent } from './xml.js';

const MAX_SHEETS = 50;
const MAX_CELLS = 200000;

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function xmlPart(zip, name, required = true) {
  const bytes = await readZipEntry(zip, name);
  if (!bytes) return required ? fail('NOT_AN_XLSX_WORKBOOK') : null;
  return parseXml(bytes);
}

// Rich text keeps visible runs only; phonetic guides (rPh) are not cell text.
const stringItem = node => element(node, 't') ? textContent(element(node, 't')) : elements(node, 'r').map(run => textContent(element(run, 't'))).join('');

function partPath(target) {
  if (typeof target !== 'string' || target.includes('..') || /^[a-z]+:/i.test(target)) fail('UNSUPPORTED_WORKBOOK_PART');
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

// Values are captured as the XML stores them. Formulas are recorded, never evaluated;
// a formula's cached value is kept only as text evidence of what the file contained.
function captureCell(node, shared) {
  const type = attribute(node, 't');
  const formulaNode = element(node, 'f');
  const valueNode = element(node, 'v');
  const formula = formulaNode ? (textContent(formulaNode).trim() || (attribute(formulaNode, 't') === 'shared' ? '[fórmula compartida]' : '[fórmula]')) : null;
  let value = null;
  let kind = 'blank';
  if (type === 's') {
    const index = Number(textContent(valueNode));
    if (!valueNode || !Number.isSafeInteger(index) || shared[index] === undefined) fail('CORRUPT_SHARED_STRINGS');
    value = shared[index]; kind = 'text';
  } else if (type === 'inlineStr') {
    value = stringItem(element(node, 'is')); kind = 'text';
  } else if (valueNode) {
    value = textContent(valueNode);
    kind = !type || type === 'n' ? 'number' : 'text';
    if (kind === 'number') {
      value = value.trim();
      if (!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) kind = 'text';
    }
  }
  return { type: kind, value, ...(formula ? { formula } : {}) };
}

function captureSheet(root, shared) {
  const cells = {};
  let count = 0;
  for (const row of elements(element(root, 'sheetData'), 'row')) {
    const rowNumber = Number(attribute(row, 'r'));
    let column = 0;
    for (const cell of elements(row, 'c')) {
      const ref = attribute(cell, 'r');
      const parsed = ref ? excelRange(ref) : null;
      if (ref && (!parsed || parsed.first.ref !== parsed.last.ref)) fail('CORRUPT_WORKSHEET');
      column = parsed ? parsed.first.column : column + 1;
      const rowIndex = parsed ? parsed.first.row : rowNumber;
      if (!Number.isSafeInteger(rowIndex) || rowIndex < 1) fail('CORRUPT_WORKSHEET');
      const address = `${columnName(column)}${rowIndex}`;
      const captured = captureCell(cell, shared);
      if (captured.type === 'blank' && !captured.formula) continue;
      if (++count > MAX_CELLS) fail('WORKSHEET_TOO_LARGE');
      cells[address] = captured;
    }
  }
  const merges = elements(element(root, 'mergeCells'), 'mergeCell').map(node => attribute(node, 'ref'));
  if (merges.some(ref => !excelRange(ref))) fail('CORRUPT_WORKSHEET');
  return { cells, merges: merges.map(ref => excelRange(ref).ref) };
}

/** Reads a local .xlsx into an independent capture. Executes no formulas, macros or links. */
export async function readXlsxCapture(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    const zip = readZipDirectory(bytes);
    const names = [...zip.entries.keys()];
    if (names.some(name => /(^|\/)vbaProject\.bin$/i.test(name) || /^xl\/activeX\//i.test(name) || /^xl\/embeddings\//i.test(name))) fail('ACTIVE_CONTENT_NOT_ALLOWED');
    const workbook = await xmlPart(zip, 'xl/workbook.xml');
    const relations = await xmlPart(zip, 'xl/_rels/workbook.xml.rels');
    const targets = new Map(elements(relations, 'Relationship').map(node => [attribute(node, 'Id'), node]));
    const sharedRoot = await xmlPart(zip, 'xl/sharedStrings.xml', false);
    const shared = sharedRoot ? elements(sharedRoot, 'si').map(stringItem) : [];
    const date1904 = attribute(element(workbook, 'workbookPr'), 'date1904');
    const sheetNodes = elements(element(workbook, 'sheets'), 'sheet');
    if (!sheetNodes.length) fail('NOT_AN_XLSX_WORKBOOK');
    if (sheetNodes.length > MAX_SHEETS) fail('TOO_MANY_SHEETS');
    const sheets = [];
    for (const node of sheetNodes) {
      const name = attribute(node, 'name');
      const relation = targets.get(attribute(node, 'id'));
      if (!name || !relation) fail('NOT_AN_XLSX_WORKBOOK');
      if (!/\/worksheet$/.test(attribute(relation, 'Type') ?? '')) { sheets.push({ name, kind: 'other', cells: {}, merges: [] }); continue; }
      const root = await xmlPart(zip, partPath(attribute(relation, 'Target')));
      sheets.push({ name, kind: 'worksheet', state: attribute(node, 'state') ?? 'visible', ...captureSheet(root, shared) });
    }
    if (new Set(sheets.map(sheet => sheet.name.normalize('NFC').toLowerCase())).size !== sheets.length) fail('DUPLICATE_SHEET_NAME');
    return { ok: true, capture: { fingerprint: await sha256Hex(bytes), dateSystem: date1904 === '1' || date1904 === 'true' ? '1904' : '1900', sheets,
      externalLinks: names.filter(name => /^xl\/externalLinks\/[^/]+\.xml$/i.test(name)).length } };
  } catch (error) {
    if (error instanceof WorkbookFormatError) return { ok: false, code: error.code };
    return { ok: false, code: 'UNREADABLE_WORKBOOK' };
  }
}
