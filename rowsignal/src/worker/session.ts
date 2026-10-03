/**
 * EngineSession: the stateful core behind the worker. It owns the parsed tables so large arrays
 * never need to live on (or be copied to) the UI thread. It is plain TypeScript with no worker
 * APIs, which is what lets the tests drive it directly.
 */
import { Comparer } from '../engine/comparer';
import { applyManualLinks, compareTables } from '../engine/compare';
import { analyzeConfig, detectDateOrder, detectNumberFormat, inferKind, profileColumn, suggestMapping, type Analysis, type DateOrderGuess, type MappingSuggestion } from '../engine/diagnostics';
import { assertRunnable } from '../engine/config';
import { suggestLinks, type ApproxConfig, type SuggestionResult } from '../engine/suggest';
import { describeFieldRule, describeKeyRule } from '../engine/values';
import {
  CELL_BOOL,
  CELL_DATE,
  CELL_ERROR,
  CELL_FORMULA,
  CELL_FORMULA_NOCACHE,
  CELL_NUMBER,
  NO_HOOKS,
  UserFacingError,
  type Category,
  type ComparisonResult,
  type FieldKind,
  type FieldStatus,
  type JobHooks,
  type ManualLink,
  type MatchConfig,
  type Role,
} from '../engine/types';
import { buildExport, type Annotation, type ExportOptions } from '../export/build';
import { loadFileData, type FileInfo, type LoadedFileData, type ParseOptions } from '../import/loadFile';
import { DEFAULT_LIMITS, type Limits } from '../import/limits';

export interface ColumnHint {
  columnId: string;
  kind: FieldKind;
  nonBlank: number;
  uniqueness: number;
  numericStored: number;
  dateGuess: DateOrderGuess | null;
  numberFormat: { decimal: '.' | ','; thousands: 'none' | ',' | '.' | ' ' } | null;
}

export interface MappingHints {
  mapping: MappingSuggestion;
  columns: Record<Role, ColumnHint[]>;
}

export interface CellDetail {
  label: string;
  letter: string;
  raw: string;
  note: string | null;
  hidden: boolean;
}

export interface RecordDetail {
  side: Role;
  rowNumber: number;
  sheet: string | null;
  cells: CellDetail[];
}

export interface FieldDetail {
  label: string;
  kind: FieldKind;
  rule: string;
  aRaw: string | null;
  bRaw: string | null;
  aShown: string | null;
  bShown: string | null;
  status: FieldStatus | null;
  reason: string | null;
}

export interface KeyDetail {
  label: string;
  rule: string;
  aRaw: string | null;
  bRaw: string | null;
}

export interface RowDetail {
  id: string;
  category: Category;
  provenance: 'exact' | 'manual';
  summary: string;
  reasons: string[];
  keys: KeyDetail[];
  fields: FieldDetail[];
  records: { A: RecordDetail[]; B: RecordDetail[] };
}

interface Slot {
  name: string;
  bytes: Uint8Array;
  options: ParseOptions;
  data: LoadedFileData;
}

const CELL_CLIP = 2000;

function cellNote(flags: number): string | null {
  const notes: string[] = [];
  if (flags & CELL_NUMBER) notes.push('stored as a number');
  if (flags & CELL_DATE) notes.push('stored as a date');
  if (flags & CELL_BOOL) notes.push('yes/no value');
  if (flags & CELL_ERROR) notes.push('error value');
  if (flags & CELL_FORMULA) notes.push('formula — saved result shown');
  if (flags & CELL_FORMULA_NOCACHE) notes.push('formula with no saved result');
  return notes.length ? notes.join(', ') : null;
}

export class EngineSession {
  private slots: Record<Role, Slot | null> = { A: null, B: null };
  private base: ComparisonResult | null = null;
  private current: ComparisonResult | null = null;
  private cmp: Comparer | null = null;
  private links: ManualLink[] = [];

