import { flushSync } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { validateConfig, cloneConfig, newFieldRule, newKeyRule, type ConfigIssue } from '../engine/config';
import type { Analysis } from '../engine/diagnostics';
import { resolvePortable, toPortable, type SchemaIssue } from '../engine/portable';
import type { ApproxConfig } from '../engine/suggest';
import type { ComparisonResult, FieldKind, JobHooks, ManualLink, MatchConfig, ProgressInfo, Role } from '../engine/types';
import type { Annotation, ExportOptions } from '../export/build';
import { precheckFile, type FileInfo, type ParseOptions } from '../import/loadFile';
import { DEFAULT_LIMITS } from '../import/limits';
import { EXAMPLES } from '../sample/examples';
import { clearProjects, deleteProject, listProjects, loadProject, saveProject, type ProjectMeta } from '../storage/projects';
import { clearRecipes, deleteRecipe, getRecipe, listRecipes, makeRecipe, parseOptionsFromRecipe, parseRecipeJson, recipeToJson, saveRecipe, type Recipe, type RecipeSummary } from '../storage/recipes';
import { StorageError, dbExists } from '../storage/db';
import { createBrowserWorker, JobError, WorkerClient, WorkerResetError, type Job } from '../worker/client';
import type { MappingHints, RowDetail } from '../worker/session';
import { summarySentence } from '../shared/summary';
import { useFeedback } from './feedback';
import { inputsKey, initialState, isStale, reducer, type Action, type AppState, type Step } from './state';
import { PRESETS } from './presets';
import { track, type ErrorCategory } from '../analytics/events';

export interface Blocker {
  id: string;
  message: string;
}

export interface Workspace {
  state: AppState;
  stale: boolean;
  blockers: Blocker[];
  busy: boolean;
  dispatch: (a: Action) => void;
  goto: (s: Step) => void;
  addFile: (role: Role, file: File) => Promise<void>;
  addFiles: (role: Role, files: File[]) => Promise<void>;
  removeFile: (role: Role) => Promise<void>;
  swapFiles: () => Promise<void>;
  reparse: (role: Role, patch: Partial<ParseOptions>) => Promise<void>;
  loadExample: (id: string, opts?: { run?: boolean }) => Promise<void>;
  updateConfig: (fn: (c: MatchConfig) => MatchConfig) => void;
  applySuggestedMapping: () => void;
  addKey: () => void;
  addField: (kind?: FieldKind) => void;
  compare: () => Promise<void>;
  cancelRun: () => void;
  getDetail: (rowId: string) => Promise<RowDetail>;
  setAnnotation: (rowId: string, a: Annotation) => void;
  findPossible: (approx: ApproxConfig) => Promise<void>;
  cancelSuggest: () => void;
  linkRows: (link: ManualLink) => Promise<void>;
  unlinkRows: (link: ManualLink | null) => Promise<void>;
  exportResults: (opts: Omit<ExportOptions, 'roleNames' | 'fileNames' | 'sheetNames'>) => Promise<{ filename: string; notes: string[] } | null>;
  saveRecipeAs: (name: string) => Promise<RecipeSummary | null>;
  useRecipe: (id: string) => Promise<void>;
  importRecipeFile: (file: File) => Promise<void>;
  exportRecipe: (id: string) => Promise<void>;
  removeRecipe: (id: string) => Promise<void>;
  wipeRecipes: () => Promise<void>;
  saveProjectAs: (name: string, replaceId?: string) => Promise<ProjectMeta | null>;
  openProject: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  wipeProjects: () => Promise<void>;
  newComparison: () => void;
  workerResets: () => number;
  /** Run `fn` now, or after the user confirms when it would replace unsaved work. */
  guard: (fn: () => void) => void;
  guardPending: boolean;
  resolveGuard: (ok: boolean) => void;
}

const Ctx = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const v = useContext(Ctx);
  if (!v) throw new Error('WorkspaceProvider missing');
  return v;
}

