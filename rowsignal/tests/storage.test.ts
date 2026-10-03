import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { closeDb, DB_NAME, toStorageError } from '../src/storage/db';
import { clearProjects, deleteProject, listProjects, loadProject, saveProject } from '../src/storage/projects';
import { clearRecipes, deleteRecipe, getRecipe, listRecipes, makeRecipe, parseRecipeJson, parseOptionsFromRecipe, RecipeImportError, recipeToJson, saveRecipe } from '../src/storage/recipes';
import { toPortable } from '../src/engine/portable';
import { loadCsv } from './helpers';
import { DISPATCH_CSV, ORDERS_CSV, sampleOrdersConfig } from '../src/sample/orders';

const fileSettings = { sheet: null, headerRow: 'auto' as const, delimiter: 'auto' as const, encoding: 'auto' as const };

function sampleRecipe(name = 'Weekly orders check') {
  const a = loadCsv(ORDERS_CSV).table;
  const b = loadCsv(DISPATCH_CSV).table;
  return makeRecipe(name, { A: 'Orders', B: 'Dispatch' }, { A: fileSettings, B: fileSettings }, toPortable(sampleOrdersConfig(), a.columns, b.columns), new Date('2026-04-03T10:00:00Z'));
}

const bytes = (s: string) => new TextEncoder().encode(s).buffer.slice(0) as ArrayBuffer;

async function rawCounts() {
  const db = await openDB(DB_NAME);
  const out = { recipes: await db.count('recipes'), projects: await db.count('projects'), projectData: await db.count('projectData') };
  db.close();
  return out;
}

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('persistence happens only after an explicit save', () => {
  it('does not create the database just by looking', async () => {
    expect(await listRecipes()).toEqual([]);
    expect(await listProjects()).toEqual([]);
    expect(await getRecipe('nope')).toBeNull();
    expect(await loadProject('nope')).toBeNull();
    await deleteProject('nope');
    await clearProjects();
    await clearRecipes();
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(DB_NAME);
  });

  it('saves, lists, reloads and truly deletes a recipe', async () => {
    const saved = await saveRecipe(sampleRecipe());
    expect((await listRecipes()).map((r) => r.name)).toEqual(['Weekly orders check']);
    const back = await getRecipe(saved.id);
    expect(back?.config.keys[0]!.a.header).toBe('Order ID');
    expect(JSON.stringify(back)).not.toMatch(/1001|PEN|mug|BOOK/); // settings only, no source rows
    await deleteRecipe(saved.id);
    expect(await listRecipes()).toEqual([]);
    expect((await rawCounts()).recipes).toBe(0);
  });

  it('saves a project with its files, then delete removes metadata AND data', async () => {
    const meta = await saveProject({
      name: 'April check',
      files: { A: { name: 'orders.csv', bytes: bytes(ORDERS_CSV), options: {} }, B: { name: 'dispatch.csv', bytes: bytes(DISPATCH_CSV), options: {} } },
      roleNames: { A: 'Orders', B: 'Dispatch' },
      config: sampleOrdersConfig(),
      annotations: { 'p:4:1004': { flag: 'followup', note: 'call warehouse' } },
      links: [],
    });
    expect(meta.size).toBeGreaterThan(ORDERS_CSV.length + DISPATCH_CSV.length);
    expect((await listProjects())[0]).toMatchObject({ name: 'April check', fileNames: { A: 'orders.csv', B: 'dispatch.csv' } });
    const loaded = await loadProject(meta.id);
    expect(new TextDecoder().decode(new Uint8Array(loaded!.files.A.bytes))).toBe(ORDERS_CSV);
    expect(loaded!.annotations).toMatchObject({ 'p:4:1004': { note: 'call warehouse' } });
    expect(await rawCounts()).toMatchObject({ projects: 1, projectData: 1 });

    await deleteProject(meta.id);
    expect(await listProjects()).toEqual([]);
    expect(await loadProject(meta.id)).toBeNull();
    expect(await rawCounts()).toMatchObject({ projects: 0, projectData: 0 });
  });

  it('replaces a project in place and clears projects separately from recipes', async () => {
    const input = (name: string) => ({
      name,
      files: { A: { name: 'a.csv', bytes: bytes('x'), options: {} }, B: { name: 'b.csv', bytes: bytes('y'), options: {} } },
      roleNames: { A: 'A', B: 'B' },
      config: {},
      annotations: {},
      links: [],
    });
    const first = await saveProject(input('v1'));
    const again = await saveProject(input('v2'), first.id);
    expect(again.id).toBe(first.id);
    expect((await listProjects()).map((p) => p.name)).toEqual(['v2']);
    await saveRecipe(sampleRecipe());
    await clearProjects();
    expect(await listProjects()).toEqual([]);
    expect(await listRecipes()).toHaveLength(1);
    await clearRecipes();
    expect(await rawCounts()).toEqual({ recipes: 0, projects: 0, projectData: 0 });
  });

  it('maps storage failures to recoverable, plain-language errors', () => {
    const quota = toStorageError(new DOMException('full', 'QuotaExceededError'));
    expect(quota.code).toBe('quota');
    expect(quota.message).toMatch(/Delete saved projects/);
    expect(toStorageError(new DOMException('blocked', 'SecurityError')).code).toBe('unavailable');
    expect(toStorageError(new Error('???')).code).toBe('failed');
  });
});

