import { ArrowLeft, ArrowRight, BookMarked, Check, CircleAlert, Info, Layers, Plus, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import type { Analysis } from '../../engine/diagnostics';
import type { ColumnInfo, DateOrder, FieldKind, FieldRule, FileFormat, KeyRule, Role } from '../../engine/types';
import type { FileInfo } from '../../import/loadFile';
import { inputsKey } from '../state';
import { useWorkspace } from '../workspace';
import { FileId } from '../../shared/FileId';

const KIND_LABELS: Record<FieldKind, string> = {
  text: 'Text',
  identifier: 'Identifier (keeps leading zeros)',
  number: 'Number (exact decimal)',
  date: 'Date',
  boolean: 'Yes / No',
};

function exampleValues(info: FileInfo, colId: string): string {
  const idx = info.columns.findIndex((c) => c.id === colId);
  if (idx < 0) return '';
  const vals: string[] = [];
  for (const row of info.preview.rows) {
    const v = row[idx];
    if (v && v.trim() !== '' && !vals.includes(v)) vals.push(v);
    if (vals.length >= 3) break;
  }
  return vals.map((v) => (v.length > 18 ? v.slice(0, 17) + '…' : v)).join(', ');
}

function ColumnSelect({ role, label, value, onChange, info, describedBy }: { role: Role; label: string; value: string; onChange: (id: string) => void; info: FileInfo; describedBy?: string }) {
  const id = useId();
  const ex = value ? exampleValues(info, value) : '';
  return (
    <div className="field">
      <label htmlFor={id}>
        <FileId role={role} /> <span className="sr-only">column for </span>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} aria-invalid={value === '' ? true : undefined}>
        <option value="">Choose a column…</option>
        {info.columns.map((c: ColumnInfo) => (
          <option key={c.id} value={c.id}>
            {c.letter} · {c.label}
            {c.hidden ? ' (hidden)' : ''}
          </option>
        ))}
      </select>
      <p className="help examples">{ex ? <>e.g. <span className="mono">{ex}</span></> : <>&nbsp;</>}</p>
    </div>
  );
}

function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__text">
        <span>{label}</span>
        {help && <span className="help">{help}</span>}
      </span>
    </label>
  );
}

function fieldIssueText(analysis: Analysis | null, fieldId: string, role: Role): { n: number; example: string } | null {
  const f = analysis?.fieldIssues.find((x) => x.fieldId === fieldId && x.role === role);
  return f && f.unreadable > 0 ? { n: f.unreadable, example: f.examples[0] ?? '' } : null;
}

