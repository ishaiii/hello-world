import { CircleAlert, Link2, LoaderCircle, Undo2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { Suggestion } from '../../engine/suggest';
import type { ResultRow } from '../../engine/types';
import { useWorkspace } from '../workspace';
import { FileId } from '../../shared/FileId';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const keyText = (r: ResultRow | undefined, side: 'A' | 'B') => (side === 'A' ? r?.keyA : r?.keyB)?.join(' + ') ?? '';

function RowLine({ side, row, labels }: { side: 'A' | 'B'; row: ResultRow | undefined; labels: string[] }) {
  const vals = side === 'A' ? row?.aVals : row?.bVals;
  return (
    <div className="pm__side">
      <FileId role={side} />
      <div className="pm__vals">
        <span className="mono break">{keyText(row, side) || '(blank)'}</span>
        {vals && vals.some((v) => v.trim() !== '') && (
          <span className="help break">
            {vals
              .map((v, i) => (v.trim() === '' ? null : `${labels[i]}: ${v}`))
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

export function PossibleMatches() {
  const ws = useWorkspace();
  const { state } = ws;
  const result = state.result!;
  const config = state.config;
  const sg = state.suggest;
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(0.6);
  const thrId = useId();
  const textFields = config.fields.filter((f) => f.kind === 'text' || f.kind === 'identifier');
  const [refs, setRefs] = useState<string[]>(() => [...config.keys.map((k) => `k:${k.id}`), ...textFields.map((f) => `f:${f.id}`)]);

  const onlyA = useMemo(() => new Map(result.rows.filter((r) => r.category === 'only-a').map((r) => [r.aIdx[0]!, r])), [result.rows]);
  const onlyB = useMemo(() => new Map(result.rows.filter((r) => r.category === 'only-b').map((r) => [r.bIdx[0]!, r])), [result.rows]);
  const manual = result.rows.filter((r) => r.provenance === 'manual');
  const labels = config.fields.map((f) => f.label);
  const unmatchedA = result.summary.onlyA;
  const unmatchedB = result.summary.onlyB;
  const hasText = refs.some((r) => r.startsWith('k:') || textFields.some((f) => `f:${f.id}` === r));
  const dismissed = new Set(sg.dismissed);
  const visible: Suggestion[] = (sg.result?.suggestions ?? []).filter((s) => !dismissed.has(s.id) && onlyA.has(s.aIdx) && onlyB.has(s.bIdx));
  const disabled = ws.stale;

  if (unmatchedA + unmatchedB === 0 && manual.length === 0) return null;

  return (
    <details className="card disclosure pm" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="possible-matches">
      <summary>
        <span className="h-sm">Possible matches for unmatched rows (optional)</span>
        {manual.length > 0 && <span className="badge badge--info">{manual.length} linked</span>}
      </summary>
      <div className="stack pm__body">
        <p className="muted">
          Exact matching found {unmatchedA.toLocaleString('en-US')} row{unmatchedA === 1 ? '' : 's'} only in File A and {unmatchedB.toLocaleString('en-US')} only in File B. RowSignal can suggest rows that look alike — a typo in an ID, a different spelling. Suggestions are <strong>similarity scores, not probabilities</strong>; nothing changes until you link a pair, and a linked pair is always labelled “Manually linked”, never “Matched by key”.
        </p>

        {manual.length > 0 && (
          <div className="stack-sm" data-testid="manual-links">
            <h3 className="h-xs">Your links</h3>
            <ul className="plain-list">
              {state.links.map((l) => {
                const row = result.rows.find((r) => r.provenance === 'manual' && r.aIdx[0] === l.aIdx && r.bIdx[0] === l.bIdx);
                return (
                  <li key={`${l.aIdx}-${l.bIdx}`} className="listrow">
                    <Link2 size={16} aria-hidden="true" />
                    <span className="listrow__main">
                      <span className="mono break">
                        {row?.keyA?.join(' + ')} ⇄ {row?.keyB?.join(' + ')}
                      </span>
                      <span className="help">{row?.summary}</span>
                    </span>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => void ws.unlinkRows(l)} disabled={disabled}>
                      <Undo2 size={15} aria-hidden="true" />
                      Undo
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.links.length > 1 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void ws.unlinkRows(null)} disabled={disabled}>
                Undo all links
              </button>
            )}
          </div>
        )}

        {unmatchedA > 0 && unmatchedB > 0 && (
          <>
            <fieldset className="stack-sm">
              <legend>Compare these values</legend>
              <div className="export-fields">
                {config.keys.map((k) => (
                  <label className="check" key={k.id}>
                    <input type="checkbox" checked={refs.includes(`k:${k.id}`)} onChange={(e) => setRefs((r) => (e.target.checked ? [...r, `k:${k.id}`] : r.filter((x) => x !== `k:${k.id}`)))} />
                    <span className="check__text">{k.label} (identifier)</span>
                  </label>
                ))}
                {config.fields.map((f) => (
                  <label className="check" key={f.id}>
                    <input type="checkbox" checked={refs.includes(`f:${f.id}`)} onChange={(e) => setRefs((r) => (e.target.checked ? [...r, `f:${f.id}`] : r.filter((x) => x !== `f:${f.id}`)))} />
                    <span className="check__text">{f.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field pm__range">
              <label htmlFor={thrId}>Show suggestions at least {pct(threshold)} similar</label>
              <input id={thrId} type="range" min={0.4} max={0.95} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
            <div className="row">
              {sg.status === 'running' ? (
                <>
                  <button type="button" className="btn btn--secondary" onClick={ws.cancelSuggest}>
                    Cancel search
                  </button>
                  <span className="help" role="status">
                    <LoaderCircle size={14} className="spin inline-icon" aria-hidden="true" /> Searching
                    {sg.progress ? ` — ${sg.progress.done.toLocaleString('en-US')} of ${sg.progress.total.toLocaleString('en-US')} unmatched rows in File B` : '…'}
                  </span>
                </>
              ) : (
                <button type="button" className="btn btn--primary" disabled={!hasText || disabled} onClick={() => void ws.findPossible({ refs, threshold })} data-testid="find-possible">
                  Find possible matches
                </button>
              )}
              {!hasText && <span className="help">Choose at least one identifier or text value to search with.</span>}
            </div>
          </>
        )}

        {sg.status === 'error' && (
          <div className="callout callout--error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <div className="callout__body">{sg.error}</div>
          </div>
        )}

        {sg.result && sg.result.truncated && (
          <div className="callout callout--warn" role="note">
            <CircleAlert size={18} aria-hidden="true" />
            <div className="callout__body">
              <strong>The search was limited.</strong> {sg.result.truncatedReasons.join(' ')} Some possible matches may not be shown.
            </div>
          </div>
        )}

        {sg.status === 'done' && sg.result && (
          <div className="stack-sm" data-testid="suggestions">
            <h3 className="h-xs">
              {visible.length} suggestion{visible.length === 1 ? '' : 's'} <span className="muted">· {sg.result.examinedPairs.toLocaleString('en-US')} candidate pairs examined</span>
            </h3>
            {visible.length === 0 && <p className="muted">Nothing looked similar enough at {pct(threshold)}. Lower the threshold to see weaker suggestions.</p>}
            <ul className="plain-list">
              {visible.slice(0, 50).map((s) => (
                <li key={s.id} className="pm__item" data-testid="suggestion">
                  <div className="pm__pair">
                    <RowLine side="A" row={onlyA.get(s.aIdx)} labels={labels} />
                    <RowLine side="B" row={onlyB.get(s.bIdx)} labels={labels} />
                  </div>
                  <div className="pm__actions">
                    <span className="badge badge--neutral" title="A similarity score between 0 and 100%. It is not the chance that the pair is correct.">
                      Similarity {pct(s.score)}
                    </span>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => void ws.linkRows({ aIdx: s.aIdx, bIdx: s.bIdx })} disabled={disabled}>
                      <Link2 size={15} aria-hidden="true" />
                      Link these rows
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => ws.dispatch({ type: 'suggest', patch: { dismissed: [...sg.dismissed, s.id] } })}>
                      Not a match
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {visible.length > 50 && <p className="help">Showing the 50 most similar of {visible.length}.</p>}
          </div>
        )}
      </div>
    </details>
  );
}
