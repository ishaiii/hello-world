import { compareTables } from '../engine/compare';
import type { ComparisonResult, FieldRule, Role } from '../engine/types';
import { loadFileData, type FileInfo } from '../import/loadFile';
import { EXAMPLES, type Example } from './examples';

export interface ExampleRun {
  example: Example;
  info: Record<Role, FileInfo>;
  /** Header labels and all data rows, as text, for display. */
  tables: Record<Role, { columns: string[]; rows: string[][]; rowNumbers: number[] }>;
  result: ComparisonResult;
  fields: FieldRule[];
}

/** Runs an example through the real import and matching engine. */
export async function runExample(id: string): Promise<ExampleRun> {
  const example = EXAMPLES[id];
  if (!example) throw new Error(`Unknown example ${id}`);
  const loaded = {
    A: loadFileData(example.files.A.name, example.files.A.bytes(), example.files.A.options ?? {}),
    B: loadFileData(example.files.B.name, example.files.B.bytes(), example.files.B.options ?? {}),
  };
  const result = await compareTables(loaded.A.table, loaded.B.table, example.config());
  const tbl = (role: Role) => {
    const t = loaded[role].table;
    return {
      columns: t.columns.map((c) => c.label),
      rows: Array.from({ length: t.rowCount }, (_, r) => t.columns.map((_c, c) => t.text(r, c))),
      rowNumbers: Array.from({ length: t.rowCount }, (_, r) => t.rowNumber(r)),
    };
  };
  return { example, info: { A: loaded.A.info, B: loaded.B.info }, tables: { A: tbl('A'), B: tbl('B') }, result, fields: example.config().fields };
}
