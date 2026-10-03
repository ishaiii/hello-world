import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { loadFileData } from '../src/import/loadFile';
import { DEFAULT_LIMITS, type Limits } from '../src/import/limits';
import { buildXlsx } from '../src/export/xlsxWriter';
import { UserFacingError } from '../src/engine/types';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

function pkg(sheetXml: string | Uint8Array, extra: Record<string, Uint8Array> = {}, workbook?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(workbook ?? `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': typeof sheetXml === 'string' ? strToU8(sheetXml) : sheetXml,
    ...extra,
  };
  return zipSync(files);
}

const cell = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
const sheet = (rows: string) => `<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`;

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof UserFacingError) return e.code;
    throw e;
  }
  return 'none';
}

describe('hostile XLSX input', () => {
  it('stops a decompression bomb at the cumulative decompressed-byte budget', () => {
    // ~64 MB of repeated text compresses to a few tens of KB.
    const bomb = '<worksheet ' + NS + '><sheetData><row r="1">' + cell('A1', 'a'.repeat(1)) + '</row><!--' + 'x'.repeat(64 * 1024 * 1024) + '--></sheetData></worksheet>';
    const bytes = pkg(bomb);
    expect(bytes.length).toBeLessThan(200_000);
    const limits: Limits = { ...DEFAULT_LIMITS, maxDecompressedBytes: 8 * 1024 * 1024 };
    expect(code(() => loadFileData('bomb.xlsx', bytes, {}, limits))).toBe('xlsx-too-large');
  });

  it('applies the default 256 MB cap to a much larger bomb', () => {
    const chunk = 'y'.repeat(1024 * 1024);
    const parts = ['<worksheet ' + NS + '><sheetData><row r="1">' + cell('A1', 'a') + '</row><!--'];
    for (let i = 0; i < 300; i++) parts.push(chunk);
    parts.push('--></sheetData></worksheet>');
    const bytes = pkg(strToU8(parts.join('')));
    expect(bytes.length).toBeLessThan(2_000_000);
    expect(code(() => loadFileData('bomb.xlsx', bytes))).toBe('xlsx-too-large');
  }, 60_000);

  it('rejects archives with too many entries', () => {
    const extra: Record<string, Uint8Array> = {};
    for (let i = 0; i < 60; i++) extra[`xl/junk/${i}.xml`] = strToU8('<a/>');
    const bytes = pkg(sheet(`<row r="1">${cell('A1', 'a')}</row>`), extra);
    expect(code(() => loadFileData('many.xlsx', bytes, {}, { ...DEFAULT_LIMITS, maxZipEntries: 20 }))).toBe('xlsx-too-many-entries');
  });

  it('rejects a document-type declaration (entity expansion)', () => {
    const wb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><workbook ' + NS + '></workbook>';
    expect(code(() => loadFileData('dtd.xlsx', pkg(sheet(''), {}, wb)))).toBe('xlsx-dtd');
    const sheetWithDtd = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet ' + NS + '><sheetData></sheetData></worksheet>';
    expect(code(() => loadFileData('dtd2.xlsx', pkg(sheetWithDtd)))).toBe('xlsx-dtd');
  });

  it('ignores a huge declared dimension and allocates by actual content', () => {
    const xml = `<worksheet ${NS}><dimension ref="A1:XFD1048576"/><sheetData><row r="1">${cell('A1', 'h')}${cell('B1', 'k')}</row><row r="2">${cell('A2', '1')}${cell('B2', '2')}</row></sheetData></worksheet>`;
    const r = loadFileData('dim.xlsx', pkg(xml));
    expect(r.table.columns).toHaveLength(2);
    expect(r.table.rowCount).toBe(1);
  });

  it('refuses cells beyond the column limit instead of allocating for them', () => {
    const xml = sheet(`<row r="1">${cell('A1', 'h')}${cell('ZZ1', 'far')}</row>`);
    expect(code(() => loadFileData('wide.xlsx', pkg(xml)))).toBe('too-many-columns');
  });

  it('enforces row and cell limits', () => {
    const rows = Array.from({ length: 6 }, (_, i) => `<row r="${i + 1}">${cell('A' + (i + 1), 'v' + i)}</row>`).join('');
    const limits = { ...DEFAULT_LIMITS, maxRows: 3 };
    expect(code(() => loadFileData('rows.xlsx', pkg(sheet(rows)), {}, limits))).toBe('too-many-rows');
    expect(code(() => loadFileData('cells.xlsx', pkg(sheet(rows)), {}, { ...DEFAULT_LIMITS, maxCells: 3 }))).toBe('too-many-cells');
  });

  it('stops work that exceeds the time budget', () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `<row r="${i + 1}">${cell('A' + (i + 1), 'v')}</row>`).join('');
    expect(code(() => loadFileData('slow.xlsx', pkg(sheet(rows)), {}, { ...DEFAULT_LIMITS, maxParseMs: -1000 }))).toBe('timeout');
  });

  it('reports truncated and garbage archives as damaged, not as crashes', () => {
    const good = buildXlsx([{ name: 'S', rows: [['a'], ['1']] }]);
    expect(code(() => loadFileData('cut.xlsx', good.subarray(0, good.length - 40)))).toBe('xlsx-corrupt');
    const garbage = new Uint8Array(300).fill(0x41);
    garbage.set([0x50, 0x4b, 0x03, 0x04]);
    expect(code(() => loadFileData('junk.xlsx', garbage))).toBe('xlsx-corrupt');
  });

  it('refuses encrypted archive entries', () => {
    const good = buildXlsx([{ name: 'S', rows: [['a'], ['1']] }]);
    const patched = good.slice();
    const dv = new DataView(patched.buffer);
    for (let i = patched.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        const cd = dv.getUint32(i + 16, true);
        dv.setUint16(cd + 8, dv.getUint16(cd + 8, true) | 1, true);
        break;
      }
    }
    expect(code(() => loadFileData('enc.xlsx', patched))).toBe('xlsx-encrypted');
  });

  it('does not follow hyperlinks, external links or run macros: they only produce notices', () => {
    const extra = { 'xl/vbaProject.bin': strToU8('MACRO'), 'xl/externalLinks/externalLink1.xml': strToU8('<externalLink/>') };
    const r = loadFileData('m.xlsx', pkg(sheet(`<row r="1">${cell('A1', 'h')}</row><row r="2">${cell('A2', 'x')}</row>`), extra));
    expect(r.info.warnings.some((w) => /macros/.test(w))).toBe(true);
    expect(r.info.warnings.some((w) => /other workbooks/.test(w))).toBe(true);
  });

  it('decodes XML escapes and OOXML control-character escapes safely', () => {
    const r = loadFileData('esc.xlsx', pkg(sheet(`<row r="1">${cell('A1', 'h')}</row><row r="2">${cell('A2', 'a &amp; b &lt;c&gt; &#65; _x0041_ _x005F_x0041_')}</row>`)));
    expect(r.table.text(0, 0)).toBe('a & b <c> A A _x0041_');
  });
});
