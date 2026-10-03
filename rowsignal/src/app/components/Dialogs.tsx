import { BookMarked, Check, Download, FolderOpen, HardDrive, Keyboard, LoaderCircle, Shield, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_LIMITS, formatBytes } from '../../import/limits';
import { buildDiagnostics } from '../../shared/diagnostics';
import { storageEstimate } from '../../storage/db';
import { listProjects, listRecipes, useWorkspace, type ProjectMeta, type RecipeSummary } from '../workspace';
import { Modal } from './Modal';
import { publicHref } from '../../site.config';

const when = (ts: number) => new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Inline two-step delete: nothing is removed by a single click. */
function ConfirmButton({ label, confirmLabel, onConfirm, small = true }: { label: string; confirmLabel: string; onConfirm: () => void; small?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={`btn btn--ghost ${small ? 'btn--sm' : ''}`} onClick={() => setAsking(true)}>
        <Trash2 size={15} aria-hidden="true" />
        {label}
      </button>
    );
  }
  return (
    <span className="row" role="group" aria-label="Confirm">
      <button type="button" className={`btn btn--danger ${small ? 'btn--sm' : ''}`} onClick={() => { setAsking(false); onConfirm(); }} autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- focus follows the control the user just activated
      >
        {confirmLabel}
      </button>
      <button type="button" className={`btn btn--ghost ${small ? 'btn--sm' : ''}`} onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  );
}

