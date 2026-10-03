import { parseTolerance } from './values';
import {
  UserFacingError,
  type ColumnInfo,
  type FieldKind,
  type FieldRule,
  type FileFormat,
  type KeyRule,
  type MatchConfig,
  type Role,
} from './types';

/** Collision-safe compound key: every component is length-prefixed, so no value can imitate a separator. */
export function serializeKey(parts: readonly string[]): string {
  let out = '';
  for (const p of parts) out += p.length + ':' + p;
  return out;
}

export function defaultFormat(): FileFormat {
  return { decimal: '.', thousands: ',', currency: false, dateOrder: null };
}

export function emptyConfig(): MatchConfig {
  return { version: 1, keys: [], fields: [], formats: { A: defaultFormat(), B: defaultFormat() } };
}

export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  let n = existing.length + 1;
  const used = new Set(existing.map((e) => e.id));
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function newKeyRule(existing: readonly KeyRule[], label: string, aColumn: string, bColumn: string): KeyRule {
  return { id: nextId('k', existing), label, aColumn, bColumn, trim: false, caseInsensitive: false };
}

/** Whitespace never carries meaning in numbers, dates or yes/no values, so trimming starts on there only. */
export function newFieldRule(existing: readonly FieldRule[], label: string, kind: FieldKind, aColumn: string, bColumn: string): FieldRule {
  return {
    id: nextId('f', existing),
    label,
    kind,
    aColumn,
    bColumn,
    trim: kind === 'number' || kind === 'date' || kind === 'boolean',
    caseInsensitive: false,
    emptyAsNull: false,
    tolerance: '0',
  };
}

export interface ConfigIssue {
  code:
    | 'no-key'
    | 'key-column-missing'
    | 'field-column-missing'
    | 'duplicate-key-column'
    | 'bad-tolerance'
    | 'date-format-missing'
    | 'no-fields';
  message: string;
  /** Rule id the issue belongs to, or a role for per-file settings. */
  target?: string;
  /** Blocking issues prevent a comparison from running. */
  blocking: boolean;
}

const colExists = (cols: readonly ColumnInfo[], id: string) => cols.some((c) => c.id === id);

/** Structural validation only (no data scans). Returns every problem so the UI can explain each one. */
export function validateConfig(config: MatchConfig, cols: Record<Role, readonly ColumnInfo[]>): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (config.keys.length === 0) {
    issues.push({ code: 'no-key', blocking: true, message: 'Choose at least one pair of columns that identifies the same record in both files.' });
  }
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  for (const k of config.keys) {
    if (!k.aColumn || !colExists(cols.A, k.aColumn) || !k.bColumn || !colExists(cols.B, k.bColumn)) {
      issues.push({ code: 'key-column-missing', blocking: true, target: k.id, message: `Choose a column from each file for the identifier “${k.label}”.` });
      continue;
    }
    if (usedA.has(k.aColumn) || usedB.has(k.bColumn)) {
      issues.push({ code: 'duplicate-key-column', blocking: true, target: k.id, message: `A column can only be used once as an identifier (“${k.label}”).` });
    }
    usedA.add(k.aColumn);
    usedB.add(k.bColumn);
  }
  for (const f of config.fields) {
    if (!f.aColumn || !colExists(cols.A, f.aColumn) || !f.bColumn || !colExists(cols.B, f.bColumn)) {
      issues.push({ code: 'field-column-missing', blocking: true, target: f.id, message: `Choose a column from each file for “${f.label}”.` });
    }
    if (f.kind === 'number' && parseTolerance(f.tolerance) === null) {
      issues.push({ code: 'bad-tolerance', blocking: true, target: f.id, message: `“${f.label}”: the allowed difference must be a number that is zero or greater.` });
    }
  }
  if (config.fields.length === 0) {
    issues.push({
      code: 'no-fields',
      blocking: false,
      message: 'No values are selected to compare, so every paired record will count as matched. Add fields if you also want to find changed values.',
    });
  }
  return issues;
}

/** Throw a user-facing error when blocking issues exist. */
export function assertRunnable(config: MatchConfig, cols: Record<Role, readonly ColumnInfo[]>): void {
  const blocking = validateConfig(config, cols).filter((i) => i.blocking);
  if (blocking.length > 0) throw new UserFacingError('config-invalid', blocking[0]!.message);
}

export function cloneConfig(config: MatchConfig): MatchConfig {
  return JSON.parse(JSON.stringify(config)) as MatchConfig;
}

/** Stable text of the settings that affect results, used to detect stale results. */
export function configSignature(config: MatchConfig): string {
  return JSON.stringify(config);
}
