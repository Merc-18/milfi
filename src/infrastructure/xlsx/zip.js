// Minimal in-memory ZIP reader for local .xlsx files. Supports stored/deflate
// entries only; rejects encryption, Zip64, multi-disk archives and oversized
// content. Nothing is extracted to disk and nothing leaves the browser.
export const XLSX_LIMITS = Object.freeze({ fileBytes: 10 * 1024 * 1024, entries: 2000, entryBytes: 30 * 1024 * 1024, totalBytes: 60 * 1024 * 1024 });

export class WorkbookFormatError extends Error {
  constructor(code) { super(code); this.name = 'WorkbookFormatError'; this.code = code; }
}
export const fail = code => { throw new WorkbookFormatError(code); };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZipDirectory(bytes, limits = XLSX_LIMITS) {
  if (!(bytes instanceof Uint8Array)) fail('INVALID_FILE');
  if (bytes.length > limits.fileBytes) fail('FILE_TOO_LARGE');
  // OLE compound files: legacy .xls or password-protected (encrypted) workbooks.
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) fail('LEGACY_OR_PROTECTED_WORKBOOK');
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail('NOT_A_ZIP');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
    if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) fail('NOT_A_ZIP');
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true)
    || count === 0xffff || offset === 0xffffffff) fail('UNSUPPORTED_ZIP');
  if (count > limits.entries) fail('TOO_MANY_ENTRIES');
  if (offset + size > end) fail('CORRUPT_ZIP');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map();
  let at = offset;
  let declared = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) fail('CORRUPT_ZIP');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const nameLength = view.getUint16(at + 28, true);
    const entry = { method, crc: view.getUint32(at + 16, true), compressed: view.getUint32(at + 20, true),
      uncompressed: view.getUint32(at + 24, true), local: view.getUint32(at + 42, true) };
    let name;
    try { name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)); } catch { fail('CORRUPT_ZIP'); }
    if (flags & 1) fail('ENCRYPTED_ZIP');
    if (method !== 0 && method !== 8) fail('UNSUPPORTED_COMPRESSION');
    if (method === 0 && entry.compressed !== entry.uncompressed) fail('CORRUPT_ZIP');
    declared += entry.uncompressed;
    if (entry.uncompressed > limits.entryBytes || declared > limits.totalBytes) fail('ARCHIVE_TOO_LARGE');
    if (entries.has(name)) fail('DUPLICATE_ZIP_ENTRY');
    entries.set(name, { name, ...entry });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return { bytes, view, entries };
}

async function inflate(data, expected) {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      // Never trust declared sizes beyond the limit: stop as soon as output exceeds it.
      if (total > expected) { await reader.cancel().catch(() => {}); fail('CORRUPT_ZIP'); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof WorkbookFormatError) throw error;
    fail('CORRUPT_ZIP');
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function readZipEntry(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) return null;
  const { bytes, view } = zip;
  const at = entry.local;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) fail('CORRUPT_ZIP');
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  if (start + entry.compressed > bytes.length) fail('CORRUPT_ZIP');
  const data = bytes.subarray(start, start + entry.compressed);
  const output = entry.method === 0 ? data : await inflate(data, entry.uncompressed);
  if (output.length !== entry.uncompressed || crc32(output) !== entry.crc) fail('CORRUPT_ZIP');
  return output;
}