  constructor(private readonly limits: Limits = DEFAULT_LIMITS) {}

  private invalidate(): void {
    this.base = null;
    this.current = null;
    this.cmp = null;
    this.links = [];
  }

  loadFile(role: Role, name: string, bytes: Uint8Array, options: ParseOptions = {}): FileInfo {
    const data = loadFileData(name, bytes, options, this.limits);
    this.slots[role] = { name, bytes, options: { ...options }, data };
    this.invalidate();
    return data.info;
  }

  /** Re-interpret a loaded file (sheet, header row, delimiter, encoding) without re-sending bytes. */
  reparse(role: Role, options: ParseOptions): FileInfo {
    const slot = this.slots[role];
    if (!slot) throw new UserFacingError('no-file', `File ${role} is not loaded.`);
    const prev = slot.options;
    const sameSource =
      (options.sheet ?? slot.data.info.sheet ?? undefined) === (slot.data.info.sheet ?? undefined) &&
      (options.delimiter ?? 'auto') === (prev.delimiter ?? 'auto') &&
      (options.encoding ?? 'auto') === (prev.encoding ?? 'auto');
    const data = loadFileData(slot.name, slot.bytes, options, this.limits, sameSource ? { workbook: slot.data.workbook, grid: slot.data.grid } : slot.data.workbook ? { workbook: slot.data.workbook, grid: null } : undefined);
    this.slots[role] = { ...slot, options: { ...options }, data };
    this.invalidate();
    return data.info;
  }

  removeFile(role: Role): void {
    this.slots[role] = null;
    this.invalidate();
  }

  hasFiles(): boolean {
    return this.slots.A !== null && this.slots.B !== null;
  }

  private tables() {
    const a = this.slots.A?.data.table;
    const b = this.slots.B?.data.table;
    if (!a || !b) throw new UserFacingError('no-file', 'Add both files first.');
    return { a, b };
  }

  hints(): MappingHints {
    const { a, b } = this.tables();
    const mk = (t: typeof a): ColumnHint[] =>
      t.columns.map((c) => {
        const p = profileColumn(t, c.index);
        const kind = inferKind(p);
        return {
          columnId: c.id,
          kind,
          nonBlank: p.nonBlank,
          uniqueness: p.nonBlank === 0 ? 0 : p.unique / p.nonBlank,
          numericStored: p.typedNumber,
          dateGuess: p.nonBlank > 0 && p.dateLike / p.nonBlank >= 0.5 ? detectDateOrder(t, c.index) : null,
          numberFormat: kind === 'number' ? detectNumberFormat(t, c.index) : null,
        };
      });
    return { mapping: suggestMapping(a, b), columns: { A: mk(a), B: mk(b) } };
  }

  async analyze(config: MatchConfig, hooks: JobHooks = NO_HOOKS): Promise<Analysis> {
    const { a, b } = this.tables();
    return analyzeConfig(a, b, config, hooks);
  }

  async compare(config: MatchConfig, hooks: JobHooks = NO_HOOKS): Promise<ComparisonResult> {
    const { a, b } = this.tables();
    const result = await compareTables(a, b, config, hooks);
    if (!result.accounting.balanced) {
      throw new UserFacingError('accounting', 'An internal consistency check failed: some rows were not accounted for exactly once. The results were discarded. Please report this using the diagnostics download.');
    }
    this.base = result;
    this.current = result;
    this.links = [];
    this.cmp = new Comparer(a, b, config);
    return result;
  }

  async suggest(approx: ApproxConfig, hooks: JobHooks = NO_HOOKS): Promise<SuggestionResult> {
    if (!this.current || !this.cmp) throw new UserFacingError('no-result', 'Run the comparison first.');
    return suggestLinks(this.cmp, this.current, approx, hooks);
  }

