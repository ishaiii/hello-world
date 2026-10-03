import { BookMarked, CircleHelp, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brand } from '../shared/Logo';
import { FeedbackProvider } from './feedback';
import { DiscardDialog, HelpDialog, ProgressDialog, RecipesDialog, SaveProjectDialog, SavedDialog } from './components/Dialogs';
import { FilesStep } from './components/FilesStep';
import { ResultsStep } from './components/ResultsStep';
import { RulesStep } from './components/RulesStep';
import { useWorkspace, WorkspaceProvider } from './workspace';
import type { Step } from './state';
import { publicHref } from '../site.config';

const STEPS: Array<{ id: Step; label: string; sub: string }> = [
  { id: 'files', label: 'Files', sub: 'Add two files' },
  { id: 'rules', label: 'Match rules', sub: 'Choose how rows match' },
  { id: 'results', label: 'Results', sub: 'Review differences' },
];

function Shell() {
  const ws = useWorkspace();
  const { state } = ws;
  const [dialog, setDialog] = useState<null | 'recipes' | 'saved' | 'help' | 'save-project'>(null);
  const both = state.files.A.status === 'ready' && state.files.B.status === 'ready';

  useEffect(() => {
    // Keep the browser from navigating to a file that is dropped outside a drop zone.
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  const can = (s: Step) => s === 'files' || (s === 'rules' && both) || (s === 'results' && state.result !== null);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <Brand href={publicHref('/')} />
          <div className="field app-header__name">
            <label className="sr-only" htmlFor="cmp-name">
              Comparison name
            </label>
            <input
              id="cmp-name"
              className="input"
              value={state.name}
              placeholder="Untitled comparison"
              maxLength={80}
              onChange={(e) => ws.dispatch({ type: 'set-name', name: e.target.value })}
            />
          </div>
          <div className="app-header__tools">
            <button type="button" className="btn btn--ghost" onClick={() => setDialog('recipes')}>
              <BookMarked size={18} aria-hidden="true" />
              <span className="btn__label">Recipes</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setDialog('saved')}>
              <HardDrive size={18} aria-hidden="true" />
              <span className="btn__label">Saved</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setDialog('help')}>
              <CircleHelp size={18} aria-hidden="true" />
              <span className="btn__label">Help</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="app-main" tabIndex={-1}>
        <nav aria-label="Steps">
          <ol className="stepper">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`stepper__btn ${state.step !== s.id && can(s.id) && ((s.id === 'files' && both) || (s.id === 'rules' && state.result)) ? 'is-done' : ''}`}
                  aria-current={state.step === s.id ? 'step' : undefined}
                  disabled={!can(s.id)}
                  onClick={() => ws.goto(s.id)}
                >
                  <span className="stepper__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="stepper__label">
                    {s.label}
                    <span className="stepper__sub">{s.sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="step-panel" key={state.step}>
          {state.step === 'files' && <FilesStep onManageSaved={() => setDialog('saved')} />}
          {state.step === 'rules' && <RulesStep onSaveRecipe={() => setDialog('recipes')} />}
          {state.step === 'results' && state.result && <ResultsStep onSaveRecipe={() => setDialog('recipes')} onSaveProject={() => setDialog('save-project')} />}
        </div>
      </main>
      <footer className="app-footer">
        Files are processed on this device and are not uploaded. <a href={publicHref('/privacy')}>Privacy</a> · <a href={publicHref('/methodology')}>How matching works</a>
      </footer>
      <ProgressDialog />
      <DiscardDialog onSaveFirst={() => setDialog('save-project')} />
      <RecipesDialog open={dialog === 'recipes'} onClose={() => setDialog(null)} initialName={state.name.replace(/^Sample: /, '')} />
      <SavedDialog open={dialog === 'saved'} onClose={() => setDialog(null)} />
      <SaveProjectDialog open={dialog === 'save-project'} onClose={() => setDialog(null)} />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} />
    </div>
  );
}

export function App() {
  return (
    <FeedbackProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </FeedbackProvider>
  );
}
