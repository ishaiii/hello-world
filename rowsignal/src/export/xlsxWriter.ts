/**
 * A small XLSX writer. Every text value becomes a literal inline-string cell; there is no code
 * path that can emit a formula. Sheet names are sanitised to Excel's rules.
 */
import { zipSync } from 'fflate';
import { startsLikeFormula } from './safeText';

export type XStyle = 'default' | 'header' | 'wrap' | 'bold' | 'money' | 'dateDMY' | 'dateMDY' | 'dateISO' | 'integer' | 'good' | 'warn' | 'bad';

export type XCell =
  | string
  | number
  | boolean
  | null
  | undefined
  | { v?: string | number | boolean | null; style?: XStyle; serial?: number };

export interface XSheet {
  name: string;
  rows: XCell[][];
  colWidths?: number[];
  /** Number of leading rows to freeze (typically 1). */
  freezeRows?: number;
  autoFilter?: boolean;
}

const STYLE_INDEX: Record<XStyle | 'quoted', number> = {
  default: 0,
  header: 1,
  wrap: 2,
  bold: 3,
  money: 4,
  dateDMY: 5,
  dateMDY: 6,
  dateISO: 7,
  integer: 8,
  good: 9,
  warn: 10,
  bad: 11,
  quoted: 12,
};

const MAX_CELL_CHARS = 32767;
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Remove characters XML cannot carry and enforce Excel's per-cell text limit. */
export function cleanCellText(s: string): string {
  let t = s.replace(INVALID_XML, '�');
  if (t.length > MAX_CELL_CHARS) t = t.slice(0, MAX_CELL_CHARS - 1) + '…';
  return t;
}

export function columnName(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Excel sheet names: 1–31 chars, none of `[]:*?/\`, no leading/trailing apostrophe, not "History", unique. */
export function sanitizeSheetName(name: string, taken: ReadonlySet<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '');
  if (base === '' || base.toLowerCase() === 'history') base = base === '' ? 'Sheet' : 'History sheet';
  base = base.slice(0, 31);
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

function cellXml(ref: string, cell: XCell): string {
  if (cell === null || cell === undefined || cell === '') return '';
  let v: string | number | boolean | null | undefined;
  let style: XStyle | 'quoted' = 'default';
  let serial: number | undefined;
  if (typeof cell === 'object') {
    v = cell.v;
    style = cell.style ?? 'default';
    serial = cell.serial;
  } else {
    v = cell;
  }
  if (serial !== undefined) return `<c r="${ref}" s="${STYLE_INDEX[style]}"><v>${serial}</v></c>`;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return `<c r="${ref}" t="inlineStr" s="${STYLE_INDEX[style]}"><is><t>${String(v)}</t></is></c>`;
    return `<c r="${ref}" s="${STYLE_INDEX[style]}"><v>${v}</v></c>`;
  }
  if (typeof v === 'boolean') return `<c r="${ref}" t="b" s="${STYLE_INDEX[style]}"><v>${v ? 1 : 0}</v></c>`;
  const text = cleanCellText(v);
  if (style === 'default' && startsLikeFormula(text)) style = 'quoted';
  return `<c r="${ref}" t="inlineStr" s="${STYLE_INDEX[style]}"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="mm/dd/yyyy"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17253B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F5F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF0F3"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet: XSheet): string {
  const rows = sheet.rows;
  let maxCols = 0;
  const body: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.length > maxCols) maxCols = cells.length;
    let rowXml = '';
    for (let c = 0; c < cells.length; c++) rowXml += cellXml(`${columnName(c)}${r + 1}`, cells[c]);
    body.push(rowXml === '' ? `<row r="${r + 1}"/>` : `<row r="${r + 1}">${rowXml}</row>`);
  }
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  const freeze = sheet.freezeRows ?? 0;
  xml += '<sheetViews><sheetView workbookViewId="0">';
  if (freeze > 0) xml += `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>`;
  xml += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
  if (sheet.colWidths && sheet.colWidths.length > 0) {
    xml += '<cols>' + sheet.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
  }
  xml += `<sheetData>${body.join('')}</sheetData>`;
  if (sheet.autoFilter && rows.length > 1 && maxCols > 0) xml += `<autoFilter ref="A1:${columnName(maxCols - 1)}${rows.length}"/>`;
  return xml + '</worksheet>';
}

export function buildXlsx(sheetsIn: readonly XSheet[]): Uint8Array {
  const taken = new Set<string>();
  const sheets = sheetsIn.map((s) => {
    const name = sanitizeSheetName(s.name, taken);
    taken.add(name);
    return { ...s, name };
  });
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, xml: string) => {
    files[path] = enc.encode(xml);
  };
  put(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  put(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  put(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets
      .map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  put(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  put('xl/styles.xml', STYLES_XML);
  sheets.forEach((s, i) => put(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));

  const mtime = Date.UTC(2026, 0, 1);
  const zipInput: Record<string, [Uint8Array, { level: 6; mtime: number }]> = {};
  for (const [path, data] of Object.entries(files)) zipInput[path] = [data, { level: 6, mtime }];
  return zipSync(zipInput);
}

/** Excel serial for a calendar date in the 1900 system (valid for dates on or after 1900-03-01). */
export function excelSerialFromYmd(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}
