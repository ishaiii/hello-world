import { CircleAlert, CircleCheck, FileSpreadsheet, LoaderCircle, RefreshCw, TriangleAlert, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { Role } from '../../engine/types';
import { DELIMITER_LABELS, type DelimiterChoice } from '../../import/csv';
import { ENCODING_LABELS, type EncodingChoice } from '../../import/encoding';
import { formatBytes } from '../../import/limits';
import { FileId } from '../../shared/FileId';
import { useWorkspace } from '../workspace';

export { FileId };

export function FileCard({ role }: { role: Role }) {
  const ws = useWorkspace();
  const slot = ws.state.files[role];
  const info = slot.info;
  const roleName = ws.state.roleNames[role];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const nameId = useId();
  const sheetId = useId();
  const headerId = useId();
  const delimId = useId();
  const encId = useId();

  const chipRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  /** Set when the keyboard/pointer user acted on this card, so focus can follow the UI change. */
  const refocus = useRef<'chip' | 'choose' | null>(null);

  const pick = () => {
    refocus.current = 'chip';
    inputRef.current?.click();
  };
  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void ws.addFiles(role, Array.from(list));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };

  const loading = slot.status === 'loading';
  // The control that had focus is replaced when a file loads or is removed; keep focus on this card.
  useEffect(() => {
    if (slot.status === 'ready' && refocus.current === 'chip') {
      refocus.current = null;
      if (document.activeElement === document.body || !document.activeElement) chipRef.current?.focus({ preventScroll: true });
    }
    if (slot.status === 'empty' && refocus.current === 'choose') {
      refocus.current = null;
      chooseRef.current?.focus();
    }
  }, [slot.status]);
  const showDrop = slot.status === 'empty' || slot.status === 'error' || (loading && !info);

  return (
    <section className="filecard card" aria-labelledby={`${nameId}-h`} data-testid={`file-card-${role}`}>
      <div className="filecard__head">
        <h2 id={`${nameId}-h`} className="filecard__title">
          <FileId role={role} />
        </h2>
        <div className="field filecard__name">
          <label htmlFor={nameId}>Name for this file (optional)</label>
          <input
            id={nameId}
            className="input"
            value={roleName}
            maxLength={40}
            placeholder={role === 'A' ? 'e.g. Orders' : 'e.g. Dispatch'}
            onChange={(e) => ws.dispatch({ type: 'set-role-name', role, name: e.target.value })}
          />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label={`Choose a file for File ${role}`}
        data-testid={`file-input-${role}`}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {showDrop && (
        <div
          className={`dropzone ${dragging ? 'dropzone--active' : ''} ${slot.status === 'error' ? 'dropzone--error' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {loading ? <LoaderCircle className="spin" size={28} aria-hidden="true" /> : <Upload size={28} aria-hidden="true" />}
          <p className="dropzone__title">{loading ? 'Reading file…' : 'Drop a .csv or .xlsx file here'}</p>
          {!loading && (
            <>
              <p className="help">or</p>
              <button ref={chooseRef} type="button" className="btn btn--primary" onClick={pick}>
                <FileSpreadsheet size={18} aria-hidden="true" />
                Choose file for File {role}
              </button>
              <p className="help">
                Up to {ws.state.files[role].info?.limits.maxRows.toLocaleString('en-US') ?? '100,000'} rows, 100 columns, 10 MB. The file stays on this device.
              </p>
            </>
          )}
          {slot.status === 'error' && (
            <div className="callout callout--error dropzone__error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div className="callout__body">{slot.error}</div>
            </div>
          )}
        </div>
      )}

      {info && !showDrop && (
        <div className="filecard__loaded">
          <div className="filechip" ref={chipRef} tabIndex={-1} role="group" aria-label={`File ${role} loaded: ${info.fileName}`}>
            <FileSpreadsheet size={22} aria-hidden="true" className="filechip__icon" />
            <div className="filechip__text">
              <span className="filechip__name break" title={info.fileName} data-testid={`file-name-${role}`}>
                {info.fileName}
              </span>
              <span className="muted filechip__meta">
                {formatBytes(info.size)} · {info.kind === 'xlsx' ? 'Excel workbook' : 'CSV text'}
                {loading ? ' · updating…' : ''}
              </span>
            </div>
            <span className="badge badge--good" role="status">
              <CircleCheck size={14} aria-hidden="true" />
              Loaded
            </span>
          </div>
          <div className="row filecard__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={pick}>
              <RefreshCw size={16} aria-hidden="true" />
              Replace
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                refocus.current = 'choose';
                void ws.removeFile(role);
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              Remove
            </button>
          </div>

          <div className="settings-grid">
            {info.sheets && (
              <div className="field">
                <label htmlFor={sheetId}>Sheet to compare</label>
                <select id={sheetId} className="select" value={info.sheet ?? ''} onChange={(e) => void ws.reparse(role, { sheet: e.target.value })}>
                  {info.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                      {s.state !== 'visible' ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
                {info.sheets.length > 1 && <p className="help">Only the selected sheet is read. This workbook has {info.sheets.length} sheets.</p>}
              </div>
            )}

            <div className="field">
              <label htmlFor={headerId}>Column names are on</label>
              <select
                id={headerId}
                className="select"
                disabled={info.headerRow === null}
                value={info.headerRow ?? info.headerChoices[0]?.rowNumber ?? 1}
                onChange={(e) => void ws.reparse(role, { headerRow: Number(e.target.value) })}
              >
                {info.headerChoices.map((h) => (
                  <option key={h.rowNumber} value={h.rowNumber}>
                    Row {h.rowNumber}: {h.cells.filter(Boolean).slice(0, 4).join(', ') || '(empty)'}
                  </option>
                ))}
              </select>
              <label className="check">
                <input
                  type="checkbox"
                  checked={info.headerRow === null}
                  onChange={(e) => void ws.reparse(role, { headerRow: e.target.checked ? null : (info.headerChoices[0]?.rowNumber ?? 1) })}
                />
                <span className="check__text">This file has no header row</span>
              </label>
            </div>
          </div>

          {info.kind === 'csv' && (
            <details className="disclosure">
              <summary>
                File format: {info.delimiter === '\t' ? 'tab' : info.delimiter === ';' ? 'semicolon' : 'comma'}-separated, {info.encoding?.toUpperCase()}
              </summary>
              <div className="settings-grid">
                <div className="field">
                  <label htmlFor={delimId}>Separator between columns</label>
                  <select id={delimId} className="select" value={info.delimiterChoice} onChange={(e) => void ws.reparse(role, { delimiter: e.target.value as DelimiterChoice })}>
                    {(Object.keys(DELIMITER_LABELS) as DelimiterChoice[]).map((d) => (
                      <option key={d} value={d}>
                        {DELIMITER_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={encId}>Text encoding</label>
                  <select id={encId} className="select" value={info.encodingChoice} onChange={(e) => void ws.reparse(role, { encoding: e.target.value as EncodingChoice })}>
                    {(Object.keys(ENCODING_LABELS) as EncodingChoice[]).map((d) => (
                      <option key={d} value={d}>
                        {ENCODING_LABELS[d]}
                      </option>
                    ))}
                  </select>
                  {info.encodingNote && <p className="help">{info.encodingNote}</p>}
                </div>
              </div>
            </details>
          )}

          <p className="filecard__stats" data-testid={`file-stats-${role}`}>
            <strong>{info.dataRowCount.toLocaleString('en-US')}</strong> data rows · <strong>{info.columns.length}</strong> columns
            <span className="muted"> · limit {info.limits.maxRows.toLocaleString('en-US')} rows</span>
          </p>

          {info.warnings.length > 0 && (
            <ul className="notes" aria-label={`Notes about File ${role}`}>
              {info.warnings.map((w) => (
                <li key={w} className="note">
                  <TriangleAlert size={16} aria-hidden="true" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="table-scroll preview" tabIndex={0} role="region" aria-label={`Preview of the first rows of File ${role}`}>
            <table className="dt">
              <caption>First {info.preview.rows.length} data rows · row numbers are from your file</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  {info.columns.map((c) => (
                    <th key={c.id} scope="col" title={c.label}>
                      <span className="muted">{c.letter}</span> {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {info.preview.rows.map((r, i) => (
                  <tr key={info.preview.rowNumbers[i]}>
                    <th scope="row" className="num">
                      {info.preview.rowNumbers[i]}
                    </th>
                    {r.map((cell, j) => (
                      <td key={j} className="mono">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