// ------------------------------------------------------------------------------------------
export function ProgressDialog() {
  const ws = useWorkspace();
  const run = ws.state.run;
  const phases: Array<[string, string]> = [
    ['reading', 'Reading your files'],
    ['validating', 'Checking identifiers'],
    ['matching', 'Matching rows and comparing values'],
    ['preparing', 'Preparing results'],
  ];
  const cur = run.phase?.phase ?? 'reading';
  const idx = Math.max(0, phases.findIndex(([k]) => k === cur));
  const p = run.phase;
  const determinate = p?.total !== undefined && p.total > 0 && p.done !== undefined;
  return (
    <Modal open={run.status === 'running'} onClose={ws.cancelRun} title="Comparing files">
      <div className="stack" data-testid="progress">
        <ol className="phases">
          {phases.map(([k, label], i) => (
            <li key={k} className={i < idx ? 'is-done' : i === idx ? 'is-now' : ''} aria-current={i === idx ? 'step' : undefined}>
              {i < idx ? <Check size={16} aria-hidden="true" /> : i === idx ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <span className="phases__dot" aria-hidden="true" />}
              {label}
              {i === idx && determinate && (
                <span className="help mono"> {(p!.done ?? 0).toLocaleString('en-US')} / {(p!.total ?? 0).toLocaleString('en-US')}</span>
              )}
            </li>
          ))}
        </ol>
        <div className="progressbar" role="progressbar" aria-label="Comparison progress" aria-valuemin={0} aria-valuemax={determinate ? p!.total : undefined} aria-valuenow={determinate ? p!.done : undefined}>
          <span className={determinate ? 'progressbar__fill' : 'progressbar__fill progressbar__fill--indeterminate'} style={determinate ? { width: `${Math.min(100, ((p!.done ?? 0) / p!.total!) * 100)}%` } : undefined} />
        </div>
        <p className="help">This runs in the background in your browser. You can cancel at any time.</p>
        <button type="button" className="btn btn--secondary" onClick={ws.cancelRun}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------
export function RecipesDialog({ open, onClose, initialName }: { open: boolean; onClose: () => void; initialName: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Recipes" wide>
      <RecipesBody onClose={onClose} initialName={initialName} />
    </Modal>
  );
}

function RecipesBody({ onClose, initialName }: { onClose: () => void; initialName: string }) {
  const ws = useWorkspace();
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [name, setName] = useState(initialName || 'My recipe');
  const nameId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const both = ws.state.files.A.status === 'ready' && ws.state.files.B.status === 'ready';
  const hasRules = ws.state.config.keys.length > 0;

  const refresh = useCallback(() => listRecipes().then(setRecipes).catch(() => setRecipes([])), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
      <div className="stack">
        <p className="muted">
          A recipe remembers <strong>how you matched</strong> two files — columns by header name, rules and file settings — so next week you only add the new files. It never contains your rows.
        </p>

        {both && hasRules && (
          <form
            className="card-flat stack-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              const saved = await ws.saveRecipeAs(name);
              if (saved) void refresh();
            }}
          >
            <h3 className="h-xs">Save the current rules</h3>
            <div className="field">
              <label htmlFor={nameId}>Recipe name</label>
              <input id={nameId} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
            </div>
            <p className="help">Saved on this device only. Column names and labels can reveal business information, and anyone using this browser profile could open the recipe. Nothing is uploaded.</p>
            <div>
              <button type="submit" className="btn btn--primary" disabled={name.trim() === ''}>
                <BookMarked size={18} aria-hidden="true" />
                Save recipe
              </button>
            </div>
          </form>
        )}

        <section aria-labelledby="saved-recipes-h" className="stack-sm">
          <h3 id="saved-recipes-h" className="h-xs">
            Saved recipes
          </h3>
          {recipes === null && <p className="muted">Loading…</p>}
          {recipes && recipes.length === 0 && <p className="muted">No recipes saved yet.{!both || !hasRules ? ' Finish a comparison, then save its rules here.' : ''}</p>}
          <ul className="plain-list">
            {recipes?.map((r) => (
              <li key={r.id} className="listrow listrow--wrap" data-testid="recipe-item">
                <BookMarked size={16} aria-hidden="true" />
                <span className="listrow__main">
                  <span className="break">{r.name}</span>
                  <span className="help">Saved {when(r.savedAt)}</span>
                </span>
                <span className="row">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => { void ws.useRecipe(r.id); onClose(); }}>
                    Use with new files
                  </button>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => void ws.exportRecipe(r.id)}>
                    <Download size={15} aria-hidden="true" />
                    Export file
                  </button>
                  <ConfirmButton label="Delete" confirmLabel="Delete recipe" onConfirm={() => void ws.removeRecipe(r.id).then(refresh)} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="row">
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Choose a recipe file to import" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) { await ws.importRecipeFile(f); void refresh(); }
          }} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => fileRef.current?.click()}>
            <Upload size={15} aria-hidden="true" />
            Import a recipe file
          </button>
          {recipes && recipes.length > 0 && <ConfirmButton label="Delete all recipes" confirmLabel="Delete all recipes" onConfirm={() => void ws.wipeRecipes().then(refresh)} />}
        </div>
        <p className="help">Imported files are checked strictly and treated only as data; anything unexpected is rejected.</p>
      </div>
  );
}

