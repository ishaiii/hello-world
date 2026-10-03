import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'samples');
export const sample = (name: string) => join(SAMPLES, name);

/** Writes a temporary file and returns its path. */
export function tempFile(name: string, content: string | Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'rowsignal-e2e-'));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}
