import { computeAccounting, computeSummary } from './accounting';
import { Comparer, checkpoint } from './comparer';
import { assertRunnable, validateConfig } from './config';
import {
  NO_HOOKS,
  type Accounting,
  type ComparisonResult,
  type JobHooks,
  type ManualLink,
  type MatchConfig,
  type ResultRow,
  type Role,
  type TableData,
  UserFacingError,
} from './types';

export function tableCounts(a: TableData, b: TableData) {
  return {
    A: { rowCount: a.rowCount, skippedBlank: a.skippedBlank, aboveHeader: a.aboveHeader },
    B: { rowCount: b.rowCount, skippedBlank: b.skippedBlank, aboveHeader: b.aboveHeader },
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

function keyText(parts: readonly string[] | undefined): string {
  return (parts ?? []).join(' + ');
}

/**
 * Exact keyed comparison. Rows are paired by confirmed key columns, independent of row order.
 * Duplicate keys are never paired; blank keys are never matched.
 */
export async function compareTables(
  a: TableData,
  b: TableData,
  config: MatchConfig,
  hooks: JobHooks = NO_HOOKS,
): Promise<ComparisonResult> {
  const t0 = now();
  assertRunnable(config, { A: a.columns, B: b.columns });
  const cmp = new Comparer(a, b, config);
  const fieldLabels = config.fields.map((f) => f.label);

  hooks.onProgress?.({ phase: 'validating', done: 0, total: a.rowCount + b.rowCount });
  const ia = await cmp.buildKeyIndex('A', hooks);
  hooks.onProgress?.({ phase: 'validating', done: a.rowCount, total: a.rowCount + b.rowCount });
  const ib = await cmp.buildKeyIndex('B', hooks);

  const rows: ResultRow[] = [];
  let step = 0;
  const totalGroups = ia.groups.size + ib.groups.size;
  hooks.onProgress?.({ phase: 'matching', done: 0, total: totalGroups });

  for (const [ser, aIdxs] of ia.groups) {
    await checkpoint(hooks, step++, 2048);
    const bIdxs = ib.groups.get(ser);
    const keyA = cmp.rawKey('A', aIdxs[0]!);
    if (aIdxs.length > 1 || (bIdxs !== undefined && bIdxs.length > 1)) {
      rows.push(ambiguousRow(cmp, ser, aIdxs, bIdxs ?? []));
    } else if (bIdxs !== undefined) {
      const ai = aIdxs[0]!;
      const bi = bIdxs[0]!;
      const o = cmp.compareRows(ai, bi);
      const differing = fieldLabels.filter((_, i) => o.status[i] !== 's');
      rows.push({
        id: `p:${ser}`,
        category: o.matched ? 'matched' : 'different',
        provenance: 'exact',
        keyA,
        keyB: cmp.rawKey('B', bi),
        aIdx: [ai],
        bIdx: [bi],
        aRows: [a.rowNumber(ai)],
        bRows: [b.rowNumber(bi)],
        aVals: o.aVals,
        bVals: o.bVals,
        status: o.status,
        reasons: o.reasons,
        summary: o.matched
          ? config.fields.length === 0
            ? 'Paired by identifier; no values were selected to compare.'
            : `All ${plural(config.fields.length, 'compared value')} agree.`
          : `Differs in ${differing.join(', ')}.`,
      });
    } else {
      const ai = aIdxs[0]!;
      rows.push({
        id: `a:${ai}`,
        category: 'only-a',
        provenance: 'exact',
        side: 'A',
        keyA,
        aIdx: [ai],
        bIdx: [],
        aRows: [a.rowNumber(ai)],
        bRows: [],
        aVals: cmp.rawValues('A', ai),
        reasons: [`“${keyText(keyA)}” is in File A but no row in File B has this identifier.`],
        summary: 'Only in File A.',
      });
    }
  }
  for (const [ser, bIdxs] of ib.groups) {
    await checkpoint(hooks, step++, 2048);
    if (ia.groups.has(ser)) continue;
    if (bIdxs.length > 1) {
      rows.push(ambiguousRow(cmp, ser, [], bIdxs));
      continue;
    }
    const bi = bIdxs[0]!;
    const keyB = cmp.rawKey('B', bi);
    rows.push({
      id: `b:${bi}`,
      category: 'only-b',
      provenance: 'exact',
      side: 'B',
      keyB,
      aIdx: [],
      bIdx: [bi],
      aRows: [],
      bRows: [b.rowNumber(bi)],
      bVals: cmp.rawValues('B', bi),
      reasons: [`“${keyText(keyB)}” is in File B but no row in File A has this identifier.`],
      summary: 'Only in File B.',
    });
  }
  hooks.onProgress?.({ phase: 'preparing' });
  for (const inv of ia.invalid) {
    rows.push({
      id: `ia:${inv.idx}`,
      category: 'invalid',
      provenance: 'exact',
      side: 'A',
      keyA: cmp.rawKey('A', inv.idx),
      aIdx: [inv.idx],
      bIdx: [],
      aRows: [a.rowNumber(inv.idx)],
      bRows: [],
      aVals: cmp.rawValues('A', inv.idx),
      reasons: [`This row cannot be matched: ${inv.why}.`],
      summary: 'Invalid identifier in File A.',
    });
  }
  for (const inv of ib.invalid) {
    rows.push({
      id: `ib:${inv.idx}`,
      category: 'invalid',
      provenance: 'exact',
      side: 'B',
      keyB: cmp.rawKey('B', inv.idx),
      aIdx: [],
      bIdx: [inv.idx],
      aRows: [],
      bRows: [b.rowNumber(inv.idx)],
      bVals: cmp.rawValues('B', inv.idx),
      reasons: [`This row cannot be matched: ${inv.why}.`],
      summary: 'Invalid identifier in File B.',
    });
  }

  const accounting = computeAccounting(rows, tableCounts(a, b));
  const warnings = resultWarnings(config, a, b);
  return {
    config,
    rows,
    summary: computeSummary(rows),
    accounting,
    keyStats: { A: ia.stats, B: ib.stats },
    warnings,
    elapsedMs: now() - t0,
  };
}

function resultWarnings(config: MatchConfig, a: TableData, b: TableData): string[] {
  const warnings: string[] = [];
  for (const issue of validateConfig(config, { A: a.columns, B: b.columns })) {
    if (!issue.blocking) warnings.push(issue.message);
  }
  if (a.rowCount === 0) warnings.push('File A has no data rows.');
  if (b.rowCount === 0) warnings.push('File B has no data rows.');
  return warnings;
}

function ambiguousRow(cmp: Comparer, ser: string, aIdxs: number[], bIdxs: number[]): ResultRow {
  const keyA = aIdxs.length ? cmp.rawKey('A', aIdxs[0]!) : undefined;
  const keyB = bIdxs.length ? cmp.rawKey('B', bIdxs[0]!) : undefined;
  const shown = keyText(keyA ?? keyB);
  const where =
    aIdxs.length > 0 && bIdxs.length > 0
      ? `${plural(aIdxs.length, 'row')} in File A and ${plural(bIdxs.length, 'row')} in File B`
      : aIdxs.length > 0
        ? `${plural(aIdxs.length, 'row')} in File A (none in File B)`
        : `${plural(bIdxs.length, 'row')} in File B (none in File A)`;
  return {
    id: `g:${ser}`,
    category: 'ambiguous',
    provenance: 'exact',
    keyA,
    keyB,
    aIdx: aIdxs,
    bIdx: bIdxs,
    aRows: aIdxs.map((i) => cmp.a.rowNumber(i)),
    bRows: bIdxs.map((i) => cmp.b.rowNumber(i)),
    reasons: [
      `The identifier “${shown}” appears on ${where}. RowSignal does not guess which rows belong together. Add another identifier column (for example a product code) in the match rules to tell them apart.`,
    ],
    summary: `Duplicate identifier: ${where}.`,
  };
}

// ---------------------------------------------------------------------------------------------
// Manual links
// ---------------------------------------------------------------------------------------------

/**
 * Apply user-accepted links on top of an exact-match result. Transactional: if any link is invalid
 * (row not unmatched, used twice) nothing is applied and an error is thrown. Accepted links are
 * labelled `manual`, keep both original identifiers, and are re-compared on the selected values.
 */
export function applyManualLinks(
  base: ComparisonResult,
  links: readonly ManualLink[],
  a: TableData,
  b: TableData,
): ComparisonResult {
  const cmp = new Comparer(a, b, base.config);
  const onlyA = new Map<number, number>(); // aIdx → position in base.rows
  const onlyB = new Map<number, number>();
  base.rows.forEach((r, pos) => {
    if (r.category === 'only-a') onlyA.set(r.aIdx[0]!, pos);
    else if (r.category === 'only-b') onlyB.set(r.bIdx[0]!, pos);
  });
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  for (const l of links) {
    if (!onlyA.has(l.aIdx) || !onlyB.has(l.bIdx)) {
      throw new UserFacingError('link-invalid', 'A suggested link refers to a row that is no longer unmatched.');
    }
    if (usedA.has(l.aIdx) || usedB.has(l.bIdx)) {
      throw new UserFacingError('link-duplicate', 'A row can only be linked once.');
    }
    usedA.add(l.aIdx);
    usedB.add(l.bIdx);
  }

  const replaceAt = new Map<number, ResultRow>();
  const drop = new Set<number>();
  for (const l of links) {
    const o = cmp.compareRows(l.aIdx, l.bIdx);
    const fieldLabels = base.config.fields.map((f) => f.label);
    const differing = fieldLabels.filter((_, i) => o.status[i] !== 's');
    const keyA = cmp.rawKey('A', l.aIdx);
    const keyB = cmp.rawKey('B', l.bIdx);
    const row: ResultRow = {
      id: `m:${l.aIdx}:${l.bIdx}`,
      category: o.matched ? 'matched' : 'different',
      provenance: 'manual',
      keyA,
      keyB,
      aIdx: [l.aIdx],
      bIdx: [l.bIdx],
      aRows: [a.rowNumber(l.aIdx)],
      bRows: [b.rowNumber(l.bIdx)],
      aVals: o.aVals,
      bVals: o.bVals,
      status: o.status,
      reasons: [
        `Manually linked by you: “${keyText(keyA)}” in File A with “${keyText(keyB)}” in File B. The identifiers are not equal, so this is not an exact match.`,
        ...o.reasons,
      ],
      summary: o.matched ? 'Manually linked; the compared values agree.' : `Manually linked; differs in ${differing.join(', ')}.`,
    };
    replaceAt.set(onlyA.get(l.aIdx)!, row);
    drop.add(onlyB.get(l.bIdx)!);
  }
  const rows: ResultRow[] = [];
  base.rows.forEach((r, pos) => {
    if (drop.has(pos)) return;
    rows.push(replaceAt.get(pos) ?? r);
  });
  const accounting: Accounting = computeAccounting(rows, tableCounts(a, b));
  return { ...base, rows, summary: computeSummary(rows), accounting };
}

export function sideLabel(role: Role): string {
  return `File ${role}`;
}
