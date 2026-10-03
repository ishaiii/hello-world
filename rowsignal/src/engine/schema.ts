/** Runtime validation for configuration objects that cross a trust boundary (worker, recipe import). */
import { z } from 'zod';

export const fileFormatSchema = z.strictObject({
  decimal: z.enum(['.', ',']),
  thousands: z.enum(['none', ',', '.', ' ']),
  currency: z.boolean(),
  dateOrder: z.enum(['DMY', 'MDY', 'YMD']).nullable(),
});

const id = z.string().max(40);
const label = z.string().max(120);
const columnId = z.string().max(20);

export const keyRuleSchema = z.strictObject({
  id,
  label,
  aColumn: columnId,
  bColumn: columnId,
  trim: z.boolean(),
  caseInsensitive: z.boolean(),
});

export const fieldRuleSchema = z.strictObject({
  id,
  label,
  kind: z.enum(['text', 'identifier', 'number', 'date', 'boolean']),
  aColumn: columnId,
  bColumn: columnId,
  trim: z.boolean(),
  caseInsensitive: z.boolean(),
  emptyAsNull: z.boolean(),
  tolerance: z.string().max(60),
});

export const matchConfigSchema = z.strictObject({
  version: z.literal(1),
  keys: z.array(keyRuleSchema).max(10),
  fields: z.array(fieldRuleSchema).max(60),
  formats: z.strictObject({ A: fileFormatSchema, B: fileFormatSchema }),
});

export const columnRefSchema = z.strictObject({
  header: z.string().max(200),
  occurrence: z.number().int().min(1).max(1000),
  of: z.number().int().min(1).max(1000),
});

export const portableConfigSchema = z.strictObject({
  keys: z
    .array(z.strictObject({ label, a: columnRefSchema, b: columnRefSchema, trim: z.boolean(), caseInsensitive: z.boolean() }))
    .max(10),
  fields: z
    .array(
      z.strictObject({
        label,
        kind: z.enum(['text', 'identifier', 'number', 'date', 'boolean']),
        a: columnRefSchema,
        b: columnRefSchema,
        trim: z.boolean(),
        caseInsensitive: z.boolean(),
        emptyAsNull: z.boolean(),
        tolerance: z.string().max(60),
      }),
    )
    .max(60),
  formats: z.strictObject({ A: fileFormatSchema, B: fileFormatSchema }),
});

export const parseOptionsSchema = z.strictObject({
  sheet: z.string().max(200).optional(),
  headerRow: z.number().int().min(1).max(1_048_576).nullable().optional(),
  delimiter: z.enum(['auto', ',', '\t', ';']).optional(),
  encoding: z.enum(['auto', 'utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'windows-1250', 'iso-8859-15']).optional(),
});

export const approxConfigSchema = z.strictObject({
  refs: z.array(z.string().max(50)).max(80),
  threshold: z.number().min(0).max(1),
});

export const manualLinksSchema = z.array(z.strictObject({ aIdx: z.number().int().min(0), bIdx: z.number().int().min(0) })).max(100_000);

export const exportOptionsSchema = z.strictObject({
  format: z.enum(['csv', 'xlsx']),
  scope: z.enum(['all', 'filtered']),
  rowIds: z.array(z.string().max(2000)).nullable().optional(),
  fieldIds: z.array(z.string().max(40)).nullable(),
  includeNormalized: z.boolean(),
  includeReasons: z.boolean(),
  includeRowRefs: z.boolean(),
  includeReview: z.boolean(),
  includeRules: z.boolean(),
  roleNames: z.strictObject({ A: z.string().max(100), B: z.string().max(100) }),
  fileNames: z.strictObject({ A: z.string().max(300), B: z.string().max(300) }),
  sheetNames: z.strictObject({ A: z.string().max(200).nullable(), B: z.string().max(200).nullable() }),
});

export const annotationsSchema = z.record(
  z.string().max(2000),
  z.strictObject({ flag: z.enum(['followup', 'reviewed']).nullable(), note: z.string().max(2000) }),
);
