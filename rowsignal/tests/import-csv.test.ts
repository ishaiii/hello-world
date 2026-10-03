import { describe, expect, it } from 'vitest';
import { loadFileData } from '../src/import/loadFile';
import { DEFAULT_LIMITS } from '../src/import/limits';
import { UserFacingError } from '../src/engine/types';
import { enc, loadCsv } from './helpers';

const grid = (text: string, opts = {}) => {
  const t = loadCsv(text, 'f.csv', opts).table;
  return Array.from({ length: t.rowCount }, (_, r) => t.columns.map((_c, c) => t.text(r, c)));
};

describe('CSV parsing', () => {
  it('handles quoted delimiters, escaped quotes and embedded newlines', () => {
    const text = 'name,note,n\r\n"Smith, Jo","said ""hi""",1\r\n"multi\nline","a,b",2\r\n';
    expect(grid(text)).toEqual([
      ['Smith, Jo', 'said "hi"', '1'],
      ['multi\nline', 'a,b', '2'],
    ]);
  });

  it('numbers records the way a spreadsheet shows rows, even with multiline fields', () => {
    const t = loadCsv('h\n"a\nb"\nnext\n').table;
    expect([t.rowNumber(0), t.rowNumber(1)]).toEqual([2, 3]);
  });

  it('accepts CRLF, LF and lone CR line endings', () => {
    for (const nl of ['\r\n', '\n', '\r']) expect(grid(`a,b${nl}1,2${nl}3,4${nl}`)).toEqual([['1', '2'], ['3', '4']]);
  });

  it('skips blank rows but keeps real row numbers and reports the count', () => {
    const r = loadCsv('a,b\n1,2\n\n\n3,4\n,\n5,6\n');
    expect(r.table.rowCount).toBe(3);
    expect([0, 1, 2].map((i) => r.table.rowNumber(i))).toEqual([2, 5, 7]);
    expect(r.info.skippedBlank).toBe(3);
  });

  it('removes a UTF-8 byte-order mark so the first header is clean', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('id,name\n1,a\n')]);
    const r = loadFileData('b.csv', bytes);
    expect(r.table.columns[0]!.header).toBe('id');
    expect(r.info.encoding).toBe('utf-8');
  });

  it('preserves non-Latin text', () => {
    const text = 'नाम,city\nराम,東京\nZoë,Köln\n';
    expect(grid(text)).toEqual([['राम', '東京'], ['Zoë', 'Köln']]);
  });

  it('falls back to Windows-1252 with a note when bytes are not valid UTF-8, and honours an override', () => {
    const latin1 = new Uint8Array([...enc('name\n'), 0x4a, 0x6f, 0x73, 0xe9, 0x0a]); // "José" in Windows-1252
    const auto = loadFileData('l.csv', latin1);
    expect(auto.info.encoding).toBe('windows-1252');
    expect(auto.info.encodingNote).toMatch(/not valid UTF-8/);
    expect(auto.table.text(0, 0)).toBe('José');
    const forced = loadFileData('l.csv', latin1, { encoding: 'windows-1250' });
    expect(forced.info.encoding).toBe('windows-1250');
  });

  it('reads UTF-16 with and without a byte-order mark', () => {
    const text = 'id,name\n1,Zoë\n';
    const le = new Uint8Array(2 + text.length * 2);
    le.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) {
      le[2 + i * 2] = text.charCodeAt(i) & 0xff;
      le[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    expect(loadFileData('u.csv', le).table.text(0, 1)).toBe('Zoë');
    expect(loadFileData('u.csv', le.subarray(2)).table.text(0, 1)).toBe('Zoë');
  });

  it('detects comma, semicolon and tab delimiters, and a manual override wins', () => {
    expect(loadCsv('a;b;c\n1,5;2;3\n').info.delimiter).toBe(';');
    expect(loadCsv('a\tb\tc\n1\t2\t3\n').info.delimiter).toBe('\t');
    expect(loadCsv('a,b,c\n1,2,3\n').info.delimiter).toBe(',');
    expect(grid('a;b\n1,5;2\n')).toEqual([['1,5', '2']]);
    expect(loadCsv('a;b\n1;2\n', 'f.csv', { delimiter: ',' }).table.columns).toHaveLength(1);
  });

  it('is not fooled by a delimiter that only appears inside quotes', () => {
    const r = loadCsv('name,note\n"a;b;c;d","x;y;z"\n"e;f;g","h;i;j"\n');
    expect(r.info.delimiter).toBe(',');
    expect(r.table.columns).toHaveLength(2);
  });

  it("honours Excel's sep= hint line and does not count it as a row", () => {
    const r = loadCsv('sep=;\na;b\n1;2\n');
    expect(r.info.delimiter).toBe(';');
    expect(r.table.rowNumber(0)).toBe(2);
    expect(r.table.columns.map((c) => c.header)).toEqual(['a', 'b']);
  });

  it('supports files without a header and with a header on a later row', () => {
    const none = loadCsv('1,2\n3,4\n', 'f.csv', { headerRow: null });
    expect(none.table.rowCount).toBe(2);
    expect(none.table.columns.map((c) => c.label)).toEqual(['Column A', 'Column B']);
    const later = loadCsv('Report,\n,\nid,qty\n1,2\n', 'f.csv', { headerRow: 3 });
    expect(later.table.columns.map((c) => c.header)).toEqual(['id', 'qty']);
    expect(later.info.aboveHeader).toBe(1);
  });

  it('gives duplicate headers stable ids and visible disambiguation', () => {
    const r = loadCsv('Qty,Name,Qty\n1,a,2\n');
    expect(r.table.columns.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
    expect(r.table.columns.map((c) => c.label)).toEqual(['Qty (column A)', 'Name', 'Qty (column C)']);
    expect(r.table.columns.map((c) => c.occurrence)).toEqual([1, 1, 2]);
  });

  it('drops trailing empty columns and pads ragged rows', () => {
    const r = loadCsv('a,b,,\n1,2\n3,4,5\n');
    expect(r.table.columns).toHaveLength(3);
    expect(r.table.text(0, 2)).toBe('');
  });

  it('warns about unbalanced quotes instead of silently mangling', () => {
    const r = loadCsv('a,b\n"oops,1\n2,3\n');
    expect(r.info.warnings.some((w) => /quoting problem/.test(w))).toBe(true);
  });

  it('keeps formula-looking text as plain text and does nothing with it', () => {
    expect(grid('a\n=1+1\n@SUM(A1)\n')).toEqual([['=1+1'], ['@SUM(A1)']]);
  });
});

