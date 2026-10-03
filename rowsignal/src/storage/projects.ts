/**
 * Local projects: source files, settings and review notes saved on this device by explicit choice.
 * Not encrypted, not a backup, and removable at any time (see src/storage/db.ts).
 */
import { dbExists, getDb, toStorageError, type ProjectData, type ProjectMeta } from './db';

export type { ProjectData, ProjectMeta } from './db';

export interface ProjectInput {
  name: string;
  files: ProjectData['files'];
  roleNames: ProjectData['roleNames'];
  config: unknown;
  annotations: unknown;
  links: unknown;
}

function approximateSize(p: ProjectInput): number {
  let json = 0;
  try {
    json = JSON.stringify({ c: p.config, a: p.annotations, l: p.links, r: p.roleNames }).length;
  } catch {
    json = 0;
  }
  return p.files.A.bytes.byteLength + p.files.B.bytes.byteLength + json;
}

/** Save (or, with `id`, replace) a project. Metadata and data are written in one transaction. */
export async function saveProject(input: ProjectInput, id?: string): Promise<ProjectMeta> {
  const meta: ProjectMeta = {
    id: id ?? crypto.randomUUID(),
    name: input.name.trim().slice(0, 100) || 'Untitled project',
    savedAt: Date.now(),
    size: approximateSize(input),
    fileNames: { A: input.files.A.name, B: input.files.B.name },
  };
  const data: ProjectData = {
    id: meta.id,
    files: input.files,
    roleNames: input.roleNames,
    config: input.config,
    annotations: input.annotations,
    links: input.links,
  };
  try {
    const db = await getDb();
    const tx = db.transaction(['projects', 'projectData'], 'readwrite');
    await Promise.all([tx.objectStore('projects').put(meta), tx.objectStore('projectData').put(data), tx.done]);
  } catch (e) {
    throw toStorageError(e);
  }
  return meta;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  if (!(await dbExists())) return [];
  try {
    const all = await (await getDb()).getAll('projects');
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function loadProject(id: string): Promise<ProjectData | null> {
  if (!(await dbExists())) return null;
  try {
    return (await (await getDb()).get('projectData', id)) ?? null;
  } catch (e) {
    throw toStorageError(e);
  }
}

/** Removes the stored files and settings, not just the list entry. */
export async function deleteProject(id: string): Promise<void> {
  if (!(await dbExists())) return;
  try {
    const db = await getDb();
    const tx = db.transaction(['projects', 'projectData'], 'readwrite');
    await Promise.all([tx.objectStore('projects').delete(id), tx.objectStore('projectData').delete(id), tx.done]);
  } catch (e) {
    throw toStorageError(e);
  }
}

export async function clearProjects(): Promise<void> {
  if (!(await dbExists())) return;
  try {
    const db = await getDb();
    const tx = db.transaction(['projects', 'projectData'], 'readwrite');
    await Promise.all([tx.objectStore('projects').clear(), tx.objectStore('projectData').clear(), tx.done]);
  } catch (e) {
    throw toStorageError(e);
  }
}
