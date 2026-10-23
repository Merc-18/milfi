import { crc32, deflateRawSync } from 'node:zlib';

// Builds small synthetic .xlsx files in memory. Every label and value used with
// it is invented; no private workbook content is ever reproduced here.
const encoder = new TextEncoder();
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function zipBytes(files, { method = 8, flags = 0, corruptCrc = false } = {}) {
  const locals = []; const central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const stored = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const nameBytes = encoder.encode(name);
    const crc = (crc32(data) ^ (corruptCrc ? 1 : 0)) >>> 0;
    const local = new Uint8Array(30 + nameBytes.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, stored.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const entry = new Uint8Array(46 + nameBytes.length); const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, stored.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); entry.set(nameBytes, 46);
    locals.push(local, stored); central.push(entry);
    offset += local.length + stored.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  const parts = [...locals, ...central, end];
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0; for (const part of parts) { output.set(part, at); at += part.length; }
  return output;
}

// Cell specs: 'text' (shared string), 12 (number), { n: '1.50' }, { f: 'A1+B1', v: '3' },
// { inline: 'text' }, { rich: ['a', 'b'] }, { str: 'formula text', f: '...' }.
export function xlsxBytes({ sheets, date1904 = false, extraFiles = [], sheetXml = {}, zip = {} }) {
  const shared = []; const index = value => { let at = shared.indexOf(value); if (at < 0) { at = shared.length; shared.push(value); } return at; };
  const sheetFiles = sheets.map((sheet, position) => {
    const rows = new Map();
    for (const [ref, spec] of Object.entries(sheet.cells ?? {})) {
      const row = Number(/\d+$/.exec(ref)[0]);
      if (!rows.has(row)) rows.set(row, []);
      let xml;
      if (typeof spec === 'string') xml = `<c r="${ref}" t="s"><v>${index(spec)}</v></c>`;
      else if (typeof spec === 'number') xml = `<c r="${ref}"><v>${spec}</v></c>`;
      else if (spec.inline !== undefined) xml = `<c r="${ref}" t="inlineStr"><is><t>${escape(spec.inline)}</t></is></c>`;
      else if (spec.rich) { const at = shared.length; shared.push({ rich: spec.rich }); xml = `<c r="${ref}" t="s"><v>${at}</v></c>`; }
      else if (spec.f !== undefined) xml = `<c r="${ref}"${spec.str !== undefined ? ' t="str"' : ''}><f>${escape(spec.f)}</f>${spec.v !== undefined || spec.str !== undefined ? `<v>${escape(spec.str ?? spec.v)}</v>` : ''}</c>`;
      else xml = `<c r="${ref}"><v>${escape(spec.n)}</v></c>`;
      rows.get(row).push([ref, xml]);
    }
    const order = ref => { const letters = /^[A-Z]+/.exec(ref)[0]; return [...letters].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0); };
    const body = [...rows.keys()].sort((a, b) => a - b).map(row => `<row r="${row}">${rows.get(row).sort((a, b) => order(a[0]) - order(b[0])).map(([, xml]) => xml).join('')}</row>`).join('');
    const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    return [`xl/worksheets/sheet${position + 1}.xml`, sheetXml[position] ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData>${merges}</worksheet>`];
  });
  const sharedXml = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map(value => value.rich
    ? `<si>${value.rich.map(part => `<r><t xml:space="preserve">${escape(part)}</t></r>`).join('')}<rPh><t>phonetic</t></rPh></si>` : `<si><t>${escape(value)}</t></si>`).join('')}</sst>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<sheets>${sheets.map((sheet, position) => `<sheet name="${escape(sheet.name)}" sheetId="${position + 1}" r:id="rId${position + 1}"/>`).join('')}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((sheet, position) => `<Relationship Id="rId${position + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${position + 1}.xml"/>`).join('')}</Relationships>`;
  return zipBytes([['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', rels], ['xl/sharedStrings.xml', sharedXml], ...sheetFiles, ...extraFiles], zip);
}

const serial = iso => (Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) - Date.UTC(1899, 11, 30)) / 86400000;
const shift = (ref, rows, columns) => {
  const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(ref);
  const column = [...letters].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) + columns;
  let name = ''; for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return `${name}${Number(row) + rows}`;
};

/** Invented workbook with the Control Finanzas geometry (headers, merges, totals, summary). */
export function syntheticControlCells({ rowOffset = 0, columnOffset = 0, overrides = {} } = {}) {
  const cells = {
    A1: 'CONTROL SINTÉTICO DE PRUEBA', A3: 'DEPÓSITOS MENSUALES',
    A4: 'Mes', B4: 'Año', C4: 'Depósito Gastos (Tú)', D4: 'Depósito Ahorros (Ella)', E4: 'Total Depositado',
    A5: 'Enero', B5: 2031, C5: 11, D5: 22.5, E5: { f: 'C5+D5', v: '33.5' },
    A6: 'Febrero', B6: 2031, C6: 13, E6: { f: 'C6+D6', v: '13' },
    A7: 'Marzo', B7: 2031, D7: 0, E7: { f: 'C7+D7', v: '0' },
    A8: 'TOTALES', C8: { f: 'SUM(C5:C7)', v: '24' }, D8: { f: 'SUM(D5:D7)', v: '22.5' }, E8: { f: 'SUM(E5:E7)', v: '46.5' },
    A11: 'RETIROS DE AHORROS', A12: 'Fecha', B12: 'Descripción', C12: 'Monto Retirado',
    A13: serial('2031-02-03'), B13: 'Retiro sintético A', C13: 5,
    A14: '15/02/2031', B14: 'Retiro sintético B', C14: '$7.5',
    B15: 'Retiro sintético C', C15: 3,
    A16: serial('2031-02-03'), B16: 'Retiro sintético A', C16: 5,
    A19: 'TOTAL RETIRADO', C19: { f: 'SUM(C13:C18)', v: '20.5' },
    A21: 'RESUMEN', A22: 'Total de prueba', B22: { f: 'C8', v: '24' },
    ...overrides,
  };
  const merges = ['A1:E1', 'A3:E3', 'A11:C11', 'A19:B19', 'A21:B21'];
  if (!rowOffset && !columnOffset) return { cells, merges };
  return { cells: Object.fromEntries(Object.entries(cells).map(([ref, value]) => [shift(ref, rowOffset, columnOffset), typeof value === 'object' && value.f
    ? { ...value, f: value.f.replace(/[A-Z]+\d+/g, inner => shift(inner, rowOffset, columnOffset)) } : value])),
  merges: merges.map(range => range.split(':').map(ref => shift(ref, rowOffset, columnOffset)).join(':')) };
}

export const syntheticControlXlsx = (options = {}) => xlsxBytes({ sheets: [{ name: options.sheetName ?? 'Control Sintético', ...syntheticControlCells(options) }], ...(options.workbook ?? {}) });
