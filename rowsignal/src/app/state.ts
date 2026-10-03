import type { Analysis } from '../engine/diagnostics';
import { emptyConfig } from '../engine/config';
import type { SchemaIssue } from '../engine/portable';
import type { SuggestionResult } from '../engine/suggest';
import type { ComparisonResult, ManualLink, MatchConfig, ProgressInfo, Role } from '../engine/types';
import type { Annotation } from '../export/build';
import type { FileInfo, ParseOptions } from '../import/loadFile';
import type { Recipe } from '../storage/recipes';
import type { MappingHints } from '../worker/session';

export type Step = 'files' | 'rules' | 'results';

export interface FileSlot {
  status: 'empty' | 'loading' | 'ready' | 'error';
  info: FileInfo | null;
  options: ParseOptions;
  error: string | null;
  /** Increments whenever the file's content or interpretation changes. */
  version: number;
}

export interface SuggestState {
  status: 'idle' | 'running' | 'done' | 'error';
  result: SuggestionResult | null;
  dismissed: string[];
  error: string | null;
  progress: { done: number; total: number } | null;
}

export interface AppState {
  step: Step;
  name: string;
  roleNames: Record<Role, string>;
  files: Record<Role, FileSlot>;
  sample: boolean;
  preset: string | null;
  config: MatchConfig;
  hints: MappingHints | null;
  suggestionsOffered: boolean;
  analysis: { key: string; data: Analysis } | null;
  schema: { issues: SchemaIssue[]; newColumns: Record<Role, string[]>; recipeName: string | null } | null;
  pendingRecipe: Recipe | null;
  run: { status: 'idle' | 'running' | 'error'; phase: ProgressInfo | null; error: string | null };
  result: ComparisonResult | null;
  resultKey: string | null;
  annotations: Record<string, Annotation>;
  links: ManualLink[];
  suggest: SuggestState;
  dirty: boolean;
  projectId: string | null;
}

const emptySlot = (): FileSlot => ({ status: 'empty', info: null, options: {}, error: null, version: 0 });

export const initialSuggest = (): SuggestState => ({ status: 'idle', result: null, dismissed: [], error: null, progress: null });

export function initialState(): AppState {
  return {
    step: 'files',
    name: '',
    roleNames: { A: '', B: '' },
    files: { A: emptySlot(), B: emptySlot() },
    sample: false,
    preset: null,
    config: emptyConfig(),
    hints: null,
    suggestionsOffered: true,
    analysis: null,
    schema: null,
    pendingRecipe: null,
    run: { status: 'idle', phase: null, error: null },
    result: null,
    resultKey: null,
    annotations: {},
    links: [],
    suggest: initialSuggest(),
    dirty: false,
    projectId: null,
  };
}

export type Action =
  | { type: 'goto'; step: Step }
  | { type: 'set-name'; name: string }
  | { type: 'set-role-name'; role: Role; name: string }
  | { type: 'file-loading'; role: Role }
  | { type: 'file-ready'; role: Role; info: FileInfo; options: ParseOptions }
  | { type: 'file-error'; role: Role; message: string }
  | { type: 'file-removed'; role: Role }
  | { type: 'swap-files' }
  | { type: 'set-config'; config: MatchConfig; schema?: AppState['schema']; keepSchema?: boolean }
  | { type: 'set-hints'; hints: MappingHints | null }
  | { type: 'dismiss-suggestions' }
  | { type: 'set-analysis'; key: string; data: Analysis }
  | { type: 'clear-schema' }
  | { type: 'set-pending-recipe'; recipe: Recipe | null }
  | { type: 'run-start' }
  | { type: 'run-progress'; phase: ProgressInfo }
  | { type: 'run-done'; result: ComparisonResult; key: string | null }
  | { type: 'run-error'; message: string }
  | { type: 'run-cancelled' }
  | { type: 'set-result'; result: ComparisonResult }
  | { type: 'set-links'; links: ManualLink[]; result: ComparisonResult }
  | { type: 'set-annotation'; rowId: string; annotation: Annotation }
  | { type: 'suggest'; patch: Partial<SuggestState> }
  | { type: 'set-sample'; sample: boolean; preset?: string | null }
  | { type: 'set-saved'; projectId: string | null }
  | { type: 'restore'; annotations: Record<string, Annotation>; roleNames: Record<Role, string>; name: string; projectId: string | null }
  | { type: 'reset' };

