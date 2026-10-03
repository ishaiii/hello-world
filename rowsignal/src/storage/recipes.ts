/**
 * Recipes: reusable match rules. A recipe holds settings only — mappings by header name, rules,
 * formats — never source rows. Header names and field labels can still reveal business
 * information, which is why the interface says recipes stay on this device (and in any file you
 * export).
 */
import { z } from 'zod';
import { portableConfigSchema } from '../engine/schema';
import { dbExists, getDb, toStorageError, type RecipeRecord } from './db';
import type { PortableConfig } from '../engine/portable';
import type { ParseOptions } from '../import/loadFile';

const fileSettings = z.strictObject({
  sheet: z.string().max(200).nullable(),
  headerRow: z.union([z.number().int().min(1).max(1_048_576), z.null(), z.literal('auto')]),
  delimiter: z.enum(['auto', ',', '\t', ';']),
  encoding: z.enum(['auto', 'utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'windows-1250', 'iso-8859-15']),
});

export const recipeSchema = z.strictObject({
  kind: z.literal('rowsignal-recipe'),
  version: z.literal(1),
  /** Explicit statement for anyone opening the JSON. */
  containsSourceData: z.literal(false),
  name: z.string().min(1).max(80),
  savedAt: z.string().max(40),
  roleNames: z.strictObject({ A: z.string().max(100), B: z.string().max(100) }),
  files: z.strictObject({ A: fileSettings, B: fileSettings }),
  config: portableConfigSchema,
});

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeFileSettings = z.infer<typeof fileSettings>;

export const MAX_RECIPE_BYTES = 256 * 1024;

export class RecipeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeImportError';
  }
}

export function makeRecipe(
  name: string,
  roleNames: { A: string; B: string },
  files: Recipe['files'],
  config: PortableConfig,
  now: Date = new Date(),
): Recipe {
  return recipeSchema.parse({
    kind: 'rowsignal-recipe',
    version: 1,
    containsSourceData: false,
    name: name.trim().slice(0, 80) || 'Untitled recipe',
    savedAt: now.toISOString(),
    roleNames,
    files,
    config,
  });
}

export function parseOptionsFromRecipe(s: RecipeFileSettings): ParseOptions {
  const o: ParseOptions = { delimiter: s.delimiter, encoding: s.encoding };
  if (s.sheet) o.sheet = s.sheet;
  if (s.headerRow !== 'auto') o.headerRow = s.headerRow;
  return o;
}

export function recipeToJson(recipe: Recipe): string {
  return JSON.stringify(recipe, null, 2);
}

/**
 * Validate an imported recipe file. The file is treated purely as data: it is parsed as JSON and
 * checked against a strict schema, so unknown or executable-looking content is rejected rather
 * than ignored. Nothing in it is ever evaluated or rendered as HTML.
 */
export function parseRecipeJson(text: string): Recipe {
  if (text.length > MAX_RECIPE_BYTES) throw new RecipeImportError('This file is too large to be a RowSignal recipe.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new RecipeImportError('This file is not valid JSON, so it is not a RowSignal recipe.');
  }
  if (typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind !== 'rowsignal-recipe') {
    throw new RecipeImportError('This JSON file is not a RowSignal recipe.');
  }
  const result = recipeSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? first.path.join('.') || 'file' : 'file';
    throw new RecipeImportError(`This recipe has unsupported or malformed content (at “${where}”), so it was not imported.`);
  }
  return result.data;
}

export interface RecipeSummary {
  id: string;
  name: string;
  savedAt: number;
}

export async function saveRecipe(recipe: Recipe, id?: string): Promise<RecipeSummary> {
  const record: RecipeRecord = { id: id ?? crypto.randomUUID(), name: recipe.name, savedAt: Date.now(), recipe };
  try {
    const db = await getDb();
    await db.put('recipes', record);
  } catch (e) {
    throw toStorageError(e);
  }
  return { id: record.id, name: record.name, savedAt: record.savedAt };
}

export async function listRecipes(): Promise<RecipeSummary[]> {
  if (!(await dbExists())) return [];
  try {
    const db = await getDb();
    const all = await db.getAll('recipes');
    return all.map((r) => ({ id: r.id, name: r.name, savedAt: r.savedAt })).sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  if (!(await dbExists())) return null;
  try {
    const rec = await (await getDb()).get('recipes', id);
    if (!rec) return null;
    const parsed = recipeSchema.safeParse(rec.recipe);
    return parsed.success ? parsed.data : null;
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  if (!(await dbExists())) return;
  try {
    await (await getDb()).delete('recipes', id);
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function clearRecipes(): Promise<void> {
  if (!(await dbExists())) return;
  try {
    await (await getDb()).clear('recipes');
  } catch (e) {
    throw toStorageError(e);
  }
}
