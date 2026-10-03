import type { Accounting, ResultRow, Role, SideAccounting, Summary } from './types';

export interface TableCounts {
  rowCount: number;
  skippedBlank: number;
  aboveHeader: number;
}

export function computeSummary(rows: readonly ResultRow[]): Summary {
  const s: Summary = {
    matched: 0,
    different: 0,
    pairs: 0,
    manualPairs: 0,
    onlyA: 0,
    onlyB: 0,
    ambiguousGroups: 0,
    ambiguousRowsA: 0,
    ambiguousRowsB: 0,
    invalidA: 0,
    invalidB: 0,
  };
  for (const r of rows) {
    switch (r.category) {
      case 'matched':
        s.matched++;
        break;
      case 'different':
        s.different++;
        break;
      case 'only-a':
        s.onlyA++;
        break;
      case 'only-b':
        s.onlyB++;
        break;
      case 'ambiguous':
        s.ambiguousGroups++;
        s.ambiguousRowsA += r.aIdx.length;
        s.ambiguousRowsB += r.bIdx.length;
        break;
      case 'invalid':
        if (r.side === 'A') s.invalidA++;
        else s.invalidB++;
        break;
    }
    if ((r.category === 'matched' || r.category === 'different') && r.provenance === 'manual') s.manualPairs++;
  }
  s.pairs = s.matched + s.different;
  return s;
}

/**
 * Every eligible source row must appear exactly once: in an exact pair, a manual pair, an
 * unmatched bucket, an ambiguous group or an invalid-key bucket. Also detects a row index being
 * used twice, which a sum alone would not reveal.
 */
export function computeAccounting(
  rows: readonly ResultRow[],
  counts: Record<Role, TableCounts>,
): Accounting {
  const build = (role: Role): SideAccounting => {
    const eligible = counts[role].rowCount;
    const seen = new Uint8Array(eligible);
    let duplicate = false;
    let pairedExact = 0;
    let pairedManual = 0;
    let only = 0;
    let ambiguousRows = 0;
    let invalid = 0;
    for (const r of rows) {
      const idxs = role === 'A' ? r.aIdx : r.bIdx;
      for (const i of idxs) {
        if (i < 0 || i >= eligible || seen[i]) duplicate = true;
        else seen[i] = 1;
      }
      switch (r.category) {
        case 'matched':
        case 'different':
          if (r.provenance === 'manual') pairedManual += idxs.length;
          else pairedExact += idxs.length;
          break;
        case 'only-a':
          if (role === 'A') only += idxs.length;
          break;
        case 'only-b':
          if (role === 'B') only += idxs.length;
          break;
        case 'ambiguous':
          ambiguousRows += idxs.length;
          break;
        case 'invalid':
          if (r.side === role) invalid += idxs.length;
          break;
      }
    }
    const total = pairedExact + pairedManual + only + ambiguousRows + invalid;
    return {
      eligible,
      pairedExact,
      pairedManual,
      only,
      ambiguousRows,
      invalid,
      total,
      balanced: total === eligible && !duplicate,
      skippedBlank: counts[role].skippedBlank,
      aboveHeader: counts[role].aboveHeader,
    };
  };
  const A = build('A');
  const B = build('B');
  return { A, B, balanced: A.balanced && B.balanced };
}
