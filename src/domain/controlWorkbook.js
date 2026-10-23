import { columnName, excelRange, interpretExcelField } from './excelEvidence.js';

// Recognizes the Control Finanzas M&F layout from header evidence (labels and
// merges), not fixed coordinates. Produces candidate movements plus the trusted,
// reader-owned layout that binds each amount to its field evidence. Nothing here
// confirms, sums or imports money, and no currency or person is assumed.
export const normalizeLabel = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim() : '';

export function recognizePurpose(value) {
  const label = normalizeLabel(value);
  if (/^(?:deposito|retiros?) (?:de |para )?gastos?\b/.test(label)) return 'expenses';
  if (/^(?:deposito|retiros?) (?:de |para )?ahorros?\b/.test(label)) return 'savings';
  return null;
}

const address = (column, row) => `${columnName(column)}${row}`;
const hasValue = cell => !!cell && (cell.type !== 'blank' || !!cell.formula);

function sheetGrid(sheet) {
  const rows = new Map();
  for (const [ref, cell] of Object.entries(sheet.cells)) {
    const { first } = excelRange(ref);
    if (!rows.has(first.row)) rows.set(first.row, new Map());
    rows.get(first.row).set(first.column, { ref, ...cell });
  }
  const merges = sheet.merges.map(excelRange);
  // A merged range reads as its top-left anchor; other covered cells are not separate values.
  const anchorOf = (column, row) => merges.find(merge => merge.first.row <= row && merge.last.row >= row
    && merge.first.column <= column && merge.last.column >= column)?.first ?? { column, row };
  const cellAt = (column, row) => { const anchor = anchorOf(column, row); return rows.get(anchor.row)?.get(anchor.column) ?? null; };
  const label = (column, row) => { const cell = cellAt(column, row); return cell?.type === 'text' ? normalizeLabel(cell.value) : ''; };
  return { rows, merges, cellAt, label, anchorOf, maxRow: Math.max(0, ...rows.keys()) };
}

function findDepositTables(grid) {
  const tables = [];
  for (const [row, columns] of grid.rows) for (const column of columns.keys()) {
    if (grid.label(column, row) !== 'mes' || grid.label(column + 1, row) !== 'ano') continue;
    const table = { headerRow: row, monthColumn: column, yearColumn: column + 1, amounts: [], summaries: [], unknown: [] };
    for (let current = column + 2; hasValue(grid.cellAt(current, row)); current++) {
      const header = grid.label(current, row);
      if (/^deposito\b/.test(header)) table.amounts.push(current);
      else if (/^total\b/.test(header)) table.summaries.push(current);
      else table.unknown.push(current);
    }
    if (table.amounts.length) tables.push(table);
  }
  return tables;
}

function findWithdrawalTables(grid) {
  const tables = [];
  for (const [row, columns] of grid.rows) {
    const find = test => [...columns.keys()].find(column => test(grid.label(column, row)));
    const dateColumn = find(value => value === 'fecha');
    const descriptionColumn = find(value => value === 'descripcion');
    const amountColumn = find(value => /^monto\b/.test(value));
    if (!dateColumn || !descriptionColumn || !amountColumn) continue;
    let title = null;
    for (let above = row - 1; above >= Math.max(1, row - 3) && !title; above--) {
      for (const column of [dateColumn, descriptionColumn, amountColumn]) {
        const anchor = grid.anchorOf(column, above);
        if (/\bretiros?\b/.test(grid.label(anchor.column, anchor.row))) { title = address(anchor.column, anchor.row); break; }
      }
    }
    tables.push({ headerRow: row, dateColumn, descriptionColumn, amountColumn, title });
  }
  return tables;
}

// Ends at a "total..." label or the first row without any table value.
function dataRows(grid, table, firstColumn, columns) {
  const rows = [];
  for (let row = table.headerRow + 1; row <= grid.maxRow; row++) {
    if (/^total/.test(grid.label(firstColumn, row))) return { rows, end: row };
    if (!columns.some(column => hasValue(grid.cellAt(column, row)))) {
      // Allow a short gap of empty template rows before the totals label.
      let next = row + 1;
      while (next <= grid.maxRow && next - row < 30 && !columns.some(column => hasValue(grid.cellAt(column, next))) && !/^total/.test(grid.label(firstColumn, next))) next++;
      if (/^total/.test(grid.label(firstColumn, next))) return { rows, end: next };
      return { rows, end: row - 1 };
    }
    rows.push(row);
  }
  return { rows, end: grid.maxRow };
}

