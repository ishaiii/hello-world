/**
 * Portable (recipe) form of a match configuration. Columns are referenced by header text, not by
 * position, so a recipe still works when a new export has columns in a different order — and a
 * renamed, missing or duplicated header is surfaced for the user to resolve instead of silently
 * remapping a neighbouring column.
 */
import { defaultFormat } from './config';
import type { ColumnInfo, FieldKind, FileFormat, MatchConfig, Role } from './types';

export interface ColumnRef {
  header: string;
  /** Which of the same-named columns (1-based). */
  occurrence: number;
  /** How many columns had this header when the recipe was saved. */
  of: number;
}

export interface PortableKey {
  label: string;
  a: ColumnRef;
  b: ColumnRef;
  trim: boolean;
  caseInsensitive: boolean;
}

export interface PortableField {
  label: string;
  kind: FieldKind;
  a: ColumnRef;
  b: ColumnRef;
  trim: boolean;
  caseInsensitive: boolean;
  emptyAsNull: boolean;
  tolerance: string;
}

export interface PortableConfig {
  keys: PortableKey[];
  fields: PortableField[];
  formats: Record<Role, FileFormat>;
}

function refFor(cols: readonly ColumnInfo[], id: string): ColumnRef {
  const c = cols.find((x) => x.id === id);
  if (!c) return { header: '', occurrence: 1, of: 1 };
  const of = cols.filter((x) => x.header === c.header).length;
  return { header: c.header, occurrence: c.occurrence, of };
}

export function toPortable(config: MatchConfig, colsA: readonly ColumnInfo[], colsB: readonly ColumnInfo[]): PortableConfig {
  return {
    keys: config.keys.map((k) => ({
      label: k.label,
      a: refFor(colsA, k.aColumn),
      b: refFor(colsB, k.bColumn),
      trim: k.trim,
      caseInsensitive: k.caseInsensitive,
    })),
    fields: config.fields.map((f) => ({
      label: f.label,
      kind: f.kind,
      a: refFor(colsA, f.aColumn),
      b: refFor(colsB, f.bColumn),
      trim: f.trim,
      caseInsensitive: f.caseInsensitive,
      emptyAsNull: f.emptyAsNull,
      tolerance: f.tolerance,
    })),
    formats: { A: { ...config.formats.A }, B: { ...config.formats.B } },
  };
}

export type SchemaIssueKind = 'missing' | 'renamed' | 'duplicate' | 'moved';

export interface SchemaIssue {
  kind: SchemaIssueKind;
  role: Role;
  /** The rule this affects, `k1`, `f2`, … */
  ruleId: string;
  ruleLabel: string;
  wanted: string;
  /** Columns the user could choose from (ids); never applied automatically. */
  candidates: string[];
  message: string;
  /** Blocking issues leave the column unset until the user chooses. */
  blocking: boolean;
}

export interface SchemaCheck {
  config: MatchConfig;
  issues: SchemaIssue[];
  /** Headers present in the new file that the recipe does not use. */
  newColumns: Record<Role, string[]>;
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Resolve a portable config against the columns of freshly loaded files.
 * Exact header matches resolve automatically. A near match (different case/spacing), a missing
 * header, or an ambiguous duplicate leaves the column unset and explains why.
 */
export function resolvePortable(portable: PortableConfig, colsA: readonly ColumnInfo[], colsB: readonly ColumnInfo[]): SchemaCheck {
  const issues: SchemaIssue[] = [];
  const used: Record<Role, Set<string>> = { A: new Set(), B: new Set() };

  const resolve = (role: Role, ref: ColumnRef, ruleId: string, ruleLabel: string): string => {
    const cols = role === 'A' ? colsA : colsB;
    const file = `File ${role}`;
    const exact = cols.filter((c) => c.header === ref.header && ref.header !== '');
    if (exact.length > 0) {
      if (exact.length > 1 && exact.length !== ref.of) {
        issues.push({
          kind: 'duplicate',
          role,
          ruleId,
          ruleLabel,
          wanted: ref.header,
          candidates: exact.map((c) => c.id),
          blocking: true,
          message: `${file} now has ${exact.length} columns headed “${ref.header}” (the recipe was saved with ${ref.of}). Choose which one to use for “${ruleLabel}”.`,
        });
        return '';
      }
      const pick = exact[Math.min(ref.occurrence, exact.length) - 1]!;
      used[role].add(pick.id);
      return pick.id;
    }
    const near = cols.filter((c) => c.header !== '' && squash(c.header) === squash(ref.header));
    if (near.length > 0) {
      issues.push({
        kind: 'renamed',
        role,
        ruleId,
        ruleLabel,
        wanted: ref.header,
        candidates: near.map((c) => c.id),
        blocking: true,
        message: `${file} has no column headed “${ref.header}”, but has “${near[0]!.header}”. Confirm that it is the same column for “${ruleLabel}”.`,
      });
      return '';
    }
    issues.push({
      kind: 'missing',
      role,
      ruleId,
      ruleLabel,
      wanted: ref.header,
      candidates: [],
      blocking: true,
      message: `${file} has no column headed “${ref.header}” (used for “${ruleLabel}”). Choose the column that now holds this information.`,
    });
    return '';
  };

  const config: MatchConfig = {
    version: 1,
    keys: portable.keys.map((k, i) => {
      const id = `k${i + 1}`;
      return { id, label: k.label, aColumn: resolve('A', k.a, id, k.label), bColumn: resolve('B', k.b, id, k.label), trim: k.trim, caseInsensitive: k.caseInsensitive };
    }),
    fields: portable.fields.map((f, i) => {
      const id = `f${i + 1}`;
      return {
        id,
        label: f.label,
        kind: f.kind,
        aColumn: resolve('A', f.a, id, f.label),
        bColumn: resolve('B', f.b, id, f.label),
        trim: f.trim,
        caseInsensitive: f.caseInsensitive,
        emptyAsNull: f.emptyAsNull,
        tolerance: f.tolerance,
      };
    }),
    formats: { A: { ...defaultFormat(), ...portable.formats.A }, B: { ...defaultFormat(), ...portable.formats.B } },
  };

  const newColumns: Record<Role, string[]> = {
    A: colsA.filter((c) => !used.A.has(c.id) && c.header !== '').map((c) => c.label),
    B: colsB.filter((c) => !used.B.has(c.id) && c.header !== '').map((c) => c.label),
  };
  return { config, issues, newColumns };
}
