/**
 * XLSX reader. Reads the cached value of every cell and never evaluates a formula, follows a
 * hyperlink, resolves an external workbook link or runs a macro. Memory and time are bounded by
 * the configured limits; worksheet dimension attributes are never used to size anything.
 */
import { excelSerialToIso, isoDatePart } from '../../engine/dates';
import { excelNumberText } from '../../engine/values';
import { emptyGrid, columnIndexFromLetters, type SheetGrid } from '../../engine/table';
import {
  CELL_BOOL,
  CELL_DATE,
  CELL_DATE_INVALID,
  CELL_ERROR,
  CELL_FORMULA,
  CELL_FORMULA_NOCACHE,
  CELL_NUMBER,
  UserFacingError,
} from '../../engine/types';
import type { Limits } from '../limits';
import { ByteBudget, looksLikeOle, looksLikeZip, readEntryText, readZipDirectory, streamEntry, assertNoDtd, type ZipEntry } from './zip';
import { collectText, decodeXmlText, isTruthy, parseAttrs, resolvePartPath } from './xml';

export type SheetState = 'visible' | 'hidden' | 'veryHidden';

export interface SheetMeta {
  name: string;
  state: SheetState;
  path: string;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** True when a custom number-format code displays a date or time. */
export function isDateFormatCode(code: string): boolean {
  let s = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/[_*]./g, '');
  // Elapsed-time brackets such as [h], [mm], [ss] are time formats; other brackets are colours/locale tags.
  if (/\[(?:h+|m+|s+)\]/i.test(s)) return true;
  s = s.replace(/\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(s);
}

function parseStyles(xml: string): boolean[] {
  const custom = new Map<number, string>();
  const fmtRe = /<numFmt\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = fmtRe.exec(xml)) !== null) {
    const a = parseAttrs(m[1]!);
    if (a.numFmtId !== undefined && a.formatCode !== undefined) custom.set(Number(a.numFmtId), a.formatCode);
  }
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  const isDate: boolean[] = [];
  if (!block) return isDate;
  const xfRe = /<xf\b([^>]*?)(?:\/>|>)/g;
  while ((m = xfRe.exec(block[1]!)) !== null) {
    const id = Number(parseAttrs(m[1]!).numFmtId ?? 0);
    const code = custom.get(id);
    isDate.push(code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_FORMATS.has(id));
  }
  return isDate;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1] === undefined ? '' : collectText(m[1]));
  return out;
}

export class XlsxWorkbook {
  readonly sheets: SheetMeta[];
  readonly date1904: boolean;
  readonly hasMacros: boolean;
  readonly hasExternalLinks: boolean;
  private shared: string[] | null = null;

  private constructor(
    private readonly data: Uint8Array,
    private readonly entries: Map<string, ZipEntry>,
    private readonly dateXf: boolean[],
    sheets: SheetMeta[],
    date1904: boolean,
  ) {
    this.sheets = sheets;
    this.date1904 = date1904;
    this.hasMacros = entries.has('xl/vbaProject.bin');
    this.hasExternalLinks = [...entries.keys()].some((k) => k.startsWith('xl/externalLinks/'));
  }