// ------------------------------------------------------------------------------------------
export function SavedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const refresh = () => {
    listProjects().then(setProjects).catch(() => setProjects([]));
    listRecipes().then(setRecipes).catch(() => setRecipes([]));
    void storageEstimate().then(setUsage);
  };
  useEffect(() => {
    if (open) refresh();
  }, [open]);
  const total = projects?.reduce((n, p) => n + p.size, 0) ?? 0;

  return (
    <Modal open={open} onClose={onClose} title="Saved on this device" wide>
      <div className="stack">
        <div className="callout callout--info">
          <HardDrive size={18} aria-hidden="true" />
          <div className="callout__body">
            Saved items live in this browser on this device. They are <strong>not encrypted</strong>, so anyone who uses this browser profile could open them. They are <strong>not a backup</strong>: clearing site data or running low on space can remove them. Export results you need to keep.
          </div>
        </div>

        <section aria-labelledby="proj-h" className="stack-sm">
          <h3 id="proj-h" className="h-xs">
            Projects {projects ? `(${projects.length})` : ''}
          </h3>
          {projects && projects.length === 0 && <p className="muted">No projects saved. Use “Save project on this device” after a comparison.</p>}
          <ul className="plain-list">
            {projects?.map((p) => (
              <li key={p.id} className="listrow listrow--wrap" data-testid="project-item">
                <FolderOpen size={16} aria-hidden="true" />
                <span className="listrow__main">
                  <span className="break">{p.name}</span>
                  <span className="help">
                    {p.fileNames.A} + {p.fileNames.B} · {formatBytes(p.size)} · saved {when(p.savedAt)}
                  </span>
                </span>
                <span className="row">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => { onClose(); ws.guard(() => void ws.openProject(p.id)); }}>
                    Open
                  </button>
                  <ConfirmButton label="Delete" confirmLabel="Delete project" onConfirm={() => void ws.removeProject(p.id).then(refresh)} />
                </span>
              </li>
            ))}
          </ul>
          {projects && projects.length > 0 && <ConfirmButton label="Clear all saved projects" confirmLabel={`Delete all ${projects.length} projects`} onConfirm={() => void ws.wipeProjects().then(refresh)} small />}
        </section>

        <section aria-labelledby="rec-h" className="stack-sm">
          <h3 id="rec-h" className="h-xs">
            Recipes {recipes ? `(${recipes.length})` : ''}
          </h3>
          <p className="help">Recipes hold rules only. Manage them in the Recipes window — clearing projects does not touch them, and clearing recipes does not touch projects.</p>
          {recipes && recipes.length > 0 && <ConfirmButton label="Clear all recipes" confirmLabel={`Delete all ${recipes.length} recipes`} onConfirm={() => void ws.wipeRecipes().then(refresh)} small />}
        </section>

        <section aria-labelledby="space-h" className="stack-sm">
          <h3 id="space-h" className="h-xs">
            Space
          </h3>
          <p>
            Projects use about <strong>{formatBytes(total)}</strong>.
            {usage && (
              <>
                {' '}
                This site uses about {formatBytes(usage.usage)} of roughly {formatBytes(usage.quota)} the browser allows.
              </>
            )}
          </p>
          <p className="help">If saving fails because the device is full: delete projects you no longer need above, or export the results and delete the project.</p>
        </section>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------