describe('CSV limits and malformed input', () => {
  const tiny = { ...DEFAULT_LIMITS, maxRows: 5, maxCols: 3, maxCells: 12 };
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as UserFacingError).code;
    }
    return 'none';
  };

  it('enforces row, column and cell limits with explanations', () => {
    expect(code(() => loadFileData('f.csv', enc('a\n1\n2\n3\n4\n5\n6\n7\n'), {}, tiny))).toBe('too-many-rows');
    expect(code(() => loadFileData('f.csv', enc('a,b,c,d\n1,2,3,4\n'), {}, tiny))).toBe('too-many-columns');
    expect(code(() => loadFileData('f.csv', enc('a,b,c\n1,2,3\n4,5,6\n7,8,9\n10,11,12\n'), {}, tiny))).toBe('too-many-cells');
  });

  it('rejects empty files and files with no data', () => {
    expect(code(() => loadFileData('f.csv', new Uint8Array(0)))).toBe('empty-file');
    expect(code(() => loadFileData('f.csv', enc('\n\n,\n')))).toBe('no-data');
  });

  it('refuses binary content that is not text', () => {
    expect(code(() => loadFileData('f.csv', new Uint8Array([1, 0, 2, 0, 0, 0, 7, 8, 0, 0, 9, 9, 0, 1])))).not.toBe('none');
    expect(code(() => loadFileData('f.csv', new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0])))).toBe('csv-binary');
  });

  it('rejects renamed PDFs and images by content', () => {
    expect(code(() => loadFileData('f.csv', enc('%PDF-1.7\n...')))).toBe('unsupported-type');
    expect(code(() => loadFileData('f.csv', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])))).toBe('unsupported-type');
  });
});
