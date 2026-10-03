import { Download, Info, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { useWorkspace } from '../workspace';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ids of the rows currently shown after filtering. */
  filteredIds: string[];
  filtersActive: boolean;
  totalRows: number;
}

export function ExportDialog({ open, onClose, filteredIds, filtersActive, totalRows }: Props) {
  const ws = useWorkspace();
  const config = ws.state.config;
  const summary = ws.state.result?.summary;
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [scope, setScope] = useState<'all' | 'filtered'>(filtersActive ? 'filtered' : 'all');
  const [fieldIds, setFieldIds] = useState<string[]>(() => config.fields.map((f) => f.id));
  const [normalized, setNormalized] = useState(false);
  const [reasons, setReasons] = useState(true);
  const [rowRefs, setRowRefs] = useState(true);
  const [review, setReview] = useState(false);
  const [rules, setRules] = useState(true);
  const [busy, setBusy] = useState(false);
  const fmtId = useId();
  const reviewCount = Object.keys(ws.state.annotations).length;

  const run = async () => {
    setBusy(true);
    const out = await ws.exportResults({
      format,
      scope,
      rowIds: scope === 'filtered' ? filteredIds : null,
      fieldIds: fieldIds.length === config.fields.length ? null : fieldIds,
      includeNormalized: normalized,
      includeReasons: reasons,
      includeRowRefs: rowRefs,
      includeReview: review,
      includeRules: rules && format === 'xlsx',
    });
    setBusy(false);
    if (out) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export results"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={busy || ws.stale} data-testid="export-go">
            {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
            Export {format === 'xlsx' ? 'Excel file' : 'CSV file'}
          </button>
        </>
      }
    >
      <div className="stack">
        <fieldset className="stack-sm">
          <legend>File type</legend>
          <label className="check">
            <input type="radio" name={fmtId} checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} />
            <span className="check__text">
              <span>Excel (.xlsx)</span>
              <span className="help">One sheet each for paired results, only in A, only in B, ambiguous keys and invalid keys, plus a summary and a rules sheet.</span>
            </span>
          </label>
          <label className="check">
            <input type="radio" name={fmtId} checked={format === 'csv'} onChange={() => setFormat('csv')} />
            <span className="check__text">
              <span>CSV (.csv)</span>
              <span className="help">One flat table of every result row. UTF-8 with a byte-order mark so Excel reads it correctly.</span>
            </span>
          </label>
        </fieldset>

        <fieldset className="stack-sm">
          <legend>Which results</legend>
          <label className="check">
            <input type="radio" name={`${fmtId}-scope`} checked={scope === 'all'} onChange={() => setScope('all')} />
            <span className="check__text">
              <span>All results</span>
              <span className="help">{totalRows.toLocaleString('en-US')} result rows (pairs, unmatched rows, groups).</span>
            </span>
          </label>
          <label className="check">
            <input type="radio" name={`${fmtId}-scope`} checked={scope === 'filtered'} onChange={() => setScope('filtered')} disabled={!filtersActive} />
            <span className="check__text">
              <span>Only what I am looking at now</span>
              <span className="help">{filtersActive ? `${filteredIds.length.toLocaleString('en-US')} rows match the current filters and search.` : 'No filters are active, so this would be all results.'}</span>
            </span>
          </label>
        </fieldset>

        {config.fields.length > 0 && (
          <fieldset className="stack-sm">
            <legend>Values to include</legend>
            <div className="export-fields">
              {config.fields.map((f) => (
                <label key={f.id} className="check">
                  <input type="checkbox" checked={fieldIds.includes(f.id)} onChange={(e) => setFieldIds((ids) => (e.target.checked ? [...ids, f.id] : ids.filter((x) => x !== f.id)))} />
                  <span className="check__text">{f.label}</span>
                </label>
              ))}
            </div>
            <p className="help">Original values from both files are always included, exactly as found.</p>
          </fieldset>
        )}

        <fieldset className="stack-sm">
          <legend>Also include</legend>
          <label className="check">
            <input type="checkbox" checked={reasons} onChange={(e) => setReasons(e.target.checked)} />
            <span className="check__text">Why each row was classified</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={rowRefs} onChange={(e) => setRowRefs(e.target.checked)} />
            <span className="check__text">Row numbers from your files</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={normalized} onChange={(e) => setNormalized(e.target.checked)} />
            <span className="check__text">
              <span>Values as compared</span>
              <span className="help">After trimming, case and number/date reading. Numbers are real numbers in Excel files.</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
            <span className="check__text">
              <span>My review flags and notes ({reviewCount} annotated)</span>
              <span className="help">Off by default — your notes are only exported if you ask.</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={rules && format === 'xlsx'} disabled={format !== 'xlsx'} onChange={(e) => setRules(e.target.checked)} />
            <span className="check__text">
              <span>Rules summary sheet</span>
              <span className="help">{format === 'xlsx' ? 'Describes the rules used, in words.' : 'Only available in Excel exports.'}</span>
            </span>
          </label>
        </fieldset>

        <div className="callout callout--info">
          <Info size={18} aria-hidden="true" />
          <div className="callout__body stack-sm">
            {summary && summary.manualPairs > 0 ? (
              <p>
                <strong>{summary.manualPairs} manually linked pair{summary.manualPairs === 1 ? '' : 's'}</strong> {summary.manualPairs === 1 ? 'is' : 'are'} included and labelled “Manually linked”.
              </p>
            ) : (
              <p>No manually linked pairs are in these results.</p>
            )}
            <p>
              {format === 'csv'
                ? 'To protect you when the file is opened in a spreadsheet, text that starts with = + - or @ (and is not a plain number) gets a visible apostrophe in front. Your originals are not changed.'
                : 'Text is always written as literal text, never as a formula, so nothing in your data can run when the file is opened.'}
            </p>
            <p>The file is created on this device and downloaded by your browser. Nothing is uploaded.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
