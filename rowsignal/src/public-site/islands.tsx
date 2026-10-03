/**
 * Interactive islands. These are the only parts of the public pages that run JavaScript in the
 * browser; the rest is plain HTML. They never touch user files.
 */
import { Download } from 'lucide-react';
import { useId, useState } from 'react';
import { buildDiagnostics } from '../shared/diagnostics';

const A_ROWS: Array<[string, number]> = [
  ['1001', 10],
  ['1002', 12],
  ['1003', 2],
  ['1004', 5],
];
const B_ROWS: Array<[string, number]> = [
  ['1003', 2],
  ['1001', 10],
  ['1004', 4],
  ['1002', 12],
];

type Mode = 'position' | 'key';

function Mini({ title, rows, mark }: { title: string; rows: Array<[string, number]>; mark?: (i: number) => 'ok' | 'bad' | '' }) {
  return (
    <div>
      <p className="label">{title}</p>
      <table className="dt">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, q], i) => (
            <tr key={id}>
              <td className={`mono ${mark?.(i) ?? ''}`}>{id}</td>
              <td className={`mono ${mark?.(i) ?? ''}`}>{q}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReorderDemo() {
  const [mode, setMode] = useState<Mode>('position');
  const name = useId();
  const byKey = new Map(B_ROWS);
  const positionBad = A_ROWS.map(([id, q], i) => B_ROWS[i]![0] !== id || B_ROWS[i]![1] !== q);
  const keyBad = A_ROWS.map(([id, q]) => byKey.get(id) !== q);
  const bad = mode === 'position' ? positionBad : keyBad;
  const n = bad.filter(Boolean).length;
  return (
    <div className="demo" data-testid="reorder-demo">
      <fieldset>
        <legend>How should the rows be compared?</legend>
        <div className="segmented" role="radiogroup">
          <label className={`segmented__opt ${mode === 'position' ? 'is-on' : ''}`}>
            <input type="radio" name={name} checked={mode === 'position'} onChange={() => setMode('position')} />
            Line by line (row position)
          </label>
          <label className={`segmented__opt ${mode === 'key' ? 'is-on' : ''}`}>
            <input type="radio" name={name} checked={mode === 'key'} onChange={() => setMode('key')} />
            By identifier (what RowSignal does)
          </label>
        </div>
      </fieldset>
      <div className="demo__tables">
        <Mini title="File A" rows={A_ROWS} mark={(i) => (bad[i] ? 'bad' : 'ok')} />
        <Mini title="File B (same orders, different order)" rows={B_ROWS} mark={mode === 'position' ? (i) => (bad[i] ? 'bad' : 'ok') : undefined} />
      </div>
      <p className="demo__verdict" role="status" aria-live="polite">
        {mode === 'position'
          ? `Line by line: ${n} of 4 rows look different — but only one order actually changed.`
          : `By identifier: ${n} difference found — order 1004 has quantity 5 in File A and 4 in File B.`}
      </p>
      <p className="help">Rows shaded red are reported as different. The tables above show the four rows of each file.</p>
    </div>
  );
}

export function DiagnosticsButton() {
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildDiagnostics({ page: 'contact' })], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rowsignal-diagnostics.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <button type="button" className="btn btn--secondary" onClick={download} data-testid="diag-download">
      <Download size={18} aria-hidden="true" />
      Download diagnostics file
    </button>
  );
}

export const ISLANDS = { 'reorder-demo': ReorderDemo, diagnostics: DiagnosticsButton } as const;
export type IslandName = keyof typeof ISLANDS;