function download(bytes: ArrayBuffer | Uint8Array | string, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function describeError(e: unknown): string {
  if (e instanceof JobError) return e.message;
  if (e instanceof StorageError) return e.message;
  if (e instanceof WorkerResetError) return 'The background worker had to be restarted, so that action was stopped. Please try again.';
  return 'Something went wrong. Please try again.';
}

const hasRules = (c: MatchConfig) => c.keys.length > 0 || c.fields.length > 0;

function errorCategory(e: unknown): ErrorCategory {
  const code = e instanceof JobError ? e.code : '';
  if (code === 'unsupported-type' || code === 'type-mismatch') return 'unsupported-type';
  if (code === 'file-too-large' || code === 'xlsx-too-large') return 'too-large';
  if (code === 'too-many-rows' || code === 'too-many-cells' || code === 'too-many-columns') return 'too-many-rows';
  if (code === 'xlsx-ole' || code === 'xlsx-encrypted') return 'password-protected';
  if (code.startsWith('xlsx') || code === 'csv-binary') return 'corrupt-file';
  if (code === 'config-invalid') return 'config-invalid';
  if (e instanceof WorkerResetError) return 'worker-failure';
  return 'other';
}

export function computeBlockers(state: AppState): Blocker[] {
  const out: Blocker[] = [];
  const a = state.files.A.info;
  const b = state.files.B.info;
  if (!a || !b) {
    out.push({ id: 'files', message: 'Add both files first.' });
    return out;
  }
  const issues: ConfigIssue[] = validateConfig(state.config, { A: a.columns, B: b.columns });
  for (const i of issues) if (i.blocking) out.push({ id: `${i.code}:${i.target ?? ''}`, message: i.message });
  if (state.analysis && state.analysis.key === inputsKey(state)) {
    for (const i of state.analysis.data.issues) {
      if (i.blocking && i.code === 'date-format-missing') out.push({ id: `${i.code}:${i.target ?? ''}`, message: i.message });
    }
  }
  return out;
}

export function WorkspaceProvider({ children, initialUrl }: { children: ReactNode; initialUrl?: string }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });
  const [client] = useState(() => new WorkerClient(createBrowserWorker));
  const fb = useFeedback();
  const fbRef = useRef(fb);
  useLayoutEffect(() => {
    fbRef.current = fb;
  });
  const jobs = useRef<{ compare?: Job<ComparisonResult>; suggest?: Job<unknown> }>({});
  const [busy, setBusy] = useState(false);
  const bootRef = useRef(false);
  const [guardPending, setGuardPending] = useState(false);
  const guardRef = useRef<(() => void) | null>(null);
  const guard = useCallback((fn: () => void) => {
    const s = stateRef.current;
    const hasWork = s.dirty && !s.sample && (s.files.A.status === 'ready' || s.files.B.status === 'ready');
    if (hasWork) {
      guardRef.current = fn;
      setGuardPending(true);
    } else fn();
  }, []);
  const resolveGuard = useCallback((ok: boolean) => {
    const fn = guardRef.current;
    guardRef.current = null;
    setGuardPending(false);
    if (ok && fn) setTimeout(fn, 0);
  }, []);

  // ---- helpers -----------------------------------------------------------------------------
  /** Dispatch and commit immediately, for async flows that read the committed state next. */
  const sync = useCallback((a: Action) => flushSync(() => dispatch(a)), []);
  const toast = useCallback((text: string, kind: 'info' | 'success' | 'error' = 'info') => fbRef.current.toast(text, kind), []);

  const fetchHints = useCallback(async () => {
    const s = stateRef.current;
    if (s.files.A.status !== 'ready' || s.files.B.status !== 'ready') return;
    const va = s.files.A.version;
    const vb = s.files.B.version;
    try {
      const hints: MappingHints = await client.call('hints', {}).promise;
      const cur = stateRef.current;
      if (cur.files.A.version === va && cur.files.B.version === vb) dispatch({ type: 'set-hints', hints });
    } catch {
      /* hints are optional */
    }
  }, [client]);

  /** Re-point the working rules at freshly loaded columns by header name (never by position). */
  const reconcile = useCallback(
    (role: Role, oldInfo: FileInfo | null, newInfo: FileInfo, recipeName: string | null = null) => {
      const s = stateRef.current;
      const cur: Record<Role, FileInfo | null> = { A: s.files.A.info, B: s.files.B.info };
      const oldCols = { A: cur.A?.columns ?? [], B: cur.B?.columns ?? [] };
      if (oldInfo) oldCols[role] = oldInfo.columns;
      const newCols = { A: cur.A?.columns ?? [], B: cur.B?.columns ?? [] };
      newCols[role] = newInfo.columns;
      if (!hasRules(s.config)) return false;
      const portable = toPortable(s.config, oldCols.A, oldCols.B);
      const check = resolvePortable(portable, newCols.A, newCols.B);
      dispatch({ type: 'set-config', config: check.config, schema: { issues: check.issues, newColumns: check.newColumns, recipeName } });
      return true;
    },
    [],
  );

  const applyRecipeToLoaded = useCallback(
    async (recipe: Recipe) => {
      const s = stateRef.current;
      const a = s.files.A.info;
      const b = s.files.B.info;
      if (!a || !b) return;
      const check = resolvePortable(recipe.config, a.columns, b.columns);
      dispatch({ type: 'set-config', config: check.config, schema: { issues: check.issues, newColumns: check.newColumns, recipeName: recipe.name } });
      dispatch({ type: 'set-role-name', role: 'A', name: recipe.roleNames.A });
      dispatch({ type: 'set-role-name', role: 'B', name: recipe.roleNames.B });
      dispatch({ type: 'set-pending-recipe', recipe: null });
      dispatch({ type: 'goto', step: 'rules' });
      fbRef.current.announce(check.issues.length ? `Recipe applied. ${check.issues.length} column${check.issues.length === 1 ? '' : 's'} need your attention.` : 'Recipe applied. All columns were found.');
    },
    [],
  );

  const loadBytes = useCallback(
    async (role: Role, name: string, bytes: ArrayBuffer, options: ParseOptions): Promise<FileInfo | null> => {
      dispatch({ type: 'file-loading', role });
      try {
        const info = await client.call('loadFile', { role, name, bytes, options }).promise;
        return info;
      } catch (e) {
        void client.call('removeFile', { role }).promise.catch(() => undefined);
        const message = describeError(e);
        dispatch({ type: 'file-error', role, message });
        fbRef.current.announce(`File ${role} could not be added. ${message}`);
        track({ name: 'import_failed', category: errorCategory(e) });
        return null;
      }
    },
    [client],
  );

  const afterLoad = useCallback(
    async (role: Role, oldInfo: FileInfo | null, info: FileInfo) => {
      const s = stateRef.current;
      const other = s.files[role === 'A' ? 'B' : 'A'];
      const pending = s.pendingRecipe;
      if (pending && other.status === 'ready') {
        await applyRecipeToLoaded(pending);
        return;
      }
      if (!pending && hasRules(s.config) && (oldInfo || other.status === 'ready')) {
        if (reconcile(role, oldInfo, info)) {
          if (other.status === 'ready') dispatch({ type: 'goto', step: 'rules' });
        }
      }
      void fetchHints();
    },
    [applyRecipeToLoaded, fetchHints, reconcile],
  );

  // ---- files ---------------------------------------------------------------------------------
  const addFile = useCallback(
    async (role: Role, file: File) => {
      const pre = precheckFile(file.name, file.size, DEFAULT_LIMITS);
      if (pre) {
        dispatch({ type: 'file-error', role, message: pre.message });
        fbRef.current.announce(`File ${role} could not be added. ${pre.message}`);
        return;
      }
      dispatch({ type: 'file-loading', role });
      let bytes: ArrayBuffer;
      try {
        bytes = await file.arrayBuffer();
      } catch {
        dispatch({ type: 'file-error', role, message: 'This file could not be read. It may have been moved or changed; add it again.' });
        return;
      }
      const s = stateRef.current;
      const oldInfo = s.files[role].info;
      const options: ParseOptions = s.pendingRecipe ? parseOptionsFromRecipe(s.pendingRecipe.files[role]) : {};
      const info = await loadBytes(role, file.name, bytes, options);
      if (!info) return;
      sync({ type: 'file-ready', role, info, options });
      fbRef.current.announce(`File ${role} added: ${info.dataRowCount.toLocaleString('en-US')} data rows, ${info.columns.length} columns.`);
      await afterLoad(role, oldInfo, info);
    },
    [afterLoad, loadBytes, sync],
  );

  const addFiles = useCallback(
    async (role: Role, files: File[]) => {
      if (files.length === 0) return;
      await addFile(role, files[0]!);
      const otherRole: Role = role === 'A' ? 'B' : 'A';
      if (files.length > 1 && stateRef.current.files[otherRole].status === 'empty') await addFile(otherRole, files[1]!);
    },
    [addFile],
  );

  const removeFile = useCallback(
    async (role: Role) => {
      await client.call('removeFile', { role }).promise.catch(() => undefined);
      sync({ type: 'file-removed', role });
      fbRef.current.announce(`File ${role} removed.`);
    },
    [client, sync],
  );

  const reparse = useCallback(
    async (role: Role, patch: Partial<ParseOptions>) => {
      const s = stateRef.current;
      const slot = s.files[role];
      if (!slot.info) return;
      const merged: ParseOptions = { ...slot.options, ...patch };
      // A different sheet has its own header row; start from "first row" again.
      if (patch.sheet !== undefined && patch.sheet !== slot.info.sheet && patch.headerRow === undefined) delete merged.headerRow;
      dispatch({ type: 'file-loading', role });
      try {
        const info = await client.call('reparse', { role, options: merged }).promise;
        sync({ type: 'file-ready', role, info, options: merged });
        fbRef.current.announce(`File ${role} re-read: ${info.dataRowCount.toLocaleString('en-US')} data rows.`);
        if (hasRules(stateRef.current.config)) reconcile(role, slot.info, info);
        void fetchHints();
      } catch (e) {
        const message = describeError(e);
        dispatch({ type: 'file-ready', role, info: slot.info, options: slot.options });
        toast(message, 'error');
      }
    },
    [client, fetchHints, reconcile, sync, toast],
  );

  const swapFiles = useCallback(async () => {
    const s = stateRef.current;
    const a = client.sourceBytes('A');
    const b = client.sourceBytes('B');
    if (!a || !b || !s.files.A.info || !s.files.B.info) return;
    const optsA = s.files.A.options;
    const optsB = s.files.B.options;
    const nameA = s.files.A.info.fileName;
    const nameB = s.files.B.info.fileName;
    setBusy(true);
    try {
      const [ia, ib] = await Promise.all([
        client.call('loadFile', { role: 'A', name: nameB, bytes: b, options: optsB }).promise,
        client.call('loadFile', { role: 'B', name: nameA, bytes: a, options: optsA }).promise,
      ]);
      sync({ type: 'swap-files' });
      sync({ type: 'file-ready', role: 'A', info: ia, options: optsB });
      sync({ type: 'file-ready', role: 'B', info: ib, options: optsA });
      fbRef.current.announce('File A and File B were swapped. Rules were swapped with them.');
      void fetchHints();
    } catch (e) {
      toast(describeError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [client, fetchHints, sync, toast]);

  // ---- rules ---------------------------------------------------------------------------------
  const updateConfig = useCallback((fn: (c: MatchConfig) => MatchConfig) => {
    const next = fn(cloneConfig(stateRef.current.config));
    dispatch({ type: 'set-config', config: next, keepSchema: true });
  }, []);

  const applySuggestedMapping = useCallback(() => {
    const s = stateRef.current;
    const hints = s.hints;
    const a = s.files.A.info;
    const b = s.files.B.info;
    if (!hints || !a || !b) return;
    const config = cloneConfig(s.config);
    config.keys = [];
    config.fields = [];
    for (const k of hints.mapping.keys) {
      config.keys.push(newKeyRule(config.keys, k.label, k.aColumn, k.bColumn));
    }
    for (const f of hints.mapping.fields) {
      config.fields.push(newFieldRule(config.fields, f.label, f.kind, f.aColumn, f.bColumn));
    }
    // Formats: only what the data itself proves. Anything ambiguous stays unchosen for the user.
    for (const role of ['A', 'B'] as const) {
      const colHints = hints.columns[role];
      for (const f of config.fields) {
        const col = colHints.find((c) => c.columnId === (role === 'A' ? f.aColumn : f.bColumn));
        if (!col) continue;
        if (f.kind === 'date' && col.dateGuess?.confident && col.dateGuess.order) config.formats[role].dateOrder = col.dateGuess.order;
        if (f.kind === 'number' && col.numberFormat) {
          config.formats[role].decimal = col.numberFormat.decimal;
          config.formats[role].thousands = col.numberFormat.thousands;
        }
      }
    }
    dispatch({ type: 'set-config', config });
    dispatch({ type: 'dismiss-suggestions' });
    fbRef.current.announce('Suggested column pairs applied. Please check them before comparing.');
  }, []);

  const addKey = useCallback(() => {
    updateConfig((c) => {
      c.keys.push(newKeyRule(c.keys, `Identifier ${c.keys.length + 1}`, '', ''));
      return c;
    });
  }, [updateConfig]);

  const addField = useCallback(
    (kind: FieldKind = 'text') => {
      updateConfig((c) => {
        c.fields.push(newFieldRule(c.fields, `Value ${c.fields.length + 1}`, kind, '', ''));
        return c;
      });
    },
    [updateConfig],
  );

  // ---- compare -------------------------------------------------------------------------------
  const compare = useCallback(async () => {
    const s = stateRef.current;
    if (s.run.status === 'running') return;
    const key = inputsKey(s);
    dispatch({ type: 'run-start' });
    // Make sure no decision is missing (e.g. a date format) before spending work on the files.
    let analysis: Analysis | null = s.analysis && s.analysis.key === key ? s.analysis.data : null;
    try {
      if (!analysis) analysis = await client.call('analyze', { config: s.config }).promise;
      const missing = analysis.issues.filter((i) => i.blocking);
      if (missing.length > 0) {
        dispatch({ type: 'run-error', message: missing[0]!.message });
        dispatch({ type: 'goto', step: 'rules' });
        return;
      }
      const job = client.call('compare', { config: s.config }, { onProgress: (p: ProgressInfo) => dispatch({ type: 'run-progress', phase: p }) });
      jobs.current.compare = job;
      const result = await job.promise;
      dispatch({ type: 'run-done', result, key });
      fbRef.current.announce(`Comparison finished. ${summarySentence(result.summary)}`);
      track({ name: 'comparison_completed', seconds: Math.round(result.elapsedMs / 100) / 10, usedRecipe: stateRef.current.schema?.recipeName != null });
    } catch (e) {
      if (e instanceof JobError && e.cancelled) {
        dispatch({ type: 'run-cancelled' });
        fbRef.current.announce('Comparison cancelled.');
      } else {
        const message = describeError(e);
        dispatch({ type: 'run-error', message });
        fbRef.current.announce(`The comparison could not run. ${message}`);
      }
    } finally {
      jobs.current.compare = undefined;
    }
  }, [client]);

  const cancelRun = useCallback(() => jobs.current.compare?.cancel(), []);

  // ---- results -------------------------------------------------------------------------------
  const getDetail = useCallback((rowId: string) => client.call('detail', { rowId }).promise, [client]);

  const setAnnotation = useCallback((rowId: string, annotation: Annotation) => dispatch({ type: 'set-annotation', rowId, annotation }), []);

  const findPossible = useCallback(
    async (approx: ApproxConfig) => {
      dispatch({ type: 'suggest', patch: { status: 'running', error: null, progress: null } });
      try {
        const job = client.call('suggest', { approx }, {
          onProgress: (p) => {
            if (p.total) dispatch({ type: 'suggest', patch: { progress: { done: p.done ?? 0, total: p.total } } });
          },
        });
        jobs.current.suggest = job;
        const result = (await job.promise) as import('../engine/suggest').SuggestionResult;
        dispatch({ type: 'suggest', patch: { status: 'done', result, progress: null } });
        fbRef.current.announce(`${result.suggestions.length} possible match${result.suggestions.length === 1 ? '' : 'es'} found.`);
      } catch (e) {
        if (e instanceof JobError && e.cancelled) dispatch({ type: 'suggest', patch: { status: 'idle', progress: null } });
        else dispatch({ type: 'suggest', patch: { status: 'error', error: describeError(e), progress: null } });
      } finally {
        jobs.current.suggest = undefined;
      }
    },
    [client],
  );

  const cancelSuggest = useCallback(() => jobs.current.suggest?.cancel(), []);

  const applyLinks = useCallback(
    async (links: ManualLink[]) => {
      try {
        const result = await client.call('links', { links }).promise;
        dispatch({ type: 'set-links', links, result });
        return true;
      } catch (e) {
        toast(describeError(e), 'error');
        return false;
      }
    },
    [client, toast],
  );

  const linkRows = useCallback(
    async (link: ManualLink) => {
      const ok = await applyLinks([...stateRef.current.links, link]);
      if (ok) fbRef.current.announce('Rows linked. They are labelled Manually linked.');
    },
    [applyLinks],
  );

  const unlinkRows = useCallback(
    async (link: ManualLink | null) => {
      const cur = stateRef.current.links;
      const next = link ? cur.filter((l) => !(l.aIdx === link.aIdx && l.bIdx === link.bIdx)) : [];
      const ok = await applyLinks(next);
      if (ok) fbRef.current.announce(link ? 'Link undone.' : 'All links undone.');
    },
    [applyLinks],
  );

  const exportResults = useCallback(
    async (opts: Omit<ExportOptions, 'roleNames' | 'fileNames' | 'sheetNames'>) => {
      const s = stateRef.current;
      const names = (r: Role) => s.roleNames[r].trim() || `File ${r}`;
      const options: ExportOptions = {
        ...opts,
        roleNames: { A: names('A'), B: names('B') },
        fileNames: { A: s.files.A.info?.fileName ?? '', B: s.files.B.info?.fileName ?? '' },
        sheetNames: { A: s.files.A.info?.sheet ?? null, B: s.files.B.info?.sheet ?? null },
      };
      try {
        const out = await client.call('export', { options, annotations: s.annotations }).promise;
        download(out.bytes, out.filename, out.mime);
        track({ name: 'result_exported', format: opts.format });
        toast(`Exported ${out.resultRows.toLocaleString('en-US')} result rows to ${out.filename}. The file was created on this device.`, 'success');
        return { filename: out.filename, notes: out.notes };
      } catch (e) {
        toast(describeError(e), 'error');
        return null;
      }
    },
    [client, toast],
  );

  // ---- recipes -------------------------------------------------------------------------------
  const currentFileSettings = useCallback((role: Role): Recipe['files']['A'] => {
    const slot = stateRef.current.files[role];
    const info = slot.info;
    return {
      sheet: info?.sheet ?? null,
      headerRow: slot.options.headerRow === undefined ? 'auto' : slot.options.headerRow,
      delimiter: info?.delimiterChoice ?? 'auto',
      encoding: info?.encodingChoice ?? 'auto',
    };
  }, []);

  const saveRecipeAs = useCallback(
    async (name: string) => {
      const s = stateRef.current;
      const a = s.files.A.info;
      const b = s.files.B.info;
      if (!a || !b) return null;
      try {
        const recipe = makeRecipe(name, { A: s.roleNames.A, B: s.roleNames.B }, { A: currentFileSettings('A'), B: currentFileSettings('B') }, toPortable(s.config, a.columns, b.columns));
        const saved = await saveRecipe(recipe);
        toast(`Recipe “${saved.name}” saved on this device. It holds your rules, not your data.`, 'success');
        track({ name: 'recipe_saved' });
        return saved;
      } catch (e) {
        toast(describeError(e), 'error');
        return null;
      }
    },
    [currentFileSettings, toast],
  );

  const useRecipe = useCallback(
    async (id: string) => {
      try {
        const recipe = await getRecipe(id);
        if (!recipe) {
          toast('That recipe could not be found.', 'error');
          return;
        }
        track({ name: 'recipe_reused' });
        const s = stateRef.current;
        if (s.files.A.status === 'ready' && s.files.B.status === 'ready') {
          // Re-read with the recipe's file settings (sheet, header row, delimiter), then resolve.
          for (const role of ['A', 'B'] as const) {
            const opts = parseOptionsFromRecipe(recipe.files[role]);
            const cur = stateRef.current.files[role];
            const changed = (opts.sheet ?? null) !== (cur.info?.sheet ?? null) && opts.sheet !== undefined || (opts.headerRow !== undefined && opts.headerRow !== cur.info?.headerRow) || opts.delimiter !== cur.info?.delimiterChoice;
            if (changed) {
              try {
                const info = await client.call('reparse', { role, options: opts }).promise;
                dispatch({ type: 'file-ready', role, info, options: opts });
              } catch {
                /* keep the current interpretation; the schema check below explains any gap */
              }
            }
          }
          dispatch({ type: 'set-pending-recipe', recipe });
          await applyRecipeToLoaded(recipe);
        } else {
          dispatch({ type: 'set-pending-recipe', recipe });
          dispatch({ type: 'goto', step: 'files' });
          toast(`Recipe “${recipe.name}” is ready. Add both files and it will be applied.`, 'info');
        }
      } catch (e) {
        toast(describeError(e), 'error');
      }
    },
    [applyRecipeToLoaded, client, toast],
  );

  const importRecipeFile = useCallback(
    async (file: File) => {
      try {
        const recipe = parseRecipeJson(await file.text());
        const saved = await saveRecipe(recipe);
        toast(`Recipe “${saved.name}” imported and saved on this device.`, 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'That recipe could not be imported.', 'error');
      }
    },
    [toast],
  );

  const exportRecipe = useCallback(
    async (id: string) => {
      const recipe = await getRecipe(id);
      if (!recipe) return;
      download(recipeToJson(recipe), `${recipe.name.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'recipe'}.rowsignal-recipe.json`, 'application/json');
      toast('Recipe file saved. It contains your rules and column names, but no data.', 'success');
    },
    [toast],
  );

  const removeRecipe = useCallback(async (id: string) => deleteRecipe(id).catch((e) => toast(describeError(e), 'error')), [toast]);
  const wipeRecipes = useCallback(async () => clearRecipes().catch((e) => toast(describeError(e), 'error')), [toast]);

  // ---- projects ------------------------------------------------------------------------------
  const saveProjectAs = useCallback(
    async (name: string, replaceId?: string) => {
      const s = stateRef.current;
      const a = client.sourceBytes('A');
      const b = client.sourceBytes('B');
      if (!a || !b || !s.files.A.info || !s.files.B.info) return null;
      try {
        const meta = await saveProject(
          {
            name,
            files: {
              A: { name: s.files.A.info.fileName, bytes: a.slice(0), options: s.files.A.options },
              B: { name: s.files.B.info.fileName, bytes: b.slice(0), options: s.files.B.options },
            },
            roleNames: s.roleNames,
            config: s.config,
            annotations: s.annotations,
            links: s.links,
          },
          replaceId,
        );
        dispatch({ type: 'set-saved', projectId: meta.id });
        toast(`Project “${meta.name}” saved on this device.`, 'success');
        return meta;
      } catch (e) {
        toast(describeError(e), 'error');
        return null;
      }
    },
    [client, toast],
  );

  const openProject = useCallback(
    async (id: string) => {
      try {
        const data = await loadProject(id);
        const metas = await listProjects();
        const meta = metas.find((m) => m.id === id);
        if (!data) {
          toast('That project could not be found.', 'error');
          return;
        }
        dispatch({ type: 'reset' });
        const opts = data.files as unknown as Record<Role, { name: string; bytes: ArrayBuffer; options: ParseOptions }>;
        for (const role of ['A', 'B'] as const) {
          const f = opts[role];
          const info = await loadBytes(role, f.name, f.bytes.slice(0), f.options);
          if (!info) return;
          sync({ type: 'file-ready', role, info, options: f.options });
        }
        const config = data.config as MatchConfig;
        sync({ type: 'set-config', config });
        sync({
          type: 'restore',
          annotations: (data.annotations ?? {}) as Record<string, Annotation>,
          roleNames: data.roleNames as Record<Role, string>,
          name: meta?.name ?? '',
          projectId: id,
        });
        // Re-run so the results are real, then re-apply the saved manual links.
        const result = await client.call('compare', { config }).promise;
        dispatch({ type: 'run-done', result, key: null });
        const links = (data.links ?? []) as ManualLink[];
        if (links.length > 0) {
          try {
            const linked = await client.call('links', { links }).promise;
            dispatch({ type: 'set-links', links, result: linked });
          } catch {
            toast('Some saved links no longer apply and were not restored.', 'info');
          }
        }
        dispatch({ type: 'set-saved', projectId: id });
        fbRef.current.announce('Project opened.');
      } catch (e) {
        toast(describeError(e), 'error');
      }
    },
    [client, loadBytes, sync, toast],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await deleteProject(id).catch((e) => toast(describeError(e), 'error'));
      if (stateRef.current.projectId === id) dispatch({ type: 'set-saved', projectId: null });
    },
    [toast],
  );
  const wipeProjects = useCallback(async () => {
    await clearProjects().catch((e) => toast(describeError(e), 'error'));
    dispatch({ type: 'set-saved', projectId: null });
  }, [toast]);

  // ---- examples ------------------------------------------------------------------------------
  const newComparison = useCallback(() => {
    void client.call('removeFile', { role: 'A' }).promise.catch(() => undefined);
    void client.call('removeFile', { role: 'B' }).promise.catch(() => undefined);
    dispatch({ type: 'reset' });
  }, [client]);

  const loadExample = useCallback(
    async (id: string, opts: { run?: boolean } = {}) => {
      const ex = EXAMPLES[id];
      if (!ex) return;
      track({ name: 'sample_opened' });
      dispatch({ type: 'reset' });
      for (const role of ['A', 'B'] as const) {
        const f = ex.files[role];
        const bytes = f.bytes();
        const options = f.options ?? {};
        const info = await loadBytes(role, f.name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, options);
        if (!info) return;
        sync({ type: 'file-ready', role, info, options });
      }
      dispatch({ type: 'set-role-name', role: 'A', name: ex.roleNames.A });
      dispatch({ type: 'set-role-name', role: 'B', name: ex.roleNames.B });
      dispatch({ type: 'set-name', name: `Sample: ${ex.title}` });
      dispatch({ type: 'set-config', config: ex.config() });
      dispatch({ type: 'set-sample', sample: true });
      sync({ type: 'set-saved', projectId: null });
      void fetchHints();
      if (opts.run) await compare();
      else dispatch({ type: 'goto', step: 'files' });
    },
    [compare, fetchHints, loadBytes, sync],
  );

  // ---- effects -------------------------------------------------------------------------------
  // Rules step: keep key statistics and missing decisions current (debounced, cancellable).
  const key = inputsKey(state);
  const bothReady = state.files.A.status === 'ready' && state.files.B.status === 'ready';
  useEffect(() => {
    if (state.step !== 'rules' || !bothReady) return;
    let cancelled = false;
    let job: Job<Analysis> | null = null;
    const timer = setTimeout(() => {
      const cfg = stateRef.current.config;
      job = client.call('analyze', { config: cfg });
      job.promise
        .then((data) => {
          if (!cancelled) dispatch({ type: 'set-analysis', key: inputsKey(stateRef.current), data });
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      job?.cancel();
    };
  }, [state.step, bothReady, key, client]);

  // Fetch hints when the Rules step opens and none are loaded yet.
  useEffect(() => {
    if (state.step === 'rules' && bothReady && !state.hints) void fetchHints();
  }, [state.step, bothReady, state.hints, fetchHints]);

  // A restarted worker has lost its results; anything shown must be treated as out of date.
  useEffect(() => {
    client.setOnReset(() => {
      toast('The background worker was restarted. Run the comparison again to refresh results.', 'info');
      const s = stateRef.current;
      if (s.result) dispatch({ type: 'set-result', result: s.result });
    });
  }, [client, toast]);

  // Warn before leaving with unsaved work in memory.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      const s = stateRef.current;
      if (s.dirty && !s.sample && (s.files.A.status === 'ready' || s.files.B.status === 'ready')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  // Start-up links from the public pages: ?sample=1, ?example=<id>, ?preset=<id>.
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const params = new URLSearchParams(initialUrl ?? window.location.search);
    const preset = params.get('preset');
    const example = params.get('example') ?? (params.get('sample') ? 'orders' : null);
    if (preset && PRESETS[preset]) {
      const p = PRESETS[preset]!;
      dispatch({ type: 'set-role-name', role: 'A', name: p.roleNames.A });
      dispatch({ type: 'set-role-name', role: 'B', name: p.roleNames.B });
      dispatch({ type: 'set-saved', projectId: null });
      dispatch({ type: 'set-sample', sample: false, preset });
    }
    if (example && EXAMPLES[example]) void loadExample(example, { run: true });
    if (preset || example) window.history.replaceState(null, '', window.location.pathname);
    void dbExists(); // warm the check; does not create anything
  }, [initialUrl, loadExample]);

  const goto = useCallback((step: Step) => dispatch({ type: 'goto', step }), []);

  const value = useMemo<Workspace>(
    () => ({
      state,
      stale: isStale(state),
      blockers: computeBlockers(state),
      busy: busy || state.run.status === 'running',
      dispatch,
      goto,
      addFile,
      addFiles,
      removeFile,
      swapFiles,
      reparse,
      loadExample,
      updateConfig,
      applySuggestedMapping,
      addKey,
      addField,
      compare,
      cancelRun,
      getDetail,
      setAnnotation,
      findPossible,
      cancelSuggest,
      linkRows,
      unlinkRows,
      exportResults,
      saveRecipeAs,
      useRecipe,
      importRecipeFile,
      exportRecipe,
      removeRecipe,
      wipeRecipes,
      saveProjectAs,
      openProject,
      removeProject,
      wipeProjects,
      newComparison,
      workerResets: () => client.resetCount,
      guard,
      guardPending,
      resolveGuard,
    }),
    [state, busy, goto, addFile, addFiles, removeFile, swapFiles, reparse, loadExample, updateConfig, applySuggestedMapping, addKey, addField, compare, cancelRun, getDetail, setAnnotation, findPossible, cancelSuggest, linkRows, unlinkRows, exportResults, saveRecipeAs, useRecipe, importRecipeFile, exportRecipe, removeRecipe, wipeRecipes, saveProjectAs, openProject, removeProject, wipeProjects, newComparison, client, guard, guardPending, resolveGuard],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { RecipeSummary, ProjectMeta };
export { listRecipes, listProjects };
export type { SchemaIssue, JobHooks };
