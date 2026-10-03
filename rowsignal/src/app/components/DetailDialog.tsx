import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Diff, Info, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { FieldStatus } from '../../engine/types';
import { StatusBadge } from '../../shared/status';
import type { FieldDetail, RowDetail } from '../../worker/session';
import { describeError, useWorkspace } from '../workspace';
import { FileId } from '../../shared/FileId';
import { Modal } from './Modal';
import { keyDisplay } from './ResultTable';

function ResultCell({ status }: { status: FieldStatus | null }) {
  if (status === 's')
    return (
      <span className="badge badge--good">
        <CircleCheck size={14} aria-hidden="true" />
        Same
      </span>
    );
  if (status === 'd')
    return (
      <span className="badge badge--warn">
        <Diff size={14} aria-hidden="true" />
        Different
      </span>
    );
  if (status === 'u')
    return (
      <span className="badge badge--bad">
        <CircleAlert size={14} aria-hidden="true" />
        Unreadable
      </span>
    );
  return <span className="muted">—</span>;
}

const Raw = ({ v }: { v: string | null }) => (v === null ? <span className="muted">—</span> : v.trim() === '' ? <span className="blank">(blank)</span> : <span className="mono break">{v}</span>);

function FieldsTable({ fields, hasBoth }: { fields: FieldDetail[]; hasBoth: boolean }) {
  if (fields.length === 0) return <p className="muted">No values were selected to compare.</p>;
  return (
    <>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Compared values, side by side">
        <table className="dt compare-table">
          <caption className="sr-only">Compared values for File A and File B</caption>
          <thead>
            <tr>
              <th scope="col">Value</th>
              <th scope="col">
                <FileId role="A" /> original
              </th>
              <th scope="col">
                <FileId role="B" /> original
              </th>
              <th scope="col">As compared</th>
              {hasBoth && <th scope="col">Result</th>}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.label} className={f.status === 'd' || f.status === 'u' ? 'is-diff' : ''}>
                <th scope="row">{f.label}</th>
                <td>
                  <Raw v={f.aRaw} />
                </td>
                <td>
                  <Raw v={f.bRaw} />
                </td>
                <td className="shown">
                  {f.aShown !== null && (
                    <div>
                      <span className="diffcell__side">A</span> <span className="mono break">{f.aShown}</span>
                    </div>
                  )}
                  {f.bShown !== null && (
                    <div>
                      <span className="diffcell__side">B</span> <span className="mono break">{f.bShown}</span>
                    </div>
                  )}
                </td>
                {hasBoth && (
                  <td>
                    <ResultCell status={f.status} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="disclosure">
        <summary>Rules applied to these values</summary>
        <ul className="rules-list">
          {fields.map((f) => (
            <li key={f.label}>
              <strong>{f.label}:</strong> {f.rule}.
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function ReviewBox({ rowId }: { rowId: string }) {
  const ws = useWorkspace();
  const ann = ws.state.annotations[rowId] ?? { flag: null, note: '' };
  const legend = useId();
  const noteId = useId();
  const set = (p: Partial<typeof ann>) => ws.setAnnotation(rowId, { ...ann, ...p });
  const opts: Array<{ v: 'none' | 'followup' | 'reviewed'; label: string }> = [
    { v: 'none', label: 'Not reviewed' },
    { v: 'followup', label: 'Needs follow-up' },
    { v: 'reviewed', label: 'Reviewed' },
  ];
  const cur = ann.flag ?? 'none';
  return (
    <section className="review" aria-labelledby={legend}>
      <h3 id={legend} className="h-sm">
        Your review
      </h3>
      <div role="radiogroup" aria-labelledby={legend} className="segmented">
        {opts.map((o) => (
          <label key={o.v} className={`segmented__opt ${cur === o.v ? 'is-on' : ''}`}>
            <input type="radio" name={`review-${rowId}`} checked={cur === o.v} onChange={() => set({ flag: o.v === 'none' ? null : o.v })} />
            {o.v === 'reviewed' && <Check size={14} aria-hidden="true" />}
            {o.label}
          </label>
        ))}
      </div>
      <div className="field">
        <label htmlFor={noteId}>Note (optional)</label>
        <textarea id={noteId} className="textarea" value={ann.note} maxLength={2000} onChange={(e) => set({ note: e.target.value })} />
        <p className="help">Kept in memory unless you save the project. Your review never changes the result above — a difference stays a difference. Exports include notes only if you choose.</p>
      </div>
    </section>
  );
}

export function DetailDialog({ rowId, ids, onNavigate, onClose }: { rowId: string | null; ids: string[]; onNavigate: (id: string) => void; onClose: () => void }) {
  return (
    <Modal open={rowId !== null} onClose={onClose} title="Row details" wide className="dialog--drawer">
      {rowId !== null && <DetailBody key={rowId} rowId={rowId} ids={ids} onNavigate={onNavigate} />}
    </Modal>
  );
}

function DetailBody({ rowId, ids, onNavigate }: { rowId: string; ids: string[]; onNavigate: (id: string) => void }) {
  const ws = useWorkspace();
  const [detail, setDetail] = useState<RowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const row = useMemo(() => ws.state.result?.rows.find((r) => r.id === rowId), [rowId, ws.state.result]);
  const pos = ids.indexOf(rowId);

  const getDetail = ws.getDetail;
  useEffect(() => {
    let live = true;
    getDetail(rowId)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(describeError(e)));
    return () => {
      live = false;
    };
  }, [rowId, getDetail]);

  const go = useCallback(
    (d: -1 | 1) => {
      const next = ids[pos + d];
      if (next) onNavigate(next);
    },
    [ids, pos, onNavigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') go(1);
      if (e.key === 'k') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const names = (r: 'A' | 'B') => ws.state.roleNames[r].trim();
  const both = row ? row.category === 'matched' || row.category === 'different' : false;

  if (!row) return null;
  return (
        <div className="detail stack" data-testid="detail">
          <div className="detail__top">
            <StatusBadge row={row} />
            <span className="mono detail__key break">{keyDisplay(row) || '(blank identifier)'}</span>
            <span className="spacer" />
            <span className="help" aria-live="polite">
              {pos >= 0 ? `Row ${(pos + 1).toLocaleString('en-US')} of ${ids.length.toLocaleString('en-US')}` : ''}
            </span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => go(-1)} disabled={pos <= 0} aria-label="Previous row (K)">
              <ArrowLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => go(1)} disabled={pos < 0 || pos >= ids.length - 1} aria-label="Next row (J)">
              Next
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>

          <section aria-labelledby="why-h">
            <h3 id="why-h" className="h-sm">
              Why this result
            </h3>
            <p>{row.summary}</p>
            <ul className="reasons">
              {row.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>

          {!detail && !error && (
            <p className="muted">
              <LoaderCircle className="spin inline-icon" size={16} aria-hidden="true" /> Loading original values…
            </p>
          )}
          {error && (
            <div className="callout callout--error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div className="callout__body">{error}</div>
            </div>
          )}

          {detail && (
            <>
              {row.category !== 'ambiguous' && (
                <section aria-labelledby="ident-h">
                  <h3 id="ident-h" className="h-sm">
                    Identifier
                  </h3>
                  <div className="table-scroll">
                    <table className="dt">
                      <caption className="sr-only">Identifier values</caption>
                      <thead>
                        <tr>
                          <th scope="col">Identifier</th>
                          <th scope="col">
                            <FileId role="A" />
                          </th>
                          <th scope="col">
                            <FileId role="B" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.keys.map((k) => (
                          <tr key={k.label}>
                            <th scope="row">{k.label}</th>
                            <td>
                              <Raw v={k.aRaw} />
                            </td>
                            <td>
                              <Raw v={k.bRaw} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className="disclosure">
                    <summary>How identifiers are compared</summary>
                    <ul className="rules-list">
                      {detail.keys.map((k) => (
                        <li key={k.label}>
                          <strong>{k.label}:</strong> {k.rule}.
                        </li>
                      ))}
                    </ul>
                  </details>
                </section>
              )}
              {row.category !== 'ambiguous' && row.category !== 'invalid' && (
                <section aria-labelledby="vals-h">
                  <h3 id="vals-h" className="h-sm">
                    Compared values
                  </h3>
                  <FieldsTable fields={detail.fields} hasBoth={both} />
                </section>
              )}
              <section aria-labelledby="orig-h">
                <h3 id="orig-h" className="h-sm">
                  Original rows
                </h3>
                <div className="orig-grid">
                  {(['A', 'B'] as const).flatMap((side) =>
                    detail.records[side].map((rec) => (
                      <div className="orig card-flat" key={`${side}-${rec.rowNumber}`}>
                        <h4>
                          <FileId role={side} /> {names(side) && <span className="break">{names(side)} · </span>}
                          row {rec.rowNumber}
                          {rec.sheet ? ` · sheet “${rec.sheet}”` : ''}
                        </h4>
                        <dl className="orig__cells">
                          {rec.cells.map((c) => (
                            <div key={c.letter} className="orig__cell">
                              <dt>
                                <span className="muted">{c.letter}</span> {c.label}
                                {c.hidden ? ' (hidden column)' : ''}
                              </dt>
                              <dd>
                                <Raw v={c.raw} />
                                {c.note && <span className="help"> · {c.note}</span>}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )),
                  )}
                  {detail.records.A.length + detail.records.B.length === 0 && <p className="muted">No source rows.</p>}
                </div>
              </section>
            </>
          )}
          <ReviewBox rowId={row.id} />
          <p className="help">
            <Info size={14} aria-hidden="true" className="inline-icon" /> Press <kbd>J</kbd> / <kbd>K</kbd> for the next / previous row.
          </p>
        </div>
  );
}