function KeyRow({ rule, index, analysis }: { rule: KeyRule; index: number; analysis: Analysis | null }) {
  const ws = useWorkspace();
  const a = ws.state.files.A.info!;
  const b = ws.state.files.B.info!;
  const patch = (p: Partial<KeyRule>) => ws.updateConfig((c) => ({ ...c, keys: c.keys.map((k) => (k.id === rule.id ? { ...k, ...p } : k)) }));
  const hints = analysis?.keyHints.filter((h) => h.keyId === rule.id) ?? [];
  const spaces = hints.filter((h) => h.outerSpaceValues > 0);
  const numeric = hints.filter((h) => h.numericStoredValues > 0);
  return (
    <li className="rule" data-testid={`key-row-${index}`}>
      <div className="rule__pair">
        <ColumnSelect role="A" label={rule.label || `Identifier ${index + 1}`} value={rule.aColumn} info={a} onChange={(id) => patch({ aColumn: id, label: rule.label.startsWith('Identifier ') || !rule.label ? (a.columns.find((c) => c.id === id)?.header ?? rule.label) : rule.label })} />
        <span className="rule__eq" aria-hidden="true">
          =
        </span>
        <ColumnSelect role="B" label={rule.label || `Identifier ${index + 1}`} value={rule.bColumn} info={b} onChange={(id) => patch({ bColumn: id })} />
        {ws.state.config.keys.length > 1 && (
          <button type="button" className="btn btn--ghost btn--icon rule__remove" onClick={() => ws.updateConfig((c) => ({ ...c, keys: c.keys.filter((k) => k.id !== rule.id) }))} aria-label={`Remove identifier ${rule.label || index + 1}`}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="rule__opts">
        <Toggle checked={rule.trim} onChange={(v) => patch({ trim: v })} label="Ignore spaces around values" help="Off by default: “ 1001” and “1001” are different." />
        <Toggle checked={rule.caseInsensitive} onChange={(v) => patch({ caseInsensitive: v })} label="Ignore upper/lower case" help="Off by default: “abc” and “ABC” are different." />
      </div>
      {spaces.length > 0 && (
        <p className="hint" role="note">
          <TriangleAlert size={15} aria-hidden="true" /> {spaces.map((h) => `${h.outerSpaceValues.toLocaleString('en-US')} value${h.outerSpaceValues === 1 ? '' : 's'} in File ${h.role}`).join(' and ')} have spaces around them. Spaces matter unless you turn on “Ignore spaces around values”.
        </p>
      )}
      {numeric.length > 0 && (
        <p className="hint" role="note">
          <Info size={15} aria-hidden="true" /> In {numeric.map((h) => `File ${h.role}`).join(' and ')} this column is stored as Excel numbers, so Excel may already have removed leading zeros (00123 becomes 123). RowSignal cannot restore them.
        </p>
      )}
    </li>
  );
}

function FieldRow({ rule, index, analysis }: { rule: FieldRule; index: number; analysis: Analysis | null }) {
  const ws = useWorkspace();
  const a = ws.state.files.A.info!;
  const b = ws.state.files.B.info!;
  const nameId = useId();
  const kindId = useId();
  const tolId = useId();
  const patch = (p: Partial<FieldRule>) => ws.updateConfig((c) => ({ ...c, fields: c.fields.map((f) => (f.id === rule.id ? { ...f, ...p } : f)) }));
  const issues = (['A', 'B'] as const).map((r) => ({ role: r, issue: fieldIssueText(analysis, rule.id, r) })).filter((x) => x.issue);
  const isText = rule.kind === 'text' || rule.kind === 'identifier';
  return (
    <li className="rule" data-testid={`field-row-${index}`}>
      <div className="rule__top">
        <div className="field rule__label">
          <label htmlFor={nameId}>Name in results</label>
          <input id={nameId} className="input" value={rule.label} maxLength={60} onChange={(e) => patch({ label: e.target.value })} />
        </div>
        <div className="field rule__kind">
          <label htmlFor={kindId}>Compare as</label>
          <select id={kindId} className="select" value={rule.kind} onChange={(e) => patch({ kind: e.target.value as FieldKind, trim: e.target.value !== 'text' && e.target.value !== 'identifier' ? true : rule.trim })}>
            {(Object.keys(KIND_LABELS) as FieldKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn--ghost btn--icon rule__remove" onClick={() => ws.updateConfig((c) => ({ ...c, fields: c.fields.filter((f) => f.id !== rule.id) }))} aria-label={`Remove ${rule.label || 'value'}`}>
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="rule__pair">
        <ColumnSelect
          role="A"
          label={rule.label || 'value'}
          value={rule.aColumn}
          info={a}
          onChange={(id) => patch({ aColumn: id, ...(rule.label.startsWith('Value ') ? { label: a.columns.find((c) => c.id === id)?.header || rule.label } : {}) })}
        />
        <span className="rule__eq" aria-hidden="true">
          =
        </span>
        <ColumnSelect role="B" label={rule.label || 'value'} value={rule.bColumn} info={b} onChange={(id) => patch({ bColumn: id })} />
      </div>
      <details className="disclosure rule__more">
        <summary>Rules for this value</summary>
        <div className="rule__opts">
          <Toggle checked={rule.trim} onChange={(v) => patch({ trim: v })} label="Ignore spaces around values" />
          {isText && <Toggle checked={rule.caseInsensitive} onChange={(v) => patch({ caseInsensitive: v })} label="Ignore upper/lower case" />}
          <Toggle checked={rule.emptyAsNull} onChange={(v) => patch({ emptyAsNull: v })} label="Treat whitespace-only cells as blank" help="A blank is never the same as zero or the text NULL." />
          {rule.kind === 'number' && (
            <div className="field tol">
              <label htmlFor={tolId}>Allowed difference</label>
              <input id={tolId} className="input mono" inputMode="decimal" value={rule.tolerance} onChange={(e) => patch({ tolerance: e.target.value })} aria-invalid={!/^\s*\d*\.?\d+\s*$|^\s*\d+\.?\s*$/.test(rule.tolerance) ? true : undefined} />
              <p className="help">0 means the numbers must be exactly equal. With 0.05, 10.00 and 10.05 count as equal; 10.06 does not. Currencies are never converted.</p>
            </div>
          )}
        </div>
      </details>
      {issues.map(({ role, issue }) => (
        <p key={role} className="hint hint--bad" role="note">
          <CircleAlert size={15} aria-hidden="true" /> {issue!.n.toLocaleString('en-US')} value{issue!.n === 1 ? '' : 's'} in File {role} cannot be read as {rule.kind === 'boolean' ? 'yes/no' : rule.kind}. They will be flagged, not treated as zero or blank. First problem: {issue!.example}
        </p>
      ))}
    </li>
  );
}

const DATE_LABELS: Record<DateOrder, string> = {
  DMY: 'Day first — DD/MM/YYYY (03/04/2026 is 3 April)',
  MDY: 'Month first — MM/DD/YYYY (03/04/2026 is 4 March)',
  YMD: 'Year first — YYYY-MM-DD',
};

function FormatCard({ role }: { role: Role }) {
  const ws = useWorkspace();
  const { state } = ws;
  const fmt = state.config.formats[role];
  const info = state.files[role].info!;
  const dateId = useId();
  const decId = useId();
  const thId = useId();
  const analysis = state.analysis && state.analysis.key === inputsKey(state) ? state.analysis.data : null;
  const hasNumber = state.config.fields.some((f) => f.kind === 'number');
  const dateFields = state.config.fields.filter((f) => f.kind === 'date');
  const needsDate = analysis?.dateOrderNeeded[role] ?? dateFields.length > 0;
  const set = (p: Partial<FileFormat>) => ws.updateConfig((c) => ({ ...c, formats: { ...c.formats, [role]: { ...c.formats[role], ...p } } }));
  const dateCol = dateFields.length ? state.hints?.columns[role].find((h) => h.columnId === (role === 'A' ? dateFields[0]!.aColumn : dateFields[0]!.bColumn)) : undefined;
  const missing = needsDate && fmt.dateOrder === null;

  return (
    <div className="format-card" data-testid={`format-${role}`}>
      <h4>
        <FileId role={role} /> <span className="break">{state.roleNames[role] || info.fileName}</span>
      </h4>
      {hasNumber && (
        <div className="settings-grid">
          <div className="field">
            <label htmlFor={decId}>Decimal separator</label>
            <select id={decId} className="select" value={fmt.decimal} onChange={(e) => set({ decimal: e.target.value as '.' | ',' })}>
              <option value=".">Point — 1,234.50</option>
              <option value=",">Comma — 1.234,50</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={thId}>Thousands separator</label>
            <select id={thId} className="select" value={fmt.thousands} onChange={(e) => set({ thousands: e.target.value as FileFormat['thousands'] })}>
              <option value=",">Comma — 1,234,567</option>
              <option value=".">Point — 1.234.567</option>
              <option value=" ">Space — 1 234 567</option>
              <option value="none">None</option>
            </select>
          </div>
          <Toggle checked={fmt.currency} onChange={(v) => set({ currency: v })} label="Ignore currency symbols" help="Reads “₹1,200” or “$1,200” as 1200. No currency is ever converted." />
        </div>
      )}
      {dateFields.length > 0 && needsDate && (
        <div className="field">
          <label htmlFor={dateId}>How dates are written in this file</label>
          <select id={dateId} className="select" value={fmt.dateOrder ?? ''} onChange={(e) => set({ dateOrder: (e.target.value || null) as DateOrder | null })} aria-invalid={missing ? true : undefined} aria-describedby={`${dateId}-h`}>
            <option value="">Choose…</option>
            {(Object.keys(DATE_LABELS) as DateOrder[]).map((o) => (
              <option key={o} value={o}>
                {DATE_LABELS[o]}
              </option>
            ))}
          </select>
          <p className="help" id={`${dateId}-h`}>
            {dateCol?.dateGuess ? dateCol.dateGuess.evidence : 'Chosen per file — never guessed from where you are.'}
            {missing && (
              <span className="error-text">
                <CircleAlert size={14} aria-hidden="true" /> Required: choose how the dates are written.
              </span>
            )}
          </p>
        </div>
      )}
      {dateFields.length > 0 && !needsDate && <p className="help">Dates in this file are real Excel dates, so no format is needed.</p>}
      {!hasNumber && dateFields.length === 0 && <p className="help">No numbers or dates are being compared, so nothing to set here.</p>}
    </div>
  );
}

function Diagnostics({ analysis, busy }: { analysis: Analysis | null; busy: boolean }) {
  const ws = useWorkspace();
  const { state } = ws;
  if (!analysis) {
    return (
      <div className="card" aria-live="polite">
        <h3 className="h-sm">Before you compare</h3>
        <p className="muted">{state.config.keys.length === 0 ? 'Choose identifier columns to see how well the two files line up.' : busy ? 'Checking your identifiers…' : 'Checking…'}</p>
      </div>
    );
  }
  const rows: Array<[string, (r: Role) => string]> = [
    ['Rows', (r) => analysis.keyStats[r].rows.toLocaleString('en-US')],
    ['Blank identifiers', (r) => analysis.keyStats[r].blankKeys.toLocaleString('en-US')],
    ['Repeated identifiers', (r) => `${analysis.keyStats[r].duplicateKeyGroups.toLocaleString('en-US')} (${analysis.keyStats[r].duplicateKeyRows.toLocaleString('en-US')} rows)`],
    ['Unique identifiers', (r) => analysis.keyStats[r].uniqueKeys.toLocaleString('en-US')],
  ];
  const dup = analysis.keyStats.A.duplicateKeyGroups + analysis.keyStats.B.duplicateKeyGroups;
  const blank = analysis.keyStats.A.blankKeys + analysis.keyStats.B.blankKeys;
  const o = analysis.overlap;
  return (
    <div className="card diag" data-testid="diagnostics">
      <h3 className="h-sm">Before you compare</h3>
      <p>
        <strong>{o.both.toLocaleString('en-US')}</strong> identifier{o.both === 1 ? '' : 's'} appear in both files, <strong>{o.onlyA.toLocaleString('en-US')}</strong> only in File A, <strong>{o.onlyB.toLocaleString('en-US')}</strong> only in File B.
      </p>
      <div className="table-scroll">
        <table className="dt">
          <caption className="sr-only">Identifier statistics for each file</caption>
          <thead>
            <tr>
              <th scope="col">Identifier check</th>
              <th scope="col">
                <FileId role="A" />
              </th>
              <th scope="col">
                <FileId role="B" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{f('A')}</td>
                <td className="num">{f('B')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dup > 0 && (
        <div className="callout callout--warn">
          <Layers size={18} aria-hidden="true" />
          <div className="callout__body">
            <strong>Some identifiers repeat.</strong> RowSignal will not guess which rows belong together; repeated identifiers are reported as ambiguous. The usual fix is a second identifier column (for example a product code).
            <div className="callout__action">
              <button type="button" className="btn btn--secondary btn--sm" onClick={ws.addKey}>
                <Plus size={16} aria-hidden="true" />
                Add another identifier column
              </button>
            </div>
          </div>
        </div>
      )}
      {blank > 0 && (
        <p className="hint" role="note">
          <Info size={15} aria-hidden="true" /> {blank.toLocaleString('en-US')} row{blank === 1 ? ' has' : 's have'} a blank identifier. They are never matched; they appear under Invalid keys.
        </p>
      )}
      <p className="hint" role="note">
        <Info size={15} aria-hidden="true" /> Rows are matched by identifier, never by their position in the file, so the order of rows does not matter.
      </p>
    </div>
  );
}

function SchemaPanel() {
  const ws = useWorkspace();
  const { state } = ws;
  const schema = state.schema;
  if (!schema) return null;
  const open = schema.issues.filter((i) => {
    const rule = [...state.config.keys, ...state.config.fields].find((r) => r.id === i.ruleId);
    return rule ? (i.role === 'A' ? rule.aColumn : rule.bColumn) === '' : false;
  });
  const info = (r: Role) => state.files[r].info!;
  const choose = (i: (typeof open)[number], colId: string) =>
    ws.updateConfig((c) => ({
      ...c,
      keys: c.keys.map((k) => (k.id === i.ruleId ? { ...k, [i.role === 'A' ? 'aColumn' : 'bColumn']: colId } : k)),
      fields: c.fields.map((f) => (f.id === i.ruleId ? { ...f, [i.role === 'A' ? 'aColumn' : 'bColumn']: colId } : f)),
    }));
  const extra = schema.newColumns.A.length + schema.newColumns.B.length;
  return (
    <section className={`callout ${open.length ? 'callout--warn' : 'callout--ok'} schema`} aria-labelledby="schema-h" data-testid="schema-panel">
      {open.length ? <TriangleAlert size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
      <div className="callout__body stack-sm">
        <h3 id="schema-h" className="h-sm">
          {schema.recipeName ? `Recipe “${schema.recipeName}”` : 'Your rules'} applied to the new files
        </h3>
        {open.length === 0 ? (
          <p>All the columns your rules use were found by name. Check the rules below, then compare.</p>
        ) : (
          <>
            <p>
              {open.length} column{open.length === 1 ? '' : 's'} could not be matched by name. RowSignal never guesses by position — choose what each one is now.
            </p>
            <ul className="plain-list">
              {open.map((i) => (
                <li key={`${i.ruleId}-${i.role}`} className="schema__issue">
                  <p>
                    <FileId role={i.role} /> {i.message}
                  </p>
                  <div className="row">
                    {i.candidates.map((cid) => (
                      <button key={cid} type="button" className="btn btn--secondary btn--sm" onClick={() => choose(i, cid)}>
                        Use “{info(i.role).columns.find((c) => c.id === cid)?.label}”
                      </button>
                    ))}
                    <SchemaPicker columns={info(i.role).columns} onPick={(cid) => choose(i, cid)} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {extra > 0 && (
          <details className="disclosure">
            <summary>
              {extra} column{extra === 1 ? '' : 's'} in the new files {extra === 1 ? 'is' : 'are'} not used by your rules
            </summary>
            <p className="help">
              {schema.newColumns.A.length > 0 && <>File A: {schema.newColumns.A.join(', ')}. </>}
              {schema.newColumns.B.length > 0 && <>File B: {schema.newColumns.B.join(', ')}.</>}
            </p>
          </details>
        )}
      </div>
      <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => ws.dispatch({ type: 'clear-schema' })} aria-label="Dismiss this notice">
        <X size={16} aria-hidden="true" />
      </button>
    </section>
  );
}

function SchemaPicker({ columns, onPick }: { columns: ColumnInfo[]; onPick: (id: string) => void }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Choose another column
      </label>
      <select id={id} className="select select--sm" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="">Choose another column…</option>
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.letter} · {c.label}
          </option>
        ))}
      </select>
    </>
  );
}

function Section({ n, title, intro, children }: { n: number; title: string; intro?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="card section" aria-labelledby={id}>
      <h3 id={id} className="section__title">
        <span className="section__n" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      {intro && <p className="muted section__intro">{intro}</p>}
      {children}
    </section>
  );
}

export function RulesStep({ onSaveRecipe }: { onSaveRecipe: () => void }) {
  const ws = useWorkspace();
  const { state } = ws;
  const key = inputsKey(state);
  const analysis = state.analysis && state.analysis.key === key ? state.analysis.data : null;
  const suggestions = state.hints?.mapping;
  const canSuggest = state.suggestionsOffered && suggestions && state.config.keys.length === 0 && state.config.fields.length === 0 && suggestions.keys.length + suggestions.fields.length > 0;
  const blockers = ws.blockers;
  const running = state.run.status === 'running';
  const hasFormat = useMemo(() => state.config.fields.some((f) => f.kind === 'number' || f.kind === 'date'), [state.config.fields]);
  const a = state.files.A.info;
  const b = state.files.B.info;
  if (!a || !b) return null;

  return (
    <div className="rules-layout">
      <div className="stack rules-main">
        <SchemaPanel />
        {canSuggest && (
          <div className="callout callout--info" data-testid="suggestion-banner">
            <Sparkles size={18} aria-hidden="true" />
            <div className="callout__body">
              <strong>We can suggest column pairs from the column names.</strong> {suggestions.keys.length + suggestions.fields.length} pair{suggestions.keys.length + suggestions.fields.length === 1 ? '' : 's'} found. Nothing is applied until you choose, and you can change every pair afterwards.
              <div className="callout__action row">
                <button type="button" className="btn btn--primary btn--sm" onClick={ws.applySuggestedMapping} data-testid="apply-suggestions">
                  Use suggested pairs
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => ws.dispatch({ type: 'dismiss-suggestions' })}>
                  No thanks
                </button>
              </div>
            </div>
          </div>
        )}

        <Section n={1} title="Which columns identify the same record?" intro={<>Pick the columns that hold an ID, SKU, email or similar. Use two columns together when one is not enough — for example <em>Order ID + SKU</em>.</>}>
          <ul className="rules" aria-label="Identifier columns">
            {state.config.keys.map((k, i) => (
              <KeyRow key={k.id} rule={k} index={i} analysis={analysis} />
            ))}
          </ul>
          <div className="row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={ws.addKey} data-testid="add-key">
              <Plus size={16} aria-hidden="true" />
              {state.config.keys.length === 0 ? 'Add identifier columns' : 'Add another identifier column'}
            </button>
          </div>
        </Section>

        <Section n={2} title="Which values should we compare?" intro="Choose the columns whose values should agree once two rows are paired. Leave this empty to only find missing and duplicate records.">
          <ul className="rules" aria-label="Values to compare">
            {state.config.fields.map((f, i) => (
              <FieldRow key={f.id} rule={f} index={i} analysis={analysis} />
            ))}
          </ul>
          {state.config.fields.length === 0 && <p className="help">No values selected yet.</p>}
          <div className="row">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => ws.addField('text')} data-testid="add-field">
              <Plus size={16} aria-hidden="true" />
              Add a value to compare
            </button>
          </div>
        </Section>

        <Section n={3} title="How should we handle formatting?" intro="Text numbers and dates are read using the settings for each file below. Numbers and dates that Excel stored as real numbers or dates are used exactly as stored.">
          {hasFormat ? (
            <div className="format-grid">
              <FormatCard role="A" />
              <FormatCard role="B" />
            </div>
          ) : (
            <p className="help">Nothing to set: no numbers or dates are being compared. Text is compared exactly, with the options above.</p>
          )}
        </Section>
      </div>

      <aside className="rules-side stack" aria-label="Checks and actions">
        <Diagnostics analysis={analysis} busy={ws.busy} />
        <div className="card runbar" data-testid="runbar">
          {blockers.length > 0 ? (
            <div id="compare-blockers" className="callout callout--warn">
              <CircleAlert size={18} aria-hidden="true" />
              <div className="callout__body">
                <strong>Before comparing:</strong>
                <ul>
                  {blockers.slice(0, 5).map((bl) => (
                    <li key={bl.id}>{bl.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="help">
              <Check size={14} aria-hidden="true" className="inline-icon" /> Ready to compare.
            </p>
          )}
          {state.run.status === 'error' && (
            <div className="callout callout--error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <div className="callout__body">{state.run.error}</div>
            </div>
          )}
          <button type="button" className="btn btn--primary btn--lg runbar__go" disabled={blockers.length > 0 || running} aria-describedby={blockers.length ? 'compare-blockers' : undefined} onClick={() => void ws.compare()} data-testid="compare-btn">
            Compare files
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => ws.goto('files')}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to files
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onSaveRecipe} disabled={state.config.keys.length === 0}>
              <BookMarked size={16} aria-hidden="true" />
              Save as recipe
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