  static open(data: Uint8Array, limits: Limits): XlsxWorkbook {
    if (looksLikeOle(data)) {
      throw new UserFacingError(
        'xlsx-ole',
        'This file looks like a password-protected workbook or an old .xls file with a .xlsx name. RowSignal cannot open protected files — remove the password in Excel and save a copy as .xlsx or .csv.',
      );
    }
    if (!looksLikeZip(data)) {
      throw new UserFacingError('xlsx-not-zip', 'This file is not a valid .xlsx workbook (it is not a ZIP package).');
    }
    const entries = readZipDirectory(data, limits);
    const budget = new ByteBudget(limits.maxDecompressedBytes);
    const wbEntry = entries.get('xl/workbook.xml');
    if (!wbEntry) throw new UserFacingError('xlsx-not-workbook', 'This ZIP file is not an Excel workbook (xl/workbook.xml is missing).');
    const wbXml = readEntryText(data, wbEntry, budget);
    const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
    const relsXml = relsEntry ? readEntryText(data, relsEntry, budget) : '';
    const stylesEntry = entries.get('xl/styles.xml');
    const dateXf = stylesEntry ? parseStyles(readEntryText(data, stylesEntry, budget)) : [];

    const rels = new Map<string, { target: string; type: string }>();
    const relRe = /<Relationship\b([^>]*?)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = relRe.exec(relsXml)) !== null) {
      const a = parseAttrs(m[1]!);
      if (a.TargetMode === 'External' || !a.Id || !a.Target) continue;
      rels.set(a.Id, { target: a.Target, type: a.Type ?? '' });
    }

    const date1904 = isTruthy(parseAttrs(/<workbookPr\b([^>]*?)\/?>/.exec(wbXml)?.[1] ?? '').date1904);
    const sheetsBlock = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(wbXml)?.[1] ?? '';
    const sheets: SheetMeta[] = [];
    const sheetRe = /<sheet\b([^>]*?)\/?>/g;
    while ((m = sheetRe.exec(sheetsBlock)) !== null) {
      const a = parseAttrs(m[1]!);
      const rel = a['r:id'] ? rels.get(a['r:id']) : undefined;
      if (!a.name || !rel || !rel.type.endsWith('/worksheet')) continue; // chart sheets etc. hold no table
      const state: SheetState = a.state === 'hidden' || a.state === 'veryHidden' ? a.state : 'visible';
      sheets.push({ name: a.name, state, path: resolvePartPath(rel.target) });
    }
    if (sheets.length === 0) throw new UserFacingError('xlsx-no-sheets', 'This workbook has no worksheets with data.');
    return new XlsxWorkbook(data, entries, dateXf, sheets, date1904);
  }

  /** First visible sheet, or the first sheet if all are hidden. */
  defaultSheet(): SheetMeta {
    return this.sheets.find((s) => s.state === 'visible') ?? this.sheets[0]!;
  }

  readSheet(name: string, limits: Limits, deadline: number): SheetGrid {
    const meta = this.sheets.find((s) => s.name === name);
    if (!meta) throw new UserFacingError('xlsx-sheet-missing', `The sheet “${name}” was not found in this workbook.`);
    const entry = this.entries.get(meta.path);
    if (!entry) throw new UserFacingError('xlsx-sheet-missing', `The data for sheet “${name}” is missing from the workbook.`);
    const budget = new ByteBudget(limits.maxDecompressedBytes);
    if (!this.shared) {
      const ss = this.entries.get('xl/sharedStrings.xml');
      this.shared = ss ? parseSharedStrings(readEntryText(this.data, ss, budget)) : [];
    }
    const parser = new SheetParser(meta.name, this.shared, this.dateXf, this.date1904, limits, deadline);
    const decoder = new TextDecoder('utf-8');
    streamEntry(this.data, entry, budget, (chunk) => parser.feed(decoder.decode(chunk, { stream: true })));
    parser.feed(decoder.decode());
    return parser.finish();
  }
}

const COLS_RE = /<col\b([^>]*?)\/?>/g;
const R_ATTR = /\br="([A-Z]*)(\d*)"/;
const T_ATTR = /\bt="([^"]*)"/;
const S_ATTR = /\bs="(\d+)"/;
const V_RE = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>|<v\s*\/>/;
const IS_RE = /<is\b[^>]*>([\s\S]*?)<\/is>/;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const MAX_ROW_NUMBER = 1_048_576;
const MAX_ROW_XML = 32 * 1024 * 1024;

class SheetParser {
  private readonly grid: SheetGrid;
  private buf = '';
  private state: 0 | 1 | 2 = 0;
  private prevRow = 0;
  private maxCol = 0;
  private populated = 0;
  private rowCounter = 0;
  private hiddenCols = new Set<number>();

  constructor(
    sheetName: string,
    private readonly shared: string[],
    private readonly dateXf: boolean[],
    private readonly date1904: boolean,
    private readonly limits: Limits,
    private readonly deadline: number,
  ) {
    this.grid = emptyGrid(sheetName);
    this.grid.date1904 = date1904;
  }

  feed(text: string): void {
    if (this.state === 2 || text === '') return;
    this.buf += text;
    this.process();
  }

  finish(): SheetGrid {
    const g = this.grid;
    g.width = this.maxCol;
    g.hiddenColumns = [...this.hiddenCols].filter((c) => c < g.width).sort((a, b) => a - b);
    return g;
  }

