import { BookMarked, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Columns3, Download, FolderOpen, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CATEGORIES, type Category, type ComparisonResult, type ResultRow } from '../../engine/types';
import { CATEGORY_META } from '../../shared/status';
import { summarySentence } from '../../shared/summary';
import { useWorkspace } from '../workspace';
import { DetailDialog } from './DetailDialog';
import { ExportDialog } from './ExportDialog';
import { FileId } from '../../shared/FileId';
import { PossibleMatches } from './PossibleMatches';
import { ResultCards } from './ResultCards';
import { ResultTable, keyDisplay, type SortKey, type SortState } from './ResultTable';

const CATEGORY_ORDER: Record<Category, number> = { different: 0, 'only-a': 1, 'only-b': 2, ambiguous: 3, invalid: 4, matched: 5 };
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const PAGE_SIZE = 50;

interface Breakdown {
  matched: number;
  different: number;
  only: number;
  ambiguous: number;
  invalid: number;
  total: number;
}

function breakdown(rows: readonly ResultRow[], side: 'A' | 'B'): Breakdown {
  const b: Breakdown = { matched: 0, different: 0, only: 0, ambiguous: 0, invalid: 0, total: 0 };
  for (const r of rows) {
    const n = side === 'A' ? r.aIdx.length : r.bIdx.length;
    if (n === 0) continue;
    b.total += n;
    if (r.category === 'matched') b.matched += n;
    else if (r.category === 'different') b.different += n;
    else if (r.category === 'only-a' || r.category === 'only-b') b.only += n;
    else if (r.category === 'ambiguous') b.ambiguous += n;
    else b.invalid += n;
  }
  return b;
}

const SEGMENTS: Array<{ key: keyof Omit<Breakdown, 'total'>; label: string; cls: string }> = [
  { key: 'matched', label: 'matched', cls: 'seg--good' },
  { key: 'different', label: 'in pairs with differences', cls: 'seg--warn' },
  { key: 'only', label: 'only in this file', cls: 'seg--info' },
  { key: 'ambiguous', label: 'in duplicate-key groups', cls: 'seg--amb' },
  { key: 'invalid', label: 'with invalid keys', cls: 'seg--bad' },
];

function RowBar({ role, b }: { role: 'A' | 'B'; b: Breakdown }) {
  const text = `File ${role}, ${b.total} rows: ${SEGMENTS.filter((s) => b[s.key] > 0)
    .map((s) => `${b[s.key]} ${s.label}`)
    .join(', ')}`;
  return (
    <div className="rowbar">
      <span className="rowbar__label">
        <FileId role={role} />
        <span className="mono">{b.total.toLocaleString('en-US')} rows</span>
      </span>
      <div className="rowbar__bar" role="img" aria-label={text}>
        {SEGMENTS.map((s) =>
          b[s.key] > 0 ? (
            <span key={s.key} className={`seg ${s.cls}`} title={`${b[s.key]} ${s.label}`} style={{ flexGrow: b[s.key] }} />
          ) : null,
        )}
      </div>
    </div>
  );
}

function AccountingTable({ result }: { result: ComparisonResult }) {
  const rows = (['A', 'B'] as const).map((side) => ({ side, b: breakdown(result.rows, side), acc: result.accounting[side] }));
  return (
    <div className="stack-sm">
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Row accounting table">
        <table className="dt">
          <caption className="sr-only">How the rows of each file add up</caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Rows compared</th>
              <th scope="col">In matched pairs</th>
              <th scope="col">In pairs with differences</th>
              <th scope="col">Only in this file</th>
              <th scope="col">In duplicate groups</th>
              <th scope="col">Invalid keys</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ side, b, acc }) => (
              <tr key={side}>
                <th scope="row">
                  <FileId role={side} />
                </th>
                <td className="num">{acc.eligible.toLocaleString('en-US')}</td>
                <td className="num">{b.matched}</td>
                <td className="num">{b.different}</td>
                <td className="num">{b.only}</td>
                <td className="num">{b.ambiguous}</td>
                <td className="num">{b.invalid}</td>
                <td className="num">
                  {b.total.toLocaleString('en-US')} {acc.balanced ? <CircleCheck size={14} className="inline-icon" aria-label="balanced" /> : <CircleAlert size={14} className="inline-icon" aria-label="not balanced" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="help">
        Pairs use one row from each file; a duplicate-key group can hold several rows of each file. Rows left out before comparing — File A: {result.accounting.A.skippedBlank} blank, {result.accounting.A.aboveHeader} above the header; File B: {result.accounting.B.skippedBlank} blank, {result.accounting.B.aboveHeader} above the header.
      </p>
    </div>
  );
}

