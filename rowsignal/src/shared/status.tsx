import { Ban, CircleArrowLeft, CircleArrowRight, CircleCheck, Diff, Layers, Link2, type LucideIcon } from 'lucide-react';
import type { Category, ResultRow, Role } from '../engine/types';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export interface CategoryMeta {
  /** Chip / filter label. */
  label: string;
  /** What one unit of this category is. */
  unit: string;
  tone: Tone;
  Icon: LucideIcon;
  /** Plain description for tooltips and help. */
  help: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  matched: { label: 'Matched', unit: 'pairs', tone: 'good', Icon: CircleCheck, help: 'Paired by identifier, and every compared value agrees.' },
  different: { label: 'Differences', unit: 'pairs', tone: 'warn', Icon: Diff, help: 'Paired by identifier, but at least one compared value differs.' },
  'only-a': { label: 'Only in A', unit: 'rows', tone: 'info', Icon: CircleArrowLeft, help: 'The identifier appears in File A but not in File B.' },
  'only-b': { label: 'Only in B', unit: 'rows', tone: 'info', Icon: CircleArrowRight, help: 'The identifier appears in File B but not in File A.' },
  ambiguous: { label: 'Ambiguous keys', unit: 'groups', tone: 'warn', Icon: Layers, help: 'The identifier appears more than once in a file, so rows cannot be paired safely.' },
  invalid: { label: 'Invalid keys', unit: 'rows', tone: 'bad', Icon: Ban, help: 'The identifier is blank (or unreadable), so the row cannot be matched.' },
};

export function badgeLabel(category: Category, side?: Role): string {
  switch (category) {
    case 'matched':
      return 'Matched';
    case 'different':
      return 'Different';
    case 'only-a':
      return 'Only in A';
    case 'only-b':
      return 'Only in B';
    case 'ambiguous':
      return 'Ambiguous key';
    case 'invalid':
      return `Invalid key${side ? ` (${side})` : ''}`;
  }
}

export function StatusBadge({ row }: { row: Pick<ResultRow, 'category' | 'side' | 'provenance'> }) {
  const meta = CATEGORY_META[row.category];
  const manual = row.provenance === 'manual';
  return (
    <span className="status-cell">
      <span className={`badge badge--${meta.tone}`}>
        <meta.Icon size={14} aria-hidden="true" />
        {badgeLabel(row.category, row.side)}
      </span>
      {manual && (
        <span className="badge badge--info" title="Linked by you, not an exact identifier match">
          <Link2 size={13} aria-hidden="true" />
          Manually linked
        </span>
      )}
    </span>
  );
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
