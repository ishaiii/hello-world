/**
 * Local persistence (IndexedDB). Nothing here runs unless the user explicitly saves a recipe or a
 * project, or opens the saved-items list. The database is not even created until the first save:
 * listing checks for its existence first.
 *
 * Data stored here is NOT encrypted and is NOT a backup: anyone using the same browser profile can
 * read it, and the browser may clear it. The interface says so wherever it offers to save.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'rowsignal';
const DB_VERSION = 1;

export interface RecipeRecord {
  id: string;
  name: string;
  savedAt: number;
  /** The full validated recipe document (settings only, never source rows). */
  recipe: unknown;
}

export interface ProjectMeta {
  id: string;
  name: string;
  savedAt: number;
  /** Approximate stored size in bytes (source files plus settings). */
  size: number;
  fileNames: { A: string; B: string };
}

export interface ProjectData {
  id: string;
  files: {
    A: { name: string; bytes: ArrayBuffer; options: unknown };
    B: { name: string; bytes: ArrayBuffer; options: unknown };
  };
  roleNames: { A: string; B: string };
  config: unknown;
  annotations: unknown;
  links: unknown;
}

interface Schema extends DBSchema {
  recipes: { key: string; value: RecipeRecord };
  projects: { key: string; value: ProjectMeta };
  projectData: { key: string; value: ProjectData };
}

export class StorageError extends Error {
  constructor(
    readonly code: 'quota' | 'unavailable' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** True when the database already exists, without creating it. */
export async function dbExists(): Promise<boolean> {
  if (!idbAvailable()) return false;
  if (dbPromise) return true;
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (typeof factory.databases !== 'function') return true; // cannot tell; assume it may exist
  try {
    return (await factory.databases()).some((d) => d.name === DB_NAME);
  } catch {
    return true;
  }
}

export function getDb(): Promise<IDBPDatabase<Schema>> {
  if (!idbAvailable()) return Promise.reject(new StorageError('unavailable', 'This browser does not allow saving on this device (storage is unavailable or blocked).'));
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('recipes', { keyPath: 'id' });
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('projectData', { keyPath: 'id' });
    },
  }).catch((e: unknown) => {
    dbPromise = null;
    throw toStorageError(e);
  });
  return dbPromise;
}

export function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') {
    return new StorageError('quota', 'This device has no room left to save this. Delete saved projects you no longer need, or export what you need first.');
  }
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new StorageError('unavailable', 'Saving on this device is blocked (for example in a private window or with site data disabled).');
  }
  return new StorageError('failed', 'Saving on this device failed. Nothing was changed.');
}

/** Close and forget the connection (used by tests and by "clear everything"). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    /* ignore */
  }
  dbPromise = null;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && typeof est.usage === 'number' && typeof est.quota === 'number') return { usage: est.usage, quota: est.quota };
  } catch {
    /* not supported */
  }
  return null;
}
