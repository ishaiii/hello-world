import type { ResultRow } from '../engine/types';

export function keyDisplay(r: ResultRow): string {
  const a = r.keyA?.join(' + ');
  const b = r.keyB?.join(' + ');
  if (a !== undefined && b !== undefined && a !== b) return `${a} ⇄ ${b}`;
  return a ?? b ?? '';
}

export function rowsDisplay(r: ResultRow): string {
  const a = r.aRows.length ? `A ${r.aRows.join(', ')}` : '';
  const b = r.bRows.length ? `B ${r.bRows.join(', ')}` : '';
  return [a, b].filter(Boolean).join(' · ');
}

export const Blank = () => <span className="blank">(blank)</span>;

export function Val({ v }: { v: string | undefined }) {
  if (v === undefined) return <span className="muted">—</span>;
  if (v.trim() === '') return <Blank />;
  return <span className="mono val">{v}</span>;
}

export function FieldCell({ row, index }: { row: ResultRow; index: number }) {
  const a = row.aVals?.[index];
  const b = row.bVals?.[index];
  const st = row.status?.[index];
  if (row.category === 'ambiguous') return <span className="muted">See details</span>;
  if (row.category === 'matched' || row.category === 'different') {
    if (st === 's') return <Val v={a} />;
    return (
      <span className={`diffcell ${st === 'u' ? 'diffcell--bad' : ''}`}>
        <span className="sr-only">{st === 'u' ? 'Unreadable value. ' : 'Different. '}</span>
        <span className="diffcell__line">
          <span className="diffcell__side">A</span>
          <Val v={a} />
        </span>
        <span className="diffcell__line">
          <span className="diffcell__side">B</span>
          <Val v={b} />
        </span>
      </span>
    );
  }
  return <Val v={row.category === 'only-b' || row.side === 'B' ? b : a} />;
}