export function SaveProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace();
  const { state } = ws;
  const [name, setName] = useState('');
  const [existing, setExisting] = useState<ProjectMeta[]>([]);
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const current = existing.find((p) => p.id === state.projectId);

  useEffect(() => {
    if (!open) return;
    listProjects().then((list) => {
      setExisting(list);
      const cur = list.find((p) => p.id === state.projectId);
      setName(cur?.name ?? (state.name || 'My comparison'));
      setMode(cur ? 'replace' : 'new');
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save project on this device"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || name.trim() === ''}
            onClick={async () => {
              setBusy(true);
              const meta = await ws.saveProjectAs(name, mode === 'replace' ? current?.id : undefined);
              setBusy(false);
              if (meta) onClose();
            }}
            data-testid="save-project-go"
          >
            {busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <HardDrive size={18} aria-hidden="true" />}
            Save on this device
          </button>
        </>
      }
    >
      <div className="stack">
        <p>
          This stores your <strong>two files</strong>, your rules, review notes and links in this browser so you can reopen the comparison later.
        </p>
        <div className="callout callout--warn">
          <Shield size={18} aria-hidden="true" />
          <div className="callout__body">
            It is <strong>not encrypted</strong> — anyone using this browser profile could open it. It is <strong>not a backup</strong> — the browser can clear it. Nothing is uploaded. You can delete it any time under Saved.
          </div>
        </div>
        <div className="field">
          <label htmlFor={nameId}>Project name</label>
          <input id={nameId} className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        {current && (
          <fieldset className="stack-sm">
            <legend>This comparison is already saved as “{current.name}”</legend>
            <label className="check">
              <input type="radio" name="save-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span className="check__text">Replace it with the current state (the older saved copy is overwritten)</span>
            </label>
            <label className="check">
              <input type="radio" name="save-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
              <span className="check__text">Save as a new project</span>
            </label>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ws = useWorkspace();
  const download = () => {
    const text = buildDiagnostics({ step: ws.state.step, filesLoaded: ws.state.files.A.status === 'ready' && ws.state.files.B.status === 'ready', workerRestarts: ws.workerResets() });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rowsignal-diagnostics.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal open={open} onClose={onClose} title="Help" wide>
      <div className="stack">
        <section className="stack-sm" aria-labelledby="h1">
          <h3 id="h1" className="h-xs">
            Three steps
          </h3>
          <ol>
            <li>
              <strong>Files</strong> — add two .csv or .xlsx files. Choose the sheet and header row if needed.
            </li>
            <li>
              <strong>Match rules</strong> — say which columns identify the same record, which values to compare, and how numbers and dates are written.
            </li>
            <li>
              <strong>Results</strong> — see matched pairs, differences, rows only in one file, repeated identifiers and blank identifiers. Open any row to see why.
            </li>
          </ol>
        </section>
        <section className="stack-sm" aria-labelledby="h2">
          <h3 id="h2" className="h-xs">
            <Keyboard size={16} className="inline-icon" aria-hidden="true" /> Keyboard shortcuts
          </h3>
          <dl className="shortcuts">
            <div>
              <dt>
                <kbd>/</kbd>
              </dt>
              <dd>Jump to search in the results</dd>
            </div>
            <div>
              <dt>
                <kbd>J</kbd> / <kbd>K</kbd>
              </dt>
              <dd>Next / previous row while the details panel is open</dd>
            </div>
            <div>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>Close the open window</dd>
            </div>
          </dl>
          <p className="help">Shortcuts never work while you are typing, and everything they do is also available with buttons.</p>
        </section>
        <section className="stack-sm" aria-labelledby="h3">
          <h3 id="h3" className="h-xs">
            Limits
          </h3>
          <p>
            Up to {formatBytes(DEFAULT_LIMITS.maxFileBytes)} per file, {DEFAULT_LIMITS.maxRows.toLocaleString('en-US')} rows, {DEFAULT_LIMITS.maxCols} columns and {DEFAULT_LIMITS.maxCells.toLocaleString('en-US')} filled cells per file. These are conservative starting limits that keep the page responsive.
          </p>
        </section>
        <section className="stack-sm" aria-labelledby="h4">
          <h3 id="h4" className="h-xs">
            Your data
          </h3>
          <p>
            Files are read and compared in this browser tab. They are not uploaded, and nothing is saved unless you choose to. <a href={publicHref('/privacy')}>Read the privacy page</a> and <a href={publicHref('/methodology')}>how matching works</a>.
          </p>
        </section>
        <section className="stack-sm" aria-labelledby="h5">
          <h3 id="h5" className="h-xs">
            Something wrong?
          </h3>
          <p>You can download a diagnostics file with your browser version and settings. It contains no file names, column names, values or results.</p>
          <div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={download}>
              <Download size={15} aria-hidden="true" />
              Download diagnostics
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------
export function DiscardDialog({ onSaveFirst }: { onSaveFirst: () => void }) {
  const ws = useWorkspace();
  return (
    <Modal
      open={ws.guardPending}
      onClose={() => ws.resolveGuard(false)}
      title="Replace your current work?"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => ws.resolveGuard(false)} autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- safe default inside a modal confirmation
          >
            Keep working
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => { ws.resolveGuard(false); onSaveFirst(); }}>
            Save project first
          </button>
          <button type="button" className="btn btn--danger" onClick={() => ws.resolveGuard(true)} data-testid="discard-go">
            Discard and continue
          </button>
        </>
      }
    >
      <p>
        The files, rules and notes you have open are only in memory and have not been saved on this device. Continuing replaces them, and they cannot be recovered.
      </p>
    </Modal>
  );
}
