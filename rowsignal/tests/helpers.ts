import { loadFileData, type ParseOptions } from '../src/import/loadFile';
import { compareTables } from '../src/engine/compare';
import type { ComparisonResult, MatchConfig, ResultRow } from '../src/engine/types';

export const enc = (s: string) => new TextEncoder().encode(s);

export function loadCsv(text: string, name = 'file.csv', options: ParseOptions = {}) {
  return loadFileData(name, enc(text), options);
}

export async function runCsv(a: string, b: string, config: MatchConfig): Promise<ComparisonResult> {
  return compareTables(loadCsv(a).table, loadCsv(b).table, config);
}

export function keysOf(rows: ResultRow[], category: ResultRow['category']): string[] {
  return rows.filter((r) => r.category === category).map((r) => (r.keyA ?? r.keyB ?? []).join('+')).sort();
}

import { defaultFormat, emptyConfig } from '../src/engine/config';
import type { FieldRule, FileFormat, KeyRule } from '../src/engine/types';

export function cfg(opts: {
  keys?: Array<Partial<KeyRule> & { aColumn: string; bColumn?: string }>;
  fields?: Array<Partial<FieldRule> & { aColumn: string; bColumn?: string }>;
  fmtA?: Partial<FileFormat>;
  fmtB?: Partial<FileFormat>;
}): MatchConfig {
  const c = emptyConfig();
  c.keys = (opts.keys ?? [{ aColumn: 'c0' }]).map((k, i) => ({
    id: `k${i + 1}`,
    label: `Key ${i + 1}`,
    bColumn: k.aColumn,
    trim: false,
    caseInsensitive: false,
    ...k,
  }));
  c.fields = (opts.fields ?? []).map((f, i) => ({
    id: `f${i + 1}`,
    label: `Field ${i + 1}`,
    kind: 'text' as const,
    bColumn: f.aColumn,
    trim: false,
    caseInsensitive: false,
    emptyAsNull: false,
    tolerance: '0',
    ...f,
  }));
  c.formats = { A: { ...defaultFormat(), ...opts.fmtA }, B: { ...defaultFormat(), ...opts.fmtB } };
  return c;
}

export function csv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}
