import { ArrowDown, ArrowUp, ArrowUpDown, Check, Flag, PanelRight } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { FieldRule, ResultRow } from '../../engine/types';
import type { Annotation } from '../../export/build';
import { Blank, FieldCell, keyDisplay, rowsDisplay } from '../../shared/resultCells';
import { StatusBadge } from '../../shared/status';

export { keyDisplay };

export const ROW_H = 58;
const OVERSCAN = 8;

export type SortKey = 'default' | 'key' | 'status' | 'rowA' | 'rowB' | `field:${string}`;
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

interface RowProps {
  row: ResultRow;
  index: number;
  fields: Array<{ rule: FieldRule; index: number }>;
  pinKey: boolean;
  annotation: Annotation | undefined;
  onOpen: (id: string) => void;
  top: number | null;
  selected: boolean;
}

const TableRow = memo(function TableRow({ row, index, fields, pinKey, annotation, onOpen, top, selected }: RowProps) {
  const label = keyDisplay(row);
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected || undefined}
      className={`rt__row rt__row--${row.category} ${selected ? 'is-selected' : ''}`}
      data-row-id={row.id}
      style={top === null ? undefined : { top }}
    >
      <div role="rowheader" className={`rt__cell rt__cell--key ${pinKey ? 'is-pinned' : ''}`}>
        <span className="mono truncate" title={label}>
          {label || <Blank />}
        </span>
      </div>
      <div role="cell" className="rt__cell">
        <StatusBadge row={row} />
      </div>
      <div role="cell" className="rt__cell rt__cell--rows mono">
        {rowsDisplay(row)}
      </div>
      {fields.map(({ rule, index: fi }) => (
        <div role="cell" className="rt__cell" key={rule.id}>
          <FieldCell row={row} index={fi} />
        </div>
      ))}
      <div role="cell" className="rt__cell rt__cell--review">
        {annotation?.flag === 'followup' && (
          <span className="reviewflag reviewflag--followup" title="Needs follow-up">
            <Flag size={16} aria-hidden="true" />
            <span className="sr-only">Needs follow-up</span>
          </span>
        )}
        {annotation?.flag === 'reviewed' && (
          <span className="reviewflag reviewflag--reviewed" title="Reviewed">
            <Check size={16} aria-hidden="true" />
            <span className="sr-only">Reviewed</span>
          </span>
        )}
        {annotation?.note && !annotation.flag && <span className="sr-only">Has a note</span>}
      </div>
      <div role="cell" className="rt__cell rt__cell--open">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => onOpen(row.id)} aria-label={`Open details for ${label || 'row without identifier'}, ${row.summary}`} data-testid="open-detail">
          <PanelRight size={15} aria-hidden="true" />
          Details
        </button>
      </div>
    </div>
  );
});

interface Props {
  rows: ResultRow[];
  fields: Array<{ rule: FieldRule; index: number }>;
  annotations: Record<string, Annotation>;
  pinKey: boolean;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
  mode: 'scroll' | 'pages';
  page: number;
  pageSize: number;
  selectedId: string | null;
  caption: string;
}

export function ResultTable({ rows, fields, annotations, pinKey, sort, onSort, onOpen, mode, page, pageSize, selectedId, caption }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(520);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight || 520);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sort.key, sort.dir, page, rows.length]);

  const onScroll = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  }, []);

  const visible = mode === 'pages' ? rows.slice(page * pageSize, page * pageSize + pageSize) : rows;
  const total = visible.length;
  const start = mode === 'scroll' ? Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN) : 0;
  const end = mode === 'scroll' ? Math.min(total, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN) : total;

  const template = useMemo(() => {
    const parts = ['minmax(150px, 1.1fr)', '170px', '120px', ...fields.map(() => 'minmax(150px, 1fr)'), '56px', '112px'];
    return parts.join(' ');
  }, [fields]);
  const minWidth = 150 + 170 + 120 + fields.length * 150 + 56 + 112;

  const sortIcon = (k: SortKey) => (sort.key !== k ? <ArrowUpDown size={14} aria-hidden="true" /> : sort.dir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />);
  const aria = (k: SortKey): 'ascending' | 'descending' | 'none' => (sort.key !== k ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending');
  const head = (k: SortKey, text: string, cls = '') => (
    <div role="columnheader" aria-sort={aria(k)} className={`rt__cell rt__head ${cls}`}>
      <button type="button" className="rt__sort" onClick={() => onSort(k)}>
        {text}
        {sortIcon(k)}
      </button>
    </div>
  );

  const items: ReactElement[] = [];
  for (let i = start; i < end; i++) {
    const row = visible[i]!;
    items.push(
      <TableRow
        key={row.id}
        row={row}
        index={mode === 'pages' ? page * pageSize + i : i}
        fields={fields}
        pinKey={pinKey}
        annotation={annotations[row.id]}
        onOpen={onOpen}
        top={mode === 'scroll' ? i * ROW_H : null}
        selected={row.id === selectedId}
      />,
    );
  }

  return (
    <div className="rt card-flat" data-testid="result-table">
      <div ref={scrollRef} className={`rt__scroll ${mode === 'pages' ? 'rt__scroll--pages' : ''}`} onScroll={onScroll} tabIndex={0} role="region" aria-label={`${caption}. Scroll to see more.`}>
        <div role="table" aria-label={caption} aria-rowcount={rows.length + 1} className="rt__table" style={{ '--cols': template, minWidth } as CSSProperties}>
          <div role="rowgroup" className="rt__thead">
            <div role="row" aria-rowindex={1} className="rt__row rt__row--head">
              {head('key', 'Identifier', `rt__cell--key ${pinKey ? 'is-pinned' : ''}`)}
              {head('status', 'Status')}
              {head('rowA', 'Source rows')}
              {fields.map(({ rule }) => (
                <div role="columnheader" aria-sort={aria(`field:${rule.id}`)} className="rt__cell rt__head" key={rule.id}>
                  <button type="button" className="rt__sort" onClick={() => onSort(`field:${rule.id}`)}>
                    <span className="truncate">{rule.label}</span>
                    {sortIcon(`field:${rule.id}`)}
                  </button>
                </div>
              ))}
              <div role="columnheader" className="rt__cell rt__head rt__cell--review">
                <span className="sr-only">Review</span>
                <Flag size={14} aria-hidden="true" />
              </div>
              <div role="columnheader" className="rt__cell rt__head">
                <span className="sr-only">Actions</span>
              </div>
            </div>
          </div>
          <div role="rowgroup" className={`rt__tbody ${mode === 'scroll' ? 'rt__tbody--virtual' : ''}`} style={mode === 'scroll' ? { height: total * ROW_H } : undefined}>
            {items}
          </div>
        </div>
      </div>
    </div>
  );
}
