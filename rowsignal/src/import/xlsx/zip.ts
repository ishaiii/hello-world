/**
 * A guarded ZIP reader for XLSX packages.
 *
 * The compressed upload being small proves nothing about safety, so every inflate is metered:
 * the central directory is read first (entry count is capped), entries are inflated in small
 * input slices, and decompressed bytes are counted as they appear against one cumulative budget.
 * Declared sizes in the archive are never trusted for allocation.
 */
import { Inflate } from 'fflate';
import { UserFacingError } from '../../engine/types';
import type { Limits } from '../limits';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  /** Size claimed by the archive — informational only. */
  claimedSize: number;
  dataStart: number;
}

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && (data[2] === 0x03 || data[2] === 0x05) && (data[3] === 0x04 || data[3] === 0x06);
}

/** Legacy / password-protected Office files are OLE2 compound documents, not ZIP archives. */
export function looksLikeOle(data: Uint8Array): boolean {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return data.length >= 8 && sig.every((b, i) => data[i] === b);
}

function corrupt(detail: string): UserFacingError {
  return new UserFacingError('xlsx-corrupt', `This .xlsx file could not be read (${detail}). It may be damaged — try opening and re-saving it in Excel.`);
}

export function readZipDirectory(data: Uint8Array, limits: Limits): Map<string, ZipEntry> {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const minEocd = 22;
  if (data.length < minEocd) throw corrupt('file too small');
  let eocd = -1;
  const searchFrom = Math.max(0, data.length - minEocd - 0xffff);
  for (let i = data.length - minEocd; i >= searchFrom; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw corrupt('archive directory not found');
  const total = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new UserFacingError('xlsx-zip64', 'This workbook uses ZIP64 packaging, which is not supported. Re-save it in Excel as a normal .xlsx.');
  }
  if (total > limits.maxZipEntries) {
    throw new UserFacingError('xlsx-too-many-entries', `This workbook contains ${total} internal parts, more than the ${limits.maxZipEntries} allowed.`);
  }
  if (cdOffset + cdSize > data.length) throw corrupt('archive directory is truncated');

  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder('utf-8');
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > data.length || dv.getUint32(p, true) !== CD_SIG) throw corrupt('archive directory is damaged');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const claimedSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(data.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) {
      throw new UserFacingError('xlsx-encrypted', 'This workbook is encrypted with a password. RowSignal cannot open protected files — remove the password in Excel and save a copy.');
    }
    if (localOffset + 30 > data.length || dv.getUint32(localOffset, true) !== LOCAL_SIG) throw corrupt('entry header is damaged');
    const dataStart = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > data.length) throw corrupt('entry data is truncated');
    if (name.endsWith('/')) continue;
    entries.set(name.replace(/\\/g, '/'), { name, method, compressedSize, claimedSize, dataStart });
  }
  return entries;
}

/** Cumulative decompressed-byte budget shared by every inflate in one operation. */
export class ByteBudget {
  used = 0;
  constructor(readonly max: number) {}
  spend(n: number): void {
    this.used += n;
    if (this.used > this.max) {
      throw new UserFacingError(
        'xlsx-too-large',
        `This workbook expands to more than ${Math.round(this.max / (1024 * 1024))} MB of data, which is more than RowSignal will read. It may be a decompression bomb or simply a very large workbook; save the sheet you need as a CSV.`,
      );
    }
  }
}

const INPUT_SLICE = 16 * 1024;

/** Inflate one entry, passing output chunks to `sink` as they appear. */
export function streamEntry(
  data: Uint8Array,
  entry: ZipEntry,
  budget: ByteBudget,
  sink: (chunk: Uint8Array) => void,
): void {
  const raw = data.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) {
    budget.spend(raw.length);
    sink(raw);
    return;
  }
  if (entry.method !== 8) throw corrupt(`unsupported compression method ${entry.method}`);
  try {
    const inf = new Inflate((chunk) => {
      budget.spend(chunk.length);
      sink(chunk);
    });
    if (raw.length === 0) {
      inf.push(new Uint8Array(0), true);
      return;
    }
    for (let i = 0; i < raw.length; i += INPUT_SLICE) {
      const end = Math.min(raw.length, i + INPUT_SLICE);
      inf.push(raw.subarray(i, end), end === raw.length);
    }
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw corrupt('compressed data is damaged');
  }
}

export function readEntryBytes(data: Uint8Array, entry: ZipEntry, budget: ByteBudget): Uint8Array {
  const chunks: Uint8Array[] = [];
  let len = 0;
  streamEntry(data, entry, budget, (c) => {
    chunks.push(c.slice());
    len += c.length;
  });
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const utf8 = new TextDecoder('utf-8');

export function readEntryText(data: Uint8Array, entry: ZipEntry, budget: ByteBudget): string {
  const text = utf8.decode(readEntryBytes(data, entry, budget));
  assertNoDtd(text);
  return text;
}

/** OOXML parts never need a DTD. Refusing one rules out entity-expansion tricks outright. */
export function assertNoDtd(text: string): void {
  const head = text.slice(0, 4096);
  if (/<!DOCTYPE|<!ENTITY/i.test(head)) {
    throw new UserFacingError('xlsx-dtd', 'This workbook contains an XML document-type declaration, which valid Excel files never have. It was not opened.');
  }
}
