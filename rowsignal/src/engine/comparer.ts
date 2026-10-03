import { serializeKey } from './config';
import { parseTolerance, canonicalKeyPart, canonicalize, compareCanon, type Canon, type FieldOutcome } from './values';
import type { Dec } from './decimal';
import {
  CancelledError,
  UserFacingError,
  type FieldRule,
  type JobHooks,
  type KeyStats,
  type MatchConfig,
  type Role,
  type TableData,
} from './types';

/** Cooperative checkpoint: lets the worker receive a cancel message and keeps the UI responsive. */
export async function checkpoint(hooks: JobHooks, i: number, every = 4096): Promise<void> {
  if (i % every !== 0) return;
  if (hooks.isCancelled()) throw new CancelledError();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (hooks.isCancelled()) throw new CancelledError();
}

export interface KeyIndex {
  /** Serialized key → data-row indices, in order of first appearance. */
  groups: Map<string, number[]>;
  invalid: { idx: number; why: string }[];
  stats: KeyStats;
}

export interface PairOutcome {
  matched: boolean;
  /** One char per field: s / d / u. */
  status: string;
  reasons: string[];
  aVals: string[];
  bVals: string[];
}

function columnIndex(table: TableData, id: string, role: Role, what: string): number {
  const i = table.columns.findIndex((c) => c.id === id);
  if (i < 0) throw new UserFacingError('column-missing', `The column chosen for “${what}” no longer exists in File ${role}.`);
  return i;
}

/**
 * Applies a confirmed configuration to two loaded tables. Resolves column ids once, then offers
 * key extraction and pairwise field comparison. Pure with respect to the tables.
 */
export class Comparer {
  readonly keyCols: Record<Role, number[]>;
  readonly fieldCols: Record<Role, number[]>;
  private readonly tolerances: (Dec | null)[];

  constructor(
    readonly a: TableData,
    readonly b: TableData,
    readonly config: MatchConfig,
  ) {
    this.keyCols = {
      A: config.keys.map((k) => columnIndex(a, k.aColumn, 'A', k.label)),
      B: config.keys.map((k) => columnIndex(b, k.bColumn, 'B', k.label)),
    };
    this.fieldCols = {
      A: config.fields.map((f) => columnIndex(a, f.aColumn, 'A', f.label)),
      B: config.fields.map((f) => columnIndex(b, f.bColumn, 'B', f.label)),
    };
    this.tolerances = config.fields.map((f) => (f.kind === 'number' ? parseTolerance(f.tolerance) : null));
  }

  table(role: Role): TableData {
    return role === 'A' ? this.a : this.b;
  }

  /** Raw key cell values as found in the file. */
  rawKey(role: Role, idx: number): string[] {
    const t = this.table(role);
    return this.keyCols[role].map((c) => t.text(idx, c));
  }

  /** Raw values of the compared fields as found in the file. */
  rawValues(role: Role, idx: number): string[] {
    const t = this.table(role);
    return this.fieldCols[role].map((c) => t.text(idx, c));
  }

  /** Normalised key parts for a row, or the reason it cannot be used as an identifier. */
  keyOf(role: Role, idx: number): { ok: true; parts: string[]; ser: string } | { ok: false; why: string } {
    const t = this.table(role);
    const parts: string[] = [];
    for (let k = 0; k < this.config.keys.length; k++) {
      const rule = this.config.keys[k]!;
      const col = this.keyCols[role][k]!;
      const r = canonicalKeyPart(t.text(idx, col), t.flags(idx, col), rule);
      if (!r.ok) return { ok: false, why: `${rule.label}: ${r.why}` };
      parts.push(r.v);
    }
    return { ok: true, parts, ser: serializeKey(parts) };
  }

  async buildKeyIndex(role: Role, hooks: JobHooks): Promise<KeyIndex> {
    const t = this.table(role);
    const groups = new Map<string, number[]>();
    const invalid: { idx: number; why: string }[] = [];
    for (let i = 0; i < t.rowCount; i++) {
      await checkpoint(hooks, i);
      const k = this.keyOf(role, i);
      if (!k.ok) {
        invalid.push({ idx: i, why: k.why });
        continue;
      }
      const g = groups.get(k.ser);
      if (g) g.push(i);
      else groups.set(k.ser, [i]);
    }
    let duplicateKeyRows = 0;
    let duplicateKeyGroups = 0;
    let uniqueKeys = 0;
    for (const g of groups.values()) {
      if (g.length > 1) {
        duplicateKeyRows += g.length;
        duplicateKeyGroups += 1;
      } else uniqueKeys += 1;
    }
    return {
      groups,
      invalid,
      stats: { rows: t.rowCount, blankKeys: invalid.length, duplicateKeyRows, duplicateKeyGroups, uniqueKeys },
    };
  }

  canonField(role: Role, fieldIndex: number, idx: number): Canon {
    const rule = this.config.fields[fieldIndex]!;
    const t = this.table(role);
    const col = this.fieldCols[role][fieldIndex]!;
    return canonicalize(t.text(idx, col), t.flags(idx, col), rule.kind, rule, this.config.formats[role]);
  }

  fieldOutcome(fieldIndex: number, ai: number, bi: number): FieldOutcome {
    const rule: FieldRule = this.config.fields[fieldIndex]!;
    const a = this.canonField('A', fieldIndex, ai);
    const b = this.canonField('B', fieldIndex, bi);
    const aRaw = this.a.text(ai, this.fieldCols.A[fieldIndex]!);
    const bRaw = this.b.text(bi, this.fieldCols.B[fieldIndex]!);
    return compareCanon(rule, a, b, aRaw, bRaw, this.tolerances[fieldIndex] ?? null);
  }

  /** Compare every selected field of one A row with one B row. A pair matches only if all agree. */
  compareRows(ai: number, bi: number): PairOutcome {
    let status = '';
    const reasons: string[] = [];
    let matched = true;
    for (let f = 0; f < this.config.fields.length; f++) {
      const o = this.fieldOutcome(f, ai, bi);
      status += o.status;
      if (o.status !== 's') {
        matched = false;
        if (o.reason) reasons.push(o.reason);
      }
    }
    return { matched, status, reasons, aVals: this.rawValues('A', ai), bVals: this.rawValues('B', bi) };
  }
}
