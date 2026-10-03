/**
 * Approximate-match suggestions for rows that exact matching left unpaired.
 *
 * Method (documented in the in-app methodology page): each chosen value is compared with a
 * character-bigram Dice similarity (text), exact agreement (dates, yes/no) or relative closeness
 * (numbers); the pair score is the mean. The score is a similarity between 0 and 1 — NOT the
 * probability that a pair is correct. Candidate pairs come from a character-trigram index so the
 * work is not quadratic, and are capped by pairs examined and by elapsed time; truncation is
 * reported. Suggestions are one-to-one (a row is never offered twice) and never change a result
 * until the user accepts one.
 */
import { Comparer, checkpoint } from './comparer';
import { decCompare, decSub, decAbs, type Dec } from './decimal';
import { CancelledError, NO_HOOKS, type ComparisonResult, type JobHooks, type ResultRow } from './types';

export interface ApproxConfig {
  /** `k:<keyRuleId>` or `f:<fieldRuleId>`. */
  refs: string[];
  /** Minimum similarity (0–1) for a suggestion to be shown. */
  threshold: number;
}

export interface SuggestionPart {
  label: string;
  score: number;
}

export interface Suggestion {
  id: string;
  aIdx: number;
  bIdx: number;
  score: number;
  parts: SuggestionPart[];
}

export interface SuggestionResult {
  suggestions: Suggestion[];
  truncated: boolean;
  truncatedReasons: string[];
  examinedPairs: number;
  eligibleA: number;
  eligibleB: number;
}

export interface SuggestCaps {
  maxPairs: number;
  maxMs: number;
  /** Trigrams more common than this in the index are ignored for candidate generation. */
  maxPosting: number;
  candidatesPerRow: number;
  maxPool: number;
}

export const DEFAULT_SUGGEST_CAPS: SuggestCaps = { maxPairs: 2_000_000, maxMs: 10_000, maxPosting: 400, candidatesPerRow: 8, maxPool: 25_000 };

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  if (s.length === 0) return m;
  const padded = s.length === 1 ? ` ${s} ` : s;
  for (let i = 0; i < padded.length - 1; i++) {
    const g = padded.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

export function diceSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === '' && nb === '') return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  let sa = 0;
  let sb = 0;
  for (const [g, c] of ba) {
    sa += c;
    const o = bb.get(g);
    if (o) inter += Math.min(c, o);
  }
  for (const c of bb.values()) sb += c;
  return sa + sb === 0 ? 0 : (2 * inter) / (sa + sb);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function numberCloseness(a: Dec, b: Dec): number {
  if (decCompare(a, b) === 0) return 1;
  const diff = decAbs(decSub(a, b));
  const big = decCompare(decAbs(a), decAbs(b)) >= 0 ? decAbs(a) : decAbs(b);
  const toNum = (d: Dec) => Number(d.c) / 10 ** d.s;
  const denom = toNum(big);
  if (!Number.isFinite(denom) || denom === 0) return 0;
  return Math.max(0, 1 - toNum(diff) / denom);
}

type Ref =
  | { kind: 'text'; label: string; a: number; b: number; aKey: boolean; idx: number }
  | { kind: 'exact' | 'number'; label: string; fieldIndex: number };

