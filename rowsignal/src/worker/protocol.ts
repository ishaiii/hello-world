/** Message protocol between the UI thread and the engine worker. Requests are validated on receipt. */
import { z } from 'zod';
import type { Analysis } from '../engine/diagnostics';
import {
  annotationsSchema,
  approxConfigSchema,
  exportOptionsSchema,
  manualLinksSchema,
  matchConfigSchema,
  parseOptionsSchema,
} from '../engine/schema';
import type { SuggestionResult } from '../engine/suggest';
import type { ComparisonResult, ProgressInfo } from '../engine/types';
import type { FileInfo } from '../import/loadFile';
import type { MappingHints, RowDetail } from './session';

const role = z.enum(['A', 'B']);

export const payloadSchemas = {
  loadFile: z.strictObject({ role, name: z.string().max(300), bytes: z.instanceof(ArrayBuffer), options: parseOptionsSchema }),
  reparse: z.strictObject({ role, options: parseOptionsSchema }),
  removeFile: z.strictObject({ role }),
  hints: z.strictObject({}),
  analyze: z.strictObject({ config: matchConfigSchema }),
  compare: z.strictObject({ config: matchConfigSchema }),
  suggest: z.strictObject({ approx: approxConfigSchema }),
  links: z.strictObject({ links: manualLinksSchema }),
  detail: z.strictObject({ rowId: z.string().max(2000) }),
  export: z.strictObject({ options: exportOptionsSchema, annotations: annotationsSchema }),
} as const;

export type Op = keyof typeof payloadSchemas;
export type Payloads = { [K in Op]: z.infer<(typeof payloadSchemas)[K]> };

export interface ExportResponse {
  bytes: ArrayBuffer;
  filename: string;
  mime: string;
  resultRows: number;
  notes: string[];
}

export interface Results {
  loadFile: FileInfo;
  reparse: FileInfo;
  removeFile: null;
  hints: MappingHints;
  analyze: Analysis;
  compare: ComparisonResult;
  suggest: SuggestionResult;
  links: ComparisonResult;
  detail: RowDetail;
  export: ExportResponse;
}

export interface RequestMessage {
  id: number;
  op: Op;
  payload: unknown;
}

export interface CancelMessage {
  cancel: number;
}

export type ResponseMessage =
  | { id: number; kind: 'progress'; progress: ProgressInfo }
  | { id: number; kind: 'ok'; data: unknown }
  | { id: number; kind: 'error'; code: string; message: string; cancelled: boolean };

export function isResponse(m: unknown): m is ResponseMessage {
  return typeof m === 'object' && m !== null && typeof (m as { id?: unknown }).id === 'number' && typeof (m as { kind?: unknown }).kind === 'string';
}