  private process(): void {
    if (this.state === 0) {
      const idx = this.buf.indexOf('<sheetData');
      if (idx < 0) {
        if (this.buf.length > 8 * 1024 * 1024) throw new UserFacingError('xlsx-corrupt', 'This sheet has an unexpected structure and could not be read.');
        return;
      }
      assertNoDtd(this.buf);
      const gt = this.buf.indexOf('>', idx);
      if (gt < 0) return;
      this.readCols(this.buf.slice(0, idx));
      const selfClosing = this.buf.charCodeAt(gt - 1) === 47;
      this.buf = this.buf.slice(gt + 1);
      if (selfClosing) {
        this.state = 2;
        this.buf = '';
        return;
      }
      this.state = 1;
    }
    if (this.state !== 1) return;
    const buf = this.buf;
    let pos = 0;
    const endSheet = buf.indexOf('</sheetData>');
    for (;;) {
      const rs = this.nextRowStart(buf, pos);
      if (rs < 0 || (endSheet >= 0 && endSheet < rs)) {
        if (endSheet >= 0) {
          this.state = 2;
          this.buf = '';
          return;
        }
        pos = Math.max(pos, buf.length - 8); // keep a possible partial "<row" token
        break;
      }
      const gt = buf.indexOf('>', rs);
      if (gt < 0) {
        pos = rs;
        break;
      }
      if (buf.charCodeAt(gt - 1) === 47) {
        pos = gt + 1; // <row .../> — no cells
        continue;
      }
      const close = buf.indexOf('</row>', gt);
      if (close < 0) {
        if (buf.length - rs > MAX_ROW_XML) throw new UserFacingError('xlsx-corrupt', 'A single row in this sheet is unreasonably large; the file was not read.');
        pos = rs;
        break;
      }
      this.handleRow(buf.slice(rs + 4, gt), buf.slice(gt + 1, close));
      pos = close + 6;
    }
    this.buf = pos > 0 ? buf.slice(pos) : buf;
  }

  private nextRowStart(buf: string, from: number): number {
    let i = from;
    for (;;) {
      i = buf.indexOf('<row', i);
      if (i < 0) return -1;
      const c = buf.charCodeAt(i + 4);
      if (c === 32 || c === 62 || c === 47 || c === 9 || c === 10 || c === 13) return i;
      i += 4;
    }
  }