export async function suggestLinks(
  cmp: Comparer,
  base: ComparisonResult,
  approx: ApproxConfig,
  hooks: JobHooks = NO_HOOKS,
  caps: SuggestCaps = DEFAULT_SUGGEST_CAPS,
): Promise<SuggestionResult> {
  const t0 = Date.now();
  const config = cmp.config;
  const refs: Ref[] = [];
  for (const r of approx.refs) {
    if (r.startsWith('k:')) {
      const ki = config.keys.findIndex((k) => k.id === r.slice(2));
      if (ki >= 0) refs.push({ kind: 'text', label: config.keys[ki]!.label, a: cmp.keyCols.A[ki]!, b: cmp.keyCols.B[ki]!, aKey: true, idx: ki });
    } else if (r.startsWith('f:')) {
      const fi = config.fields.findIndex((f) => f.id === r.slice(2));
      if (fi < 0) continue;
      const f = config.fields[fi]!;
      if (f.kind === 'text' || f.kind === 'identifier') refs.push({ kind: 'text', label: f.label, a: cmp.fieldCols.A[fi]!, b: cmp.fieldCols.B[fi]!, aKey: false, idx: fi });
      else if (f.kind === 'number') refs.push({ kind: 'number', label: f.label, fieldIndex: fi });
      else refs.push({ kind: 'exact', label: f.label, fieldIndex: fi });
    }
  }
  const textRefs = refs.filter((r): r is Extract<Ref, { kind: 'text' }> => r.kind === 'text');
  const pool = (cat: ResultRow['category']) => base.rows.filter((r) => r.category === cat);
  const poolA = pool('only-a').map((r) => r.aIdx[0]!);
  const poolB = pool('only-b').map((r) => r.bIdx[0]!);
  const result: SuggestionResult = {
    suggestions: [],
    truncated: false,
    truncatedReasons: [],
    examinedPairs: 0,
    eligibleA: poolA.length,
    eligibleB: poolB.length,
  };
  if (textRefs.length === 0 || poolA.length === 0 || poolB.length === 0) return result;

  let a = poolA;
  let b = poolB;
  if (a.length > caps.maxPool || b.length > caps.maxPool) {
    result.truncated = true;
    result.truncatedReasons.push(`Only the first ${caps.maxPool.toLocaleString('en-US')} unmatched rows of each file were searched.`);
    a = a.slice(0, caps.maxPool);
    b = b.slice(0, caps.maxPool);
  }

  const textOf = (role: 'A' | 'B', idx: number, ref: Extract<Ref, { kind: 'text' }>) => cmp.table(role).text(idx, role === 'A' ? ref.a : ref.b);
  const blockText = (role: 'A' | 'B', idx: number) => norm(textRefs.map((r) => textOf(role, idx, r)).join(' '));

  hooks.onProgress?.({ phase: 'suggesting', done: 0, total: b.length });
  const index = new Map<string, number[]>();
  for (let n = 0; n < a.length; n++) {
    await checkpoint(hooks, n, 2000);
    for (const g of trigrams(blockText('A', a[n]!))) {
      const list = index.get(g);
      if (list) list.push(n);
      else index.set(g, [n]);
    }
  }

  const scorePair = (ai: number, bi: number): { score: number; parts: SuggestionPart[] } => {
    const parts: SuggestionPart[] = [];
    for (const r of refs) {
      if (r.kind === 'text') {
        parts.push({ label: r.label, score: diceSimilarity(textOf('A', ai, r), textOf('B', bi, r)) });
      } else {
        const ca = cmp.canonField('A', r.fieldIndex, ai);
        const cb = cmp.canonField('B', r.fieldIndex, bi);
        let s = 0;
        if (ca.t === 'value' && cb.t === 'value') {
          s = r.kind === 'number' && ca.dec && cb.dec ? numberCloseness(ca.dec, cb.dec) : ca.v === cb.v ? 1 : 0;
        } else if (ca.t === 'blank' && cb.t === 'blank') s = 0;
        parts.push({ label: r.label, score: s });
      }
    }
    const score = parts.reduce((x, p) => x + p.score, 0) / parts.length;
    return { score, parts };
  };

  const found: Array<{ n: number; m: number; score: number; parts: SuggestionPart[] }> = [];
  let capped = false;
  for (let m = 0; m < b.length && !capped; m++) {
    await checkpoint(hooks, m, 200);
    hooks.onProgress?.({ phase: 'suggesting', done: m, total: b.length });
    if (Date.now() - t0 > caps.maxMs) {
      result.truncated = true;
      result.truncatedReasons.push(`Stopped after ${Math.round(caps.maxMs / 1000)} seconds; later rows were not searched.`);
      break;
    }
    const counts = new Map<number, number>();
    for (const g of trigrams(blockText('B', b[m]!))) {
      const list = index.get(g);
      if (!list) continue;
      if (list.length > caps.maxPosting) continue;
      for (const n of list) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, caps.candidatesPerRow);
    for (const [n] of top) {
      result.examinedPairs++;
      if (result.examinedPairs > caps.maxPairs) {
        result.truncated = true;
        result.truncatedReasons.push(`Stopped after examining ${caps.maxPairs.toLocaleString('en-US')} candidate pairs.`);
        capped = true;
        break;
      }
      const s = scorePair(a[n]!, b[m]!);
      if (s.score >= approx.threshold) found.push({ n, m, score: s.score, parts: s.parts });
    }
  }
  if (hooks.isCancelled()) throw new CancelledError();

  // One-to-one: best scores first; a row, once offered, is never offered again.
  found.sort((x, y) => y.score - x.score || a[x.n]! - a[y.n]! || b[x.m]! - b[y.m]!);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  for (const f of found) {
    if (usedA.has(f.n) || usedB.has(f.m)) continue;
    usedA.add(f.n);
    usedB.add(f.m);
    result.suggestions.push({ id: `s:${a[f.n]!}:${b[f.m]!}`, aIdx: a[f.n]!, bIdx: b[f.m]!, score: Math.round(f.score * 1000) / 1000, parts: f.parts });
  }
  return result;
}
