import { ArrowLeftRight, ArrowRight, BookMarked, CircleAlert, Download, FolderOpen, Info, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PRESETS } from '../presets';
import { listProjects, listRecipes, useWorkspace, type ProjectMeta, type RecipeSummary } from '../workspace';
import { FileCard } from './FileCard';

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Only genuinely saved items are shown; with none, an honest empty state and the sample. */
function ReturnPanel({ onManage }: { onManage: () => void }) {
  const ws = useWorkspace();
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([listRecipes(), listProjects()])
      .then(([r, p]) => {
        if (!live) return;
        setRecipes(r);
        setProjects(p);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  if (error) return null;
  if (!recipes || !projects) return null;
  const empty = recipes.length === 0 && projects.length === 0;

  return (
    <section className="card return" aria-labelledby="return-h" data-testid="return-panel">
      <div className="row">
        <h2 id="return-h" className="h-sm">
          Saved on this device
        </h2>
        <span className="spacer" />
        {!empty && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onManage}>
            Manage
          </button>
        )}
      </div>
      {empty ? (
        <div className="stack-sm">
          <p className="muted">
            Nothing is saved yet. After a comparison you can save its rules as a <strong>recipe</strong> to reuse next week, or save the whole comparison as a <strong>project</strong>. Saved items appear here, and only here — they never leave this device.
          </p>
          <button type="button" className="btn btn--secondary" onClick={() => ws.guard(() => void ws.loadExample('orders', { run: true }))}>
            <Sparkles size={18} aria-hidden="true" />
            Try the sample comparison
          </button>
        </div>
      ) : (
        <div className="return__cols">
          <div>
            <h3 className="h-xs">Recipes</h3>
            {recipes.length === 0 ? (
              <p className="help">No recipes saved.</p>
            ) : (
              <ul className="plain-list">
                {recipes.slice(0, 4).map((r) => (
                  <li key={r.id} className="listrow">
                    <BookMarked size={16} aria-hidden="true" />
                    <span className="listrow__main">
                      <span className="break">{r.name}</span>
                      <span className="help">{formatWhen(r.savedAt)}</span>
                    </span>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => void ws.useRecipe(r.id)}>
                      Use with new files
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="h-xs">Projects</h3>
            {projects.length === 0 ? (
              <p className="help">No projects saved.</p>
            ) : (
              <ul className="plain-list">
                {projects.slice(0, 4).map((p) => (
                  <li key={p.id} className="listrow">
                    <FolderOpen size={16} aria-hidden="true" />
                    <span className="listrow__main">
                      <span className="break">{p.name}</span>
                      <span className="help">{formatWhen(p.savedAt)}</span>
                    </span>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => ws.guard(() => void ws.openProject(p.id))}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function FilesStep({ onManageSaved }: { onManageSaved: () => void }) {
  const ws = useWorkspace();
  const { state } = ws;
  const both = state.files.A.status === 'ready' && state.files.B.status === 'ready';
  const preset = state.preset ? PRESETS[state.preset] : null;
  const loading = state.files.A.status === 'loading' || state.files.B.status === 'loading';

  return (
    <div className="stack">
      {preset && !both && (
        <div className="callout callout--info" role="note">
          <Info size={18} aria-hidden="true" />
          <div className="callout__body">{preset.hint}</div>
        </div>
      )}
      {state.pendingRecipe && (
        <div className="callout callout--info" role="note" data-testid="pending-recipe">
          <BookMarked size={18} aria-hidden="true" />
          <div className="callout__body">
            Recipe <strong className="break">{state.pendingRecipe.name}</strong> is ready. Add both files and it will be applied — columns are found by their header names, and anything that changed is shown for you to confirm.
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => ws.dispatch({ type: 'set-pending-recipe', recipe: null })}>
            Cancel
          </button>
        </div>
      )}

      <div className="files-grid">
        <FileCard role="A" />
        <div className="files-grid__mid">
          <button type="button" className="btn btn--secondary btn--icon" onClick={() => void ws.swapFiles()} disabled={!both || ws.busy} aria-label="Swap File A and File B" title="Swap File A and File B">
            <ArrowLeftRight size={18} aria-hidden="true" />
          </button>
        </div>
        <FileCard role="B" />
      </div>

      <div className="card actions-card">
        <div className="actions-card__left">
          <button type="button" className="btn btn--secondary" onClick={() => ws.guard(() => void ws.loadExample('orders'))} disabled={ws.busy}>
            <Sparkles size={18} aria-hidden="true" />
            Use sample files
          </button>
          <div className="help sample-links">
            Download the sample files:{' '}
            <a href="/samples/orders.csv" download>
              orders.csv
            </a>
            ,{' '}
            <a href="/samples/dispatch.csv" download>
              dispatch.csv
            </a>
            ,{' '}
            <a href="/samples/orders.xlsx" download>
              orders.xlsx
            </a>
            ,{' '}
            <a href="/samples/dispatch.xlsx" download>
              dispatch.xlsx
            </a>
          </div>
        </div>
        <div className="actions-card__right">
          {!both && !loading && (
            <p className="help" id="next-help">
              <CircleAlert size={14} aria-hidden="true" className="inline-icon" /> Add both files to continue.
            </p>
          )}
          <button type="button" className="btn btn--primary btn--lg" disabled={!both || ws.busy} aria-describedby={!both ? 'next-help' : undefined} onClick={() => ws.goto('rules')} data-testid="next-rules">
            Next: Match rules
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ReturnPanel onManage={onManageSaved} />
      <p className="help center">
        <Download size={14} aria-hidden="true" className="inline-icon" /> Nothing is uploaded: files are read in this browser tab.
      </p>
    </div>
  );
}