export function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'goto':
      return { ...state, step: a.step };
    case 'set-name':
      return { ...state, name: a.name, dirty: true };
    case 'set-role-name':
      return { ...state, roleNames: { ...state.roleNames, [a.role]: a.name }, dirty: true };
    case 'file-loading':
      return { ...state, files: { ...state.files, [a.role]: { ...state.files[a.role], status: 'loading', error: null } } };
    case 'file-ready': {
      const slot = state.files[a.role];
      return {
        ...state,
        files: { ...state.files, [a.role]: { status: 'ready', info: a.info, error: null, version: slot.version + 1, options: a.options } },
        hints: null,
        analysis: null,
        sample: false,
        dirty: true,
        suggest: initialSuggest(),
      };
    }
    case 'file-error':
      return { ...state, files: { ...state.files, [a.role]: { ...state.files[a.role], status: 'error', error: a.message } } };
    case 'file-removed':
      return {
        ...state,
        files: { ...state.files, [a.role]: { ...emptySlot(), version: state.files[a.role].version + 1 } },
        hints: null,
        analysis: null,
        sample: false,
        dirty: true,
        step: 'files',
        suggest: initialSuggest(),
      };
    case 'swap-files': {
      const swapped = { A: { ...state.files.B, version: state.files.B.version + 1 }, B: { ...state.files.A, version: state.files.A.version + 1 } };
      const c = state.config;
      const swapRule = <T extends { aColumn: string; bColumn: string }>(r: T): T => ({ ...r, aColumn: r.bColumn, bColumn: r.aColumn });
      return {
        ...state,
        files: swapped,
        roleNames: { A: state.roleNames.B, B: state.roleNames.A },
        config: { ...c, keys: c.keys.map(swapRule), fields: c.fields.map(swapRule), formats: { A: c.formats.B, B: c.formats.A } },
        hints: null,
        analysis: null,
        dirty: true,
        suggest: initialSuggest(),
      };
    }
    case 'set-config':
      return {
        ...state,
        config: a.config,
        schema: a.keepSchema ? state.schema : (a.schema ?? null),
        dirty: true,
      };
    case 'set-hints':
      return { ...state, hints: a.hints };
    case 'dismiss-suggestions':
      return { ...state, suggestionsOffered: false };
    case 'set-analysis':
      return { ...state, analysis: { key: a.key, data: a.data } };
    case 'clear-schema':
      return { ...state, schema: null };
    case 'set-pending-recipe':
      return { ...state, pendingRecipe: a.recipe };
    case 'run-start':
      return { ...state, run: { status: 'running', phase: { phase: 'reading' }, error: null } };
    case 'run-progress':
      return state.run.status === 'running' ? { ...state, run: { ...state.run, phase: a.phase } } : state;
    case 'run-done':
      return {
        ...state,
        run: { status: 'idle', phase: null, error: null },
        result: a.result,
        resultKey: a.key ?? inputsKey(state),
        links: [],
        suggest: initialSuggest(),
        step: 'results',
      };
    case 'run-error':
      return { ...state, run: { status: 'error', phase: null, error: a.message } };
    case 'run-cancelled':
      return { ...state, run: { status: 'idle', phase: null, error: null } };
    case 'set-result':
      return { ...state, result: a.result };
    case 'set-links':
      return { ...state, links: a.links, result: a.result, dirty: true };
    case 'set-annotation': {
      const next = { ...state.annotations };
      if (!a.annotation.flag && !a.annotation.note) delete next[a.rowId];
      else next[a.rowId] = a.annotation;
      return { ...state, annotations: next, dirty: true };
    }
    case 'suggest':
      return { ...state, suggest: { ...state.suggest, ...a.patch } };
    case 'set-sample':
      return { ...state, sample: a.sample, preset: a.preset ?? state.preset };
    case 'set-saved':
      return { ...state, dirty: false, projectId: a.projectId };
    case 'restore':
      return { ...state, annotations: a.annotations, roleNames: a.roleNames, name: a.name, projectId: a.projectId, dirty: false };
    case 'reset':
      return initialState();
  }
}

/** Identity of the inputs a comparison was computed from. */
export function inputsKey(state: Pick<AppState, 'config' | 'files'>): string {
  return JSON.stringify({ c: state.config, a: state.files.A.version, b: state.files.B.version });
}

export function isStale(state: AppState): boolean {
  return state.result !== null && state.resultKey !== inputsKey(state);
}

export function displayRoleName(state: Pick<AppState, 'roleNames'>, role: Role): string {
  return state.roleNames[role].trim();
}