  /** Replace the manual links (transactional). Passing an empty list restores the exact result. */
  setLinks(links: readonly ManualLink[]): ComparisonResult {
    if (!this.base) throw new UserFacingError('no-result', 'Run the comparison first.');
    const { a, b } = this.tables();
    const next = applyManualLinks(this.base, links, a, b);
    if (!next.accounting.balanced) throw new UserFacingError('accounting', 'Linking rows would leave the row accounting unbalanced, so nothing was changed.');
    this.current = next;
    this.links = [...links];
    return next;
  }

  currentLinks(): ManualLink[] {
    return [...this.links];
  }

  detail(rowId: string): RowDetail {
    if (!this.current || !this.cmp) throw new UserFacingError('no-result', 'Run the comparison first.');
    const row = this.current.rows.find((r) => r.id === rowId);
    if (!row) throw new UserFacingError('no-row', 'That result row is no longer available.');
    const cmp = this.cmp;
    const config = this.current.config;
    const record = (side: Role, idx: number): RecordDetail => {
      const t = cmp.table(side);
      return {
        side,
        rowNumber: t.rowNumber(idx),
        sheet: t.sheetName,
        cells: t.columns.map((c) => ({
          label: c.label,
          letter: c.letter,
          raw: t.text(idx, c.index).slice(0, CELL_CLIP),
          note: cellNote(t.flags(idx, c.index)),
          hidden: c.hidden,
        })),
      };
    };
    const aIdx = row.aIdx[0];
    const bIdx = row.bIdx[0];
    const single = row.category !== 'ambiguous';
    const keys: KeyDetail[] = config.keys.map((k, i) => ({
      label: k.label,
      rule: describeKeyRule(k),
      aRaw: single && aIdx !== undefined ? cmp.table('A').text(aIdx, cmp.keyCols.A[i]!) : null,
      bRaw: single && bIdx !== undefined ? cmp.table('B').text(bIdx, cmp.keyCols.B[i]!) : null,
    }));
    const fields: FieldDetail[] = config.fields.map((f, i) => {
      const hasA = single && aIdx !== undefined;
      const hasB = single && bIdx !== undefined;
      const both = hasA && hasB && (row.category === 'matched' || row.category === 'different');
      const outcome = both ? cmp.fieldOutcome(i, aIdx!, bIdx!) : null;
      const shown = (role: Role, idx: number) => {
        const c = cmp.canonField(role, i, idx);
        return c.t === 'blank' ? '(blank)' : c.t === 'bad' ? `(unreadable) ${c.why}` : c.v;
      };
      return {
        label: f.label,
        kind: f.kind,
        rule: describeFieldRule(f, config.formats.A, config.formats.B),
        aRaw: hasA ? cmp.table('A').text(aIdx!, cmp.fieldCols.A[i]!) : null,
        bRaw: hasB ? cmp.table('B').text(bIdx!, cmp.fieldCols.B[i]!) : null,
        aShown: hasA ? shown('A', aIdx!) : null,
        bShown: hasB ? shown('B', bIdx!) : null,
        status: outcome ? outcome.status : null,
        reason: outcome?.reason ?? null,
      };
    });
    return {
      id: row.id,
      category: row.category,
      provenance: row.provenance,
      summary: row.summary,
      reasons: row.reasons,
      keys,
      fields,
      records: { A: row.aIdx.map((i) => record('A', i)), B: row.bIdx.map((i) => record('B', i)) },
    };
  }

  exportResult(options: ExportOptions, annotations: Record<string, Annotation>) {
    if (!this.current || !this.cmp) throw new UserFacingError('no-result', 'Run the comparison first.');
    return buildExport(this.current, this.cmp, options, annotations);
  }

  /** The bytes of a loaded file, for saving a project. */
  sourceBytes(role: Role): Uint8Array | null {
    return this.slots[role]?.bytes ?? null;
  }

  assertRunnable(config: MatchConfig): void {
    const { a, b } = this.tables();
    assertRunnable(config, { A: a.columns, B: b.columns });
  }
}