  private readCols(header: string): void {
    COLS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COLS_RE.exec(header)) !== null) {
      const a = parseAttrs(m[1]!);
      if (!isTruthy(a.hidden)) continue;
      const lo = Math.max(1, Number(a.min ?? 0));
      const hi = Math.min(Number(a.max ?? lo), lo + 1000);
      for (let c = lo; c <= hi; c++) this.hiddenCols.add(c - 1);
    }
  }

  private handleRow(attrText: string, inner: string): void {
    if ((++this.rowCounter & 1023) === 0 && Date.now() > this.deadline) {
      throw new UserFacingError('timeout', 'Reading this file took too long and was stopped. Try a smaller sheet or save it as CSV.');
    }
    const a = parseAttrs(attrText);
    const rowNum = a.r !== undefined ? Number(a.r) : this.prevRow + 1;
    if (!Number.isInteger(rowNum) || rowNum < 1 || rowNum > MAX_ROW_NUMBER) {
      throw new UserFacingError('xlsx-corrupt', 'This sheet contains an invalid row number.');
    }
    this.prevRow = rowNum;
    const hidden = isTruthy(a.hidden);

    const cells: string[] = [];
    let flags: Uint8Array | null = null;
    let prevCol = -1;
    let rowMaxCol = 0;
    CELL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    const limits = this.limits;
    while ((m = CELL_RE.exec(inner)) !== null) {
      const attrs = m[1]!;
      const content = m[2];
      const rm = R_ATTR.exec(attrs);
      const col = rm && rm[1] ? columnIndexFromLetters(rm[1]) : prevCol + 1;
      prevCol = col;
      if (content === undefined || content === '') continue; // styled but empty cell
      if (col < 0 || col > 16383) throw new UserFacingError('xlsx-corrupt', 'This sheet contains an invalid cell reference.');
      const t = T_ATTR.exec(attrs)?.[1] ?? 'n';
      const sIdx = S_ATTR.exec(attrs)?.[1];
      const hasF = content.includes('<f');
      const vm = V_RE.exec(content);
      const vRaw = vm ? (vm[1] ?? '') : null;
      let text = '';
      let fl = 0;

      switch (t) {
        case 's': {
          const idx = vRaw === null ? -1 : Number(vRaw);
          text = Number.isInteger(idx) && idx >= 0 && idx < this.shared.length ? this.shared[idx]! : '';
          break;
        }
        case 'inlineStr': {
          const im = IS_RE.exec(content);
          text = im ? collectText(im[1]!) : '';
          break;
        }
        case 'str':
          text = vRaw === null ? '' : decodeXmlText(vRaw);
          break;
        case 'b':
          text = vRaw === '1' || vRaw === 'true' ? 'TRUE' : 'FALSE';
          fl |= CELL_BOOL;
          break;
        case 'e':
          text = vRaw === null ? '#ERROR' : decodeXmlText(vRaw);
          fl |= CELL_ERROR;
          this.grid.errorCells++;
          break;
        case 'd': {
          const d = vRaw === null ? null : isoDatePart(decodeXmlText(vRaw).slice(0, 19));
          text = vRaw === null ? '' : decodeXmlText(vRaw);
          fl |= d ? CELL_DATE : 0;
          break;
        }
        default: {
          if (vRaw === null || vRaw === '') break;
          const stored = decodeXmlText(vRaw).trim();
          const isDate = sIdx !== undefined && this.dateXf[Number(sIdx)] === true;
          if (isDate) {
            const serial = Number(stored);
            const parts = excelSerialToIso(serial, this.date1904);
            if (parts.ok) {
              text = parts.text;
              fl |= CELL_DATE;
            } else {
              text = stored;
              fl |= CELL_DATE_INVALID;
            }
          } else {
            text = excelNumberText(stored);
            fl |= CELL_NUMBER;
            this.grid.numericCells++;
          }
        }
      }
      if (hasF) {
        this.grid.formulaCells++;
        // No <v>, or an empty <v/> on a non-string formula, means the file stores no result.
        if (vRaw === null || (vRaw === '' && t !== 'str')) {
          fl |= CELL_FORMULA_NOCACHE;
          this.grid.formulaNoCache++;
        } else fl |= CELL_FORMULA;
      }
      if (text === '' && fl === 0) continue;
      if (col >= limits.maxCols) {
        throw new UserFacingError('too-many-columns', `This sheet has data beyond column ${limits.maxCols}. RowSignal reads up to ${limits.maxCols} columns; delete unused columns or split the sheet.`);
      }
      cells[col] = text;
      if (fl !== 0) {
        if (!flags) flags = new Uint8Array(limits.maxCols);
        flags[col] = fl;
      }
      if (col + 1 > rowMaxCol) rowMaxCol = col + 1;
      if (text !== '') this.populated++;
    }
    if (rowMaxCol === 0) return;
    for (let c = 0; c < rowMaxCol; c++) if (cells[c] === undefined) cells[c] = '';
    let blank = flags === null;
    if (blank) {
      for (let c = 0; c < rowMaxCol; c++) {
        if (cells[c]!.trim() !== '') {
          blank = false;
          break;
        }
      }
    }
    if (blank) return;

    const g = this.grid;
    if (g.rows.length >= limits.maxRows + 1) {
      throw new UserFacingError('too-many-rows', `This sheet has more than ${limits.maxRows.toLocaleString('en-US')} rows. RowSignal reads up to ${limits.maxRows.toLocaleString('en-US')} rows per sheet; filter or split the data first.`);
    }
    if (this.populated > limits.maxCells) {
      throw new UserFacingError('too-many-cells', `This sheet has more than ${limits.maxCells.toLocaleString('en-US')} filled cells, which is more than RowSignal reads at once.`);
    }
    g.rows.push(cells);
    g.rowNumbers.push(rowNum);
    g.rowFlags.push(flags);
    g.lastRowNumber = rowNum;
    if (hidden) g.hiddenRows++;
    if (rowMaxCol > this.maxCol) this.maxCol = rowMaxCol;
  }
}