export function ResultsStep({ onSaveRecipe, onSaveProject }: { onSaveRecipe: () => void; onSaveProject: () => void }) {
  const ws = useWorkspace();
  const { state } = ws;
  const result = state.result!;
  const stale = ws.stale;
  const [cats, setCats] = useState<Category[]>([]);
  const [review, setReview] = useState<'all' | 'followup' | 'reviewed' | 'unreviewed'>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortState>({ key: 'default', dir: 'asc' });
  const [hiddenFields, setHiddenFields] = useState<string[]>([]);
  const [pinKey, setPinKey] = useState(true);
  const [mode, setMode] = useState<'scroll' | 'pages' | 'cards'>(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches ? 'cards' : 'scroll'));
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [nextDismissed, setNextDismissed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const reviewId = useId();

  const fields = useMemo(() => result.config.fields.map((rule, index) => ({ rule, index })), [result.config.fields]);
  const shownFields = fields.filter((f) => !hiddenFields.includes(f.rule.id));

  const searchIndex = useMemo(() => {
    if (deferredQuery.trim() === '') return null;
    return result.rows.map((r) => [keyDisplay(r), ...(r.aVals ?? []), ...(r.bVals ?? []), r.summary, ...r.aRows.map(String), ...r.bRows.map(String)].join('\u0001').toLowerCase());
  }, [result.rows, deferredQuery === '']); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let list: ResultRow[] = [];
    result.rows.forEach((r, i) => {
      if (cats.length && !cats.includes(r.category)) return;
      const ann = state.annotations[r.id];
      if (review === 'followup' && ann?.flag !== 'followup') return;
      if (review === 'reviewed' && ann?.flag !== 'reviewed') return;
      if (review === 'unreviewed' && ann?.flag) return;
      if (q && searchIndex && !searchIndex[i]!.includes(q)) return;
      list.push(r);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const firstRow = (r: ResultRow) => Math.min(r.aRows[0] ?? Infinity, r.bRows[0] ?? Infinity);
    const val = (r: ResultRow, fi: number) => (r.aVals?.[fi] ?? r.bVals?.[fi] ?? '');
    if (sort.key === 'default') list.sort((x, y) => CATEGORY_ORDER[x.category] - CATEGORY_ORDER[y.category] || firstRow(x) - firstRow(y));
    else if (sort.key === 'key') list = [...list].sort((x, y) => dir * collator.compare(keyDisplay(x), keyDisplay(y)));
    else if (sort.key === 'status') list = [...list].sort((x, y) => dir * (CATEGORY_ORDER[x.category] - CATEGORY_ORDER[y.category]) || firstRow(x) - firstRow(y));
    else if (sort.key === 'rowA' || sort.key === 'rowB') list = [...list].sort((x, y) => dir * (firstRow(x) - firstRow(y)));
    else if (sort.key.startsWith('field:')) {
      const id = sort.key.slice(6);
      const fi = result.config.fields.findIndex((f) => f.id === id);
      list = [...list].sort((x, y) => dir * collator.compare(val(x, fi), val(y, fi)));
    }
    return list;
  }, [result, cats, review, deferredQuery, searchIndex, sort, state.annotations]);

  const filtersActive = cats.length > 0 || review !== 'all' || query.trim() !== '';
  const perPage = mode === 'cards' ? PAGE_SIZE / 2 : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => setPage(0), [cats, review, deferredQuery, sort]);
  const ids = useMemo(() => filtered.map((r) => r.id), [filtered]);

  // "/" jumps to search, unless typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && t && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const s = result.summary;
  const counts: Record<Category, number> = { matched: s.matched, different: s.different, 'only-a': s.onlyA, 'only-b': s.onlyB, ambiguous: s.ambiguousGroups, invalid: s.invalidA + s.invalidB };
  const aBreak = breakdown(result.rows, 'A');
  const bBreak = breakdown(result.rows, 'B');
  const onSort = (k: SortKey) => setSort((cur) => (cur.key === k ? { key: k, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }));
  const sentence = summarySentence(s);
  const noRows = result.rows.length === 0;
  const allClean = !noRows && s.different + s.onlyA + s.onlyB + s.ambiguousGroups + s.invalidA + s.invalidB === 0;

  return (
    <div className="stack results" data-testid="results">
      {stale && (
        <div className="callout callout--warn stale" role="alert" data-testid="stale-banner">
          <CircleAlert size={18} aria-hidden="true" />
          <div className="callout__body">
            <strong>These results are out of date.</strong> Your files or rules changed after this comparison ran. Details, links and exports are paused until you run it again.
            <div className="callout__action row">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void ws.compare()} disabled={ws.busy || ws.blockers.length > 0}>
                <RefreshCw size={16} aria-hidden="true" />
                Run comparison again
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => ws.goto('rules')}>
                Review rules
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="card summary" aria-labelledby="sum-h">
        <div className="row">
          <h2 id="sum-h" className="h-sm">
            Comparison summary
          </h2>
          {state.sample && <span className="badge badge--info">Sample data</span>}
          <span className="spacer" />
          <span className="help mono">{(result.elapsedMs / 1000).toFixed(2)} s</span>
        </div>
        <p className="summary__sentence" data-testid="summary-sentence">
          {sentence}
        </p>
        {result.warnings.length > 0 && (
          <ul className="notes">
            {result.warnings.map((w) => (
              <li className="note" key={w}>
                <CircleAlert size={16} aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="chips" role="group" aria-label="Filter results by category">
          {CATEGORIES.map((c) => {
            const meta = CATEGORY_META[c];
            const on = cats.includes(c);
            return (
              <button key={c} type="button" className={`chip chip--${meta.tone}`} aria-pressed={on} onClick={() => setCats((cur) => (on ? cur.filter((x) => x !== c) : [...cur, c]))} data-testid={`chip-${c}`}>
                <meta.Icon size={18} aria-hidden="true" />
                <span className="chip__text">
                  <span className="chip__label">{meta.label}</span>
                  <span className="chip__count">
                    <strong className="mono">{counts[c].toLocaleString('en-US')}</strong> {counts[c] === 1 ? meta.unit.replace(/s$/, '').replace('rows', 'row') : meta.unit}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="help">Pairs, rows and groups are different units, so they are not added together. File rows are accounted for below.</p>

        <div className="rowbars" aria-label="Where every row of each file ended up">
          <RowBar role="A" b={aBreak} />
          <RowBar role="B" b={bBreak} />
          <ul className="legend" aria-label="Legend">
            {SEGMENTS.map((sg) => (
              <li key={sg.key}>
                <span className={`seg seg--key ${sg.cls}`} aria-hidden="true" />
                {sg.label}
              </li>
            ))}
          </ul>
        </div>
        <details className="disclosure">
          <summary>How the rows add up</summary>
          <AccountingTable result={result} />
        </details>
      </section>

      <section aria-labelledby="table-h" className="stack-sm">
        <div className="toolbar">
          <h2 id="table-h" className="h-sm">
            Results
          </h2>
          <span className="spacer" />
          <div className="field toolbar__search">
            <label className="sr-only" htmlFor={searchId}>
              Search results
            </label>
            <div className="searchbox">
              <Search size={16} aria-hidden="true" />
              <input id={searchId} ref={searchRef} className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search identifier or values  ( / )" />
            </div>
          </div>
          <div className="field">
            <label className="sr-only" htmlFor={reviewId}>
              Filter by your review
            </label>
            <select id={reviewId} className="select select--sm" value={review} onChange={(e) => setReview(e.target.value as typeof review)}>
              <option value="all">All review states</option>
              <option value="followup">Needs follow-up</option>
              <option value="reviewed">Reviewed</option>
              <option value="unreviewed">Not reviewed</option>
            </select>
          </div>
          <details className="menu">
            <summary className="btn btn--secondary btn--sm">
              <Columns3 size={16} aria-hidden="true" />
              Columns
            </summary>
            <div className="menu__panel card">
              <label className="check">
                <input type="checkbox" checked={pinKey} onChange={(e) => setPinKey(e.target.checked)} />
                <span className="check__text">Pin identifier column</span>
              </label>
              <hr />
              {fields.length === 0 && <p className="help">No compared values.</p>}
              {fields.map(({ rule }) => (
                <label className="check" key={rule.id}>
                  <input type="checkbox" checked={!hiddenFields.includes(rule.id)} onChange={(e) => setHiddenFields((h) => (e.target.checked ? h.filter((x) => x !== rule.id) : [...h, rule.id]))} />
                  <span className="check__text">{rule.label}</span>
                </label>
              ))}
            </div>
          </details>
          <div className="segmented segmented--sm" role="group" aria-label="Table layout">
            <button type="button" className={`segmented__opt ${mode === 'scroll' ? 'is-on' : ''}`} aria-pressed={mode === 'scroll'} onClick={() => setMode('scroll')}>
              Scrolling
            </button>
            <button type="button" className={`segmented__opt ${mode === 'pages' ? 'is-on' : ''}`} aria-pressed={mode === 'pages'} onClick={() => setMode('pages')}>
              Pages
            </button>
            <button type="button" className={`segmented__opt ${mode === 'cards' ? 'is-on' : ''}`} aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>
              Cards
            </button>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setExportOpen(true)} disabled={stale} data-testid="export-open">
            <Download size={16} aria-hidden="true" />
            Export
          </button>
        </div>

        <p className="help" role="status" data-testid="shown-count">
          Showing <strong>{filtered.length.toLocaleString('en-US')}</strong> of <strong>{result.rows.length.toLocaleString('en-US')}</strong> result rows
          {filtersActive && (
            <>
              {' '}
              ·{' '}
              <button type="button" className="linklike" onClick={() => { setCats([]); setReview('all'); setQuery(''); }}>
                <X size={13} aria-hidden="true" className="inline-icon" /> Clear filters
              </button>
            </>
          )}
        </p>

        {noRows ? (
          <div className="card empty" data-testid="empty-none">
            <h3>No comparable data</h3>
            <p className="muted">Neither file had any rows with an identifier to compare. Check the header row and the identifier columns in the match rules.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty" data-testid="empty-filter">
            <h3>No rows match these filters</h3>
            <p className="muted">The comparison itself found {result.rows.length.toLocaleString('en-US')} result rows. Clear the filters or change the search to see them.</p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setCats([]); setReview('all'); setQuery(''); }}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className={stale ? 'is-stale' : ''} {...(stale ? { inert: true } : {})}>
            {mode === 'cards' ? (
              <ResultCards rows={filtered} fields={shownFields} annotations={state.annotations} onOpen={setDetailId} page={page} pageSize={PAGE_SIZE / 2} caption="Comparison results as cards" />
            ) : (
              <ResultTable rows={filtered} fields={shownFields} annotations={state.annotations} pinKey={pinKey} sort={sort} onSort={onSort} onOpen={setDetailId} mode={mode} page={page} pageSize={PAGE_SIZE} selectedId={detailId} caption="Comparison results" />
            )}
          </div>
        )}

        {allClean && !filtersActive && (
          <div className="callout callout--ok" data-testid="all-clean">
            <CircleCheck size={18} aria-hidden="true" />
            <div className="callout__body">No differences found: every paired record agrees, and no rows were left unmatched, duplicated or invalid.</div>
          </div>
        )}

        {(mode === 'pages' || mode === 'cards') && filtered.length > 0 && (
          <nav className="pager" aria-label="Result pages">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <span className="help" role="status">
              Page {page + 1} of {pageCount}
            </span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        )}
      </section>

      {!stale && <PossibleMatches />}

      {!nextDismissed && (
        <section className="card nextactions" aria-labelledby="next-h" data-testid="next-actions">
          <div className="row">
            <h2 id="next-h" className="h-sm">
              What next?
            </h2>
            <span className="spacer" />
            <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => setNextDismissed(true)} aria-label="Hide this suggestion">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="muted">Doing this again next week? Save the rules as a recipe and the next comparison is two files and one click.</p>
          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={onSaveRecipe}>
              <BookMarked size={18} aria-hidden="true" />
              Save these rules as a recipe
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setExportOpen(true)} disabled={stale}>
              <Download size={18} aria-hidden="true" />
              Export a follow-up list
            </button>
            {!state.sample && (
              <button type="button" className="btn btn--secondary" onClick={onSaveProject}>
                <FolderOpen size={18} aria-hidden="true" />
                Save project on this device
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => ws.goto('rules')}>
              Adjust rules
            </button>
          </div>
        </section>
      )}

      <DetailDialog rowId={detailId} ids={ids} onNavigate={setDetailId} onClose={() => setDetailId(null)} />
      <ExportDialog key={exportOpen ? 'open' : 'closed'} open={exportOpen} onClose={() => setExportOpen(false)} filteredIds={ids} filtersActive={filtersActive} totalRows={result.rows.length} />
      {ws.busy && state.run.status === 'running' && <LoaderCircle className="sr-only" aria-hidden="true" />}
    </div>
  );
}