describe('recipe files are validated as data', () => {
  it('round-trips through JSON', () => {
    const r = sampleRecipe();
    const text = recipeToJson(r);
    expect(JSON.parse(text)).toMatchObject({ kind: 'rowsignal-recipe', containsSourceData: false });
    expect(parseRecipeJson(text)).toEqual(r);
  });

  const mutate = (fn: (o: Record<string, unknown>) => void) => {
    const o = JSON.parse(recipeToJson(sampleRecipe())) as Record<string, unknown>;
    fn(o);
    return JSON.stringify(o);
  };

  it('rejects malformed, foreign, oversized and over-permissive files', () => {
    expect(() => parseRecipeJson('not json')).toThrow(RecipeImportError);
    expect(() => parseRecipeJson('{"kind":"something-else"}')).toThrow(/not a RowSignal recipe/);
    expect(() => parseRecipeJson('[]')).toThrow(RecipeImportError);
    expect(() => parseRecipeJson(' '.repeat(300_000))).toThrow(/too large/);
    expect(() => parseRecipeJson(mutate((o) => (o.version = 2)))).toThrow(RecipeImportError);
    expect(() => parseRecipeJson(mutate((o) => (o.containsSourceData = true)))).toThrow(RecipeImportError);
    // unknown keys are refused, not ignored — including anything script-like
    expect(() => parseRecipeJson(mutate((o) => (o.onLoad = 'alert(1)')))).toThrow(/unsupported or malformed/);
    expect(() => parseRecipeJson(mutate((o) => ((o.config as { keys: unknown[] }).keys[0] as Record<string, unknown>).run = '=cmd()'))).toThrow(RecipeImportError);
    expect(() => parseRecipeJson(mutate((o) => (o.name = '')))).toThrow(RecipeImportError);
    expect(() => parseRecipeJson(mutate((o) => ((o.files as { A: Record<string, unknown> }).A.delimiter = '|')))).toThrow(RecipeImportError);
  });

  it('keeps HTML-looking text as inert strings', () => {
    const r = parseRecipeJson(mutate((o) => (o.name = '<img src=x onerror=alert(1)>')));
    expect(r.name).toBe('<img src=x onerror=alert(1)>'); // stored as text; the UI renders it escaped
  });

  it('turns saved file settings back into import options', () => {
    expect(parseOptionsFromRecipe({ sheet: 'Orders', headerRow: 3, delimiter: ';', encoding: 'windows-1252' })).toEqual({ sheet: 'Orders', headerRow: 3, delimiter: ';', encoding: 'windows-1252' });
    expect(parseOptionsFromRecipe({ sheet: null, headerRow: 'auto', delimiter: 'auto', encoding: 'auto' })).toEqual({ delimiter: 'auto', encoding: 'auto' });
    expect(parseOptionsFromRecipe({ sheet: null, headerRow: null, delimiter: 'auto', encoding: 'auto' }).headerRow).toBeNull();
  });
});
