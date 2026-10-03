import { Flag, PanelRight } from 'lucide-react';
import type { FieldRule, ResultRow } from '../../engine/types';
import type { Annotation } from '../../export/build';
import { StatusBadge } from '../../shared/status';
import { keyDisplay } from './ResultTable';

interface Props {
  rows: ResultRow[];
  fields: Array<{ rule: FieldRule; index: number }>;
  annotations: Record<string, Annotation>;
  onOpen: (id: string) => void;
  page: number;
  pageSize: number;
  caption: string;
}

const show = (v: string | undefined) => (v === undefined ? '—' : v.trim() === '' ? '(blank)' : v);

/** Compact record cards for narrow screens; the full table stays available in its own scroll area. */
export function ResultCards({ rows, fields, annotations, onOpen, page, pageSize, caption }: Props) {
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <ul className="cards" aria-label={caption} data-testid="result-cards">
      {slice.map((r) => {
        const diffs = fields.filter(({ index }) => r.status && r.status[index] !== 's');
        const ann = annotations[r.id];
        return (
          <li key={r.id} className={`rcard rcard--${r.category}`}>
            <div className="rcard__top">
              <StatusBadge row={r} />
              {ann?.flag === 'followup' && (
                <span className="reviewflag reviewflag--followup" title="Needs follow-up">
                  <Flag size={16} aria-hidden="true" />
                  <span className="sr-only">Needs follow-up</span>
                </span>
              )}
            </div>
            <p className="rcard__key mono break">{keyDisplay(r) || '(blank identifier)'}</p>
            <p className="help rcard__rows">
              {r.aRows.length > 0 && <>File A row {r.aRows.join(', ')}</>}
              {r.aRows.length > 0 && r.bRows.length > 0 && ' · '}
              {r.bRows.length > 0 && <>File B row {r.bRows.join(', ')}</>}
            </p>
            {diffs.length > 0 ? (
              <ul className="rcard__diffs">
                {diffs.map(({ rule, index }) => (
                  <li key={rule.id}>
                    <strong>{rule.label}</strong>: <span className="diffcell__side">A</span> <span className="mono">{show(r.aVals?.[index])}</span> <span className="diffcell__side">B</span> <span className="mono">{show(r.bVals?.[index])}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rcard__sum">{r.summary}</p>
            )}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => onOpen(r.id)} aria-label={`Open details for ${keyDisplay(r) || 'row without identifier'}`}>
              <PanelRight size={15} aria-hidden="true" />
              Details
            </button>
          </li>
        );
      })}
    </ul>
  );
}
