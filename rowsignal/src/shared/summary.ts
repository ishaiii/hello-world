import type { Summary } from '../engine/types';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n: number) => (n >= 0 && n <= 10 ? WORDS[n]! : n.toLocaleString('en-US'));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plain-language summary derived only from the engine's counts. */
export function summarySentence(s: Summary): string {
  const parts: string[] = [];
  if (s.pairs === 0) parts.push('No records could be paired.');
  else {
    parts.push(`We paired ${s.pairs.toLocaleString('en-US')} record${s.pairs === 1 ? '' : 's'}.`);
    if (s.different === 0) parts.push(s.pairs === 1 ? 'It agrees.' : 'All of them agree.');
    else if (s.matched === 0) parts.push(s.pairs === 1 ? 'It has differences.' : 'All of them have differences.');
    else {
      parts.push(`${cap(word(s.matched))} ${s.matched === 1 ? 'agrees' : 'agree'}, ${word(s.different)} ${s.different === 1 ? 'has' : 'have'} differences.`);
    }
  }
  const review: string[] = [];
  if (s.onlyA + s.onlyB > 0) review.push('unmatched records');
  if (s.ambiguousGroups > 0) review.push('ambiguous keys');
  if (s.invalidA + s.invalidB > 0) review.push('invalid identifiers');
  if (review.length === 0) {
    if (s.different === 0) parts.push('Nothing else needs attention.');
  } else {
    const list = review.length === 1 ? review[0]! : review.length === 2 ? `${review[0]} and ${review[1]}` : `${review.slice(0, -1).join(', ')}, and ${review[review.length - 1]}`;
    parts.push(`Review ${list} below.`);
  }
  return parts.join(' ');
}