/** Builds candidates and an independent evidence context for one captured workbook. */
export function recognizeControlWorkbook(capture) {
  const fingerprint = capture.fingerprint.toLowerCase();
  const batchId = `preimport-${fingerprint.slice(0, 16)}`;
  const contextSheets = {};
  const workbook = { dateSystem: capture.dateSystem, sheets: contextSheets };
  const context = { workbooks: new Map([[fingerprint, workbook]]) };
  const records = [];
  const sheets = [];
  const notes = [];
  if (capture.externalLinks) notes.push({ code: 'EXTERNAL_LINKS_IGNORED', sheet: null, refs: [], count: capture.externalLinks });

  for (const sheet of capture.sheets) {
    if (sheet.kind !== 'worksheet') { sheets.push({ name: sheet.name, recognized: false, deposits: 0, withdrawals: 0 }); continue; }
    const grid = sheetGrid(sheet);
    const cells = { ...sheet.cells };
    contextSheets[sheet.name] = { cells, merges: [...sheet.merges], operations: {} };
    const covered = new Set();
    const cover = (column, row) => { const anchor = grid.anchorOf(column, row); covered.add(address(anchor.column, anchor.row)); return address(anchor.column, anchor.row); };
    // Absent XML cells are blank; captured explicitly so evidence can prove the absence.
    const ensure = ref => { if (!cells[ref]) cells[ref] = { type: 'blank', value: null }; return ref; };
    const value = ref => cells[ref]?.value ?? null;
    const summary = { name: sheet.name, recognized: false, deposits: 0, withdrawals: 0 };
    const add = (record, layout) => {
      contextSheets[sheet.name].operations[record.provenance.operation.amountRef] = layout;
      records.push(record);
    };
    const base = (row, amountRef, kind) => ({
      id: `ctl-${fingerprint.slice(0, 16)}-${encodeURIComponent(sheet.name)}-${amountRef}`, schemaVersion: 1, householdId: null, revision: 0,
      moduleId: 'control-mf', origin: 'real', validationStatus: 'pending', actorId: null, kind, currency: null, description: null,
      evidenceReviews: [], preimportResolutions: [], preimportDecisions: [],
    });

    for (const table of findDepositTables(grid)) {
      summary.recognized = true;
      [table.monthColumn, table.yearColumn, ...table.amounts, ...table.summaries, ...table.unknown].forEach(column => cover(column, table.headerRow));
      if (table.unknown.length) notes.push({ code: 'UNKNOWN_DEPOSIT_COLUMN', sheet: sheet.name, refs: table.unknown.map(column => address(column, table.headerRow)) });
      for (let above = table.headerRow - 1; above >= Math.max(1, table.headerRow - 2); above--) {
        const anchor = grid.anchorOf(table.monthColumn, above);
        if (/^deposito/.test(grid.label(anchor.column, anchor.row))) cover(anchor.column, anchor.row);
      }
      const { rows, end } = dataRows(grid, table, table.monthColumn, [table.monthColumn, table.yearColumn, ...table.amounts]);
      const totalRow = /^total/.test(grid.label(table.monthColumn, end)) ? end : null;
      const excluded = [];
      for (let row = table.headerRow + 1; row <= end; row++) {
        for (const column of [table.monthColumn, table.yearColumn, ...table.amounts, ...table.summaries]) {
          const cell = grid.cellAt(column, row);
          if (hasValue(cell)) cover(column, row);
          if (cell?.formula && (table.summaries.includes(column) || row === totalRow)) excluded.push(cell.ref);
        }
      }
      if (excluded.length) notes.push({ code: 'TOTAL_FORMULAS_EXCLUDED', sheet: sheet.name, refs: excluded });
      for (const row of rows) for (const column of table.amounts) {
        const amountCell = grid.cellAt(column, row);
        if (!hasValue(amountCell)) continue;
        const amountRef = ensure(cover(column, row));
        const headerRef = cover(column, table.headerRow);
        const monthRef = ensure(address(table.monthColumn, row));
        const yearRef = ensure(address(table.yearColumn, row));
        const evidence = {
          amount: [{ sheet: sheet.name, ref: amountRef }],
          // The amount cell is the only evidence a currency could relate to; it carries none.
          currency: [{ sheet: sheet.name, ref: amountRef }],
          contributorId: [{ sheet: sheet.name, ref: headerRef }],
          effectiveDate: [],
          period: [{ sheet: sheet.name, ref: monthRef, role: 'month' }, { sheet: sheet.name, ref: yearRef, role: 'year' }],
        };
        const range = `${columnName(Math.min(table.monthColumn, column))}${row}:${columnName(Math.max(table.yearColumn, column))}${row}`;
        const record = { ...base(row, amountRef, 'deposit'), period: null, effectiveDate: null, amount: null, contributorId: null,
          purpose: recognizePurpose(value(headerRef)),
          provenance: { type: 'control-excel', sourceId: 'archivo-local', sourceFingerprint: fingerprint, importBatchId: batchId, sheet: sheet.name, row,
            cells: { amount: amountRef, month: monthRef, year: yearRef, contributorId: headerRef, purpose: headerRef },
            original: { amount: value(amountRef), month: value(monthRef), year: value(yearRef), contributorId: value(headerRef), purpose: value(headerRef) },
            operation: { range, amountRef }, evidence } };
        add(record, { range, fields: structuredClone(evidence) });
        record.amount = interpretExcelField(record, 'amount', context);
        record.period = interpretExcelField(record, 'period', context);
        record.contributorId = interpretExcelField(record, 'contributorId', context);
        summary.deposits++;
      }
    }

    for (const table of findWithdrawalTables(grid)) {
      summary.recognized = true;
      const columns = [table.dateColumn, table.descriptionColumn, table.amountColumn];
      columns.forEach(column => cover(column, table.headerRow));
      if (table.title) covered.add(table.title);
      const { rows, end } = dataRows(grid, table, table.dateColumn, columns);
      const excluded = [];
      for (const column of columns) {
        const cell = grid.cellAt(column, end);
        if (cell && end > table.headerRow && /^total/.test(grid.label(table.dateColumn, end))) { cover(column, end); if (cell.formula) excluded.push(cell.ref); }
      }
      if (excluded.length) notes.push({ code: 'TOTAL_FORMULAS_EXCLUDED', sheet: sheet.name, refs: excluded });
      for (const row of rows) {
        columns.forEach(column => { if (hasValue(grid.cellAt(column, row))) cover(column, row); });
        if (!hasValue(grid.cellAt(table.amountColumn, row))) { notes.push({ code: 'WITHDRAWAL_ROW_WITHOUT_AMOUNT', sheet: sheet.name, refs: [address(table.amountColumn, row)] }); continue; }
        const amountRef = ensure(cover(table.amountColumn, row));
        const dateRef = ensure(cover(table.dateColumn, row));
        const descriptionRef = ensure(cover(table.descriptionColumn, row));
        const evidence = {
          amount: [{ sheet: sheet.name, ref: amountRef }],
          currency: [{ sheet: sheet.name, ref: amountRef }],
          // No structural cell identifies a person for a withdrawal: verified absent.
          contributorId: [],
          effectiveDate: [{ sheet: sheet.name, ref: dateRef }],
          // The period is never deduced from the date by default; it requires review.
          period: [{ sheet: sheet.name, ref: dateRef }],
        };
        const range = `${columnName(Math.min(...columns))}${row}:${columnName(Math.max(...columns))}${row}`;
        const cellsMap = { amount: amountRef, date: dateRef, description: descriptionRef, ...(table.title ? { purpose: table.title } : {}) };
        const record = { ...base(row, amountRef, 'withdrawal'), period: null, contributorId: null,
          description: typeof value(descriptionRef) === 'string' ? value(descriptionRef) : null,
          purpose: table.title ? recognizePurpose(value(table.title)) : null,
          provenance: { type: 'control-excel', sourceId: 'archivo-local', sourceFingerprint: fingerprint, importBatchId: batchId, sheet: sheet.name, row,
            cells: cellsMap, original: Object.fromEntries(Object.entries(cellsMap).map(([field, ref]) => [field, value(ref)])),
            operation: { range, amountRef }, evidence } };
        add(record, { range, fields: structuredClone(evidence) });
        record.amount = interpretExcelField(record, 'amount', context);
        record.effectiveDate = interpretExcelField(record, 'effectiveDate', context);
        summary.withdrawals++;
      }
    }

    const formulas = []; const outside = [];
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      if (covered.has(ref) || !hasValue(cell)) continue;
      (cell.formula ? formulas : outside).push(ref);
    }
    if (formulas.length) notes.push({ code: 'FORMULAS_NOT_EXECUTED', sheet: sheet.name, refs: formulas });
    if (outside.length && summary.recognized) notes.push({ code: 'CELLS_OUTSIDE_TABLES', sheet: sheet.name, refs: outside });
    if (!summary.recognized && Object.keys(sheet.cells).length) notes.push({ code: 'SHEET_NOT_RECOGNIZED', sheet: sheet.name, refs: [] });
    sheets.push(summary);
  }
  if (!sheets.some(sheet => sheet.recognized)) return { ok: false, code: 'STRUCTURE_NOT_RECOGNIZED' };
  return { ok: true, batch: { fingerprint, importBatchId: batchId, dateSystem: capture.dateSystem, sheets, notes, recordIds: records.map(record => record.id) },
    records, workbook };
}
