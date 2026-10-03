import { ArrowRight, CircleCheck, Download, Lock, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Category, ResultRow } from '../engine/types';
import { CATEGORY_META, StatusBadge } from '../shared/status';
import { FieldCell, keyDisplay, rowsDisplay } from '../shared/resultCells';
import { summarySentence } from '../shared/summary';
import type { ExampleRun } from '../sample/runExample';
import { adsConfigured } from './ads';
import { FileId } from '../shared/FileId';
import { ROUTES } from './routes';

const ORDER: Record<Category, number> = { matched: 0, different: 1, 'only-a': 2, 'only-b': 3, ambiguous: 4, invalid: 5 };

export function LaunchButton({ href, children, variant = 'primary', size = 'lg' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary'; size?: 'lg' | 'md' }) {
  return (
    <a className={`btn btn--${variant} ${size === 'lg' ? 'btn--lg' : ''}`} href={href}>
      {children}
    </a>
  );
}

/** Static result table: same cells, badges and wording as the workspace, from a real engine run. */
export function StaticResultTable({ run, only, caption }: { run: ExampleRun; only?: string[]; caption: string }) {
  const rows: ResultRow[] = [...run.result.rows].sort((a, b) => ORDER[a.category] - ORDER[b.category]).filter((r) => !only || only.includes(keyDisplay(r)));
  return (
    <div className="table-scroll static-table" tabIndex={0} role="region" aria-label={caption}>
      <table className="dt">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Identifier</th>
            <th scope="col">Status</th>
            <th scope="col">Source rows</th>
            {run.fields.map((f) => (
              <th key={f.id} scope="col">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="mono">
                {keyDisplay(r) || <span className="blank">(blank)</span>}
              </th>
              <td>
                <StatusBadge row={r} />
              </td>
              <td className="mono">{rowsDisplay(r)}</td>
              {run.fields.map((f, i) => (
                <td key={f.id}>
                  <FieldCell row={r} index={i} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InputTable({ run, role }: { run: ExampleRun; role: 'A' | 'B' }) {
  const t = run.tables[role];
  const info = run.info[role];
  return (
    <div className="example__file">
      <h4>
        <FileId role={role} />
        <span className="break">{info.fileName}</span>
        <span className="muted">
          {info.sheet ? ` · sheet “${info.sheet}”` : ''}
          {info.kind === 'xlsx' && info.headerRow && info.headerRow > 1 ? ` · headers on row ${info.headerRow}` : ''}
        </span>
      </h4>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`Rows of ${info.fileName}`}>
        <table className="dt">
          <caption className="sr-only">Rows of {info.fileName}</caption>
          <thead>
            <tr>
              <th scope="col">Row</th>
              {t.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                <th scope="row" className="num">
                  {t.rowNumbers[i]}
                </th>
                {r.map((c, j) => (
                  <td key={j} className="mono">
                    {c.trim() === '' ? <span className="blank">(blank)</span> : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A worked example: the two input files and the result, all computed by the engine. */
export function WorkedExample({ run, title, children, launch = true }: { run: ExampleRun; title: string; children?: ReactNode; launch?: boolean }) {
  return (
    <figure className="example" data-example={run.example.id}>
      <figcaption>
        <strong>{title}</strong>
      </figcaption>
      <div className="example__inputs">
        <InputTable run={run} role="A" />
        <InputTable run={run} role="B" />
      </div>
      {children}
      <p className="example__sentence">{summarySentence(run.result.summary)}</p>
      <StaticResultTable run={run} caption={`Result of comparing ${run.info.A.fileName} with ${run.info.B.fileName}`} />
      {launch && (
        <div>
          <a className="btn btn--secondary btn--sm" href={`/app/?example=${run.example.id}`}>
            <Sparkles size={15} aria-hidden="true" />
            Open this example in RowSignal
          </a>
        </div>
      )}
    </figure>
  );
}

export function HeroPreview({ run }: { run: ExampleRun }) {
  const s = run.result.summary;
  const show = ['1001', '1004', '1007'];
  const chips: Array<[Category, number]> = [
    ['matched', s.matched],
    ['different', s.different],
    ['only-a', s.onlyA],
    ['only-b', s.onlyB],
    ['ambiguous', s.ambiguousGroups],
    ['invalid', s.invalidA + s.invalidB],
  ];
  return (
    <div className="preview-card" aria-label="Preview of a sample comparison" data-testid="hero-preview">
      <div className="preview-card__head">
        <span className="badge badge--info">Sample data</span>
        <span className="muted help">Orders vs dispatch, computed by the same engine the app uses</span>
      </div>
      <p className="preview-card__sentence">{summarySentence(s)}</p>
      <div className="mini-counts">
        {chips.map(([c, n]) => {
          const m = CATEGORY_META[c];
          return (
            <span key={c} className={`badge badge--${m.tone}`}>
              <m.Icon size={14} aria-hidden="true" />
              {m.label} {n}
            </span>
          );
        })}
      </div>
      <StaticResultTable run={run} only={show} caption="Three rows from the sample comparison: one matched, one with a changed quantity, one missing from the dispatch file" />
      <p className="help">
        Showing 3 of {run.result.rows.length} result rows.
      </p>
    </div>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: ReactNode }> }) {
  return (
    <div className="faq">
      {items.map((it) => (
        <details key={it.q}>
          <summary>{it.q}</summary>
          <div>{it.a}</div>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title = 'Find out what changed.', text = 'Open the workspace and add two files, or try the sample first. No account, nothing uploaded.', preset }: { title?: string; text?: string; preset?: string }) {
  return (
    <section className="cta-band" aria-labelledby="cta-h">
      <div className="container">
        <h2 id="cta-h">{title}</h2>
        <p>{text}</p>
        <div className="hero__actions">
          <LaunchButton href={preset ? `/app/?preset=${preset}` : '/app/'} variant="primary">
            Compare my files
            <ArrowRight size={18} aria-hidden="true" />
          </LaunchButton>
          <LaunchButton href="/app/?sample=1" variant="secondary">
            Try sample comparison
          </LaunchButton>
        </div>
      </div>
    </section>
  );
}

/** Renders nothing unless the owner has enabled advertising AND supplied a publisher id. */
export function AdSlot({ id }: { id: string }) {
  if (!adsConfigured()) return null;
  return <aside className="ad-slot" aria-label="Advertisement" data-ad-slot={id} />;
}

export function TrustList() {
  return (
    <ul className="trust" aria-label="What to expect">
      <li>
        <CircleCheck size={18} aria-hidden="true" />
        No account needed
      </li>
      <li>
        <Lock size={18} aria-hidden="true" />
        Files processed on this device
      </li>
      <li>
        <Download size={18} aria-hidden="true" />
        Export your results
      </li>
    </ul>
  );
}

export function RelatedLinks({ paths }: { paths: string[] }) {
  const items = paths.map((p) => ROUTES.find((r) => r.path === p)).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <ul>
      {items.map((r) => (
        <li key={r.path}>
          <a href={r.path}>{r.label}</a>
        </li>
      ))}
    </ul>
  );
}
