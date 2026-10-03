# Architecture

A short note on how RowSignal works, where the privacy boundary is, and what the matching rules are.
User-facing wording of the same rules lives on the `/methodology` and `/privacy` pages; the code is the
source of truth, and the test names below point at the behaviour each rule is pinned by.

## Shape of the project

```
src/engine/       Pure, DOM-free matching engine (runs in the worker, in Node tests, at build time)
src/import/       CSV and XLSX readers, encodings, limits, header/sheet handling
src/export/       CSV/XLSX writers, formula-injection policy
src/worker/       Worker protocol (zod-validated), EngineSession (owns parsed data), client
src/storage/      IndexedDB recipes and projects (explicit save only)
src/app/          React workspace (/app): files → match rules → results
src/public-site/  Server-rendered public pages + two tiny interactive islands
src/shared/       Components used by both (status badges, result cells, logo)
src/sample/       The brief's sample and the worked examples (real files + real configs)
scripts/          prerender, static server, fixtures, benchmarks, checks
```

Build output (`dist/`) is entirely static: HTML for 13 public pages + 404, the workspace SPA at `/app/`,
hashed JS/CSS/font assets, sample files, and a generated `_headers` file with the security policy.

## Local processing and the privacy boundary

* A file's bytes are read with the browser File API in the workspace tab and handed to a **module Web
  Worker**. The worker owns the parsed tables (`EngineSession`); the UI thread keeps only one copy of the
  raw bytes (so a crashed or cancelled worker can be rebuilt) and the compact result rows.
* There is **no server component** and no code path that sends file bytes, names, column names, cell
  values, keys, notes or results anywhere. `/app/*` is served with `connect-src 'none'` and the worker
  script with the same, so the browser itself forbids any network connection from either context; the
  e2e privacy spec asserts the headers, every request made while processing real files, absence of CSP
  violations, absence of console output containing file content, and an unchanged address bar.
* The workspace and the public site are **separate bundles**. Entering `/app/` from a public page is a
  full navigation (plain `<a>`), so no public script survives into the workspace (asserted by test). The
  two can also be hosted on different origins: set `VITE_APP_URL` (public build) and `VITE_PUBLIC_URL`
  (workspace build); all cross-links go through `appHref()` / `publicHref()`.
* Text from files is only ever rendered as React text (escaped), never as HTML; hyperlinks in cells are
  not links; formulas are not evaluated; macros are never read or run.
* Error messages shown to users are written for display. Unexpected exceptions are reduced to a generic
  message in the worker so no exception text can carry cell content (tested). Production code does not
  log (`no-console` is an error in `src/`).

## Data model

* `SheetGrid` — the sheet as read: non-blank rows only, with their **source row numbers**, plus a
  per-row `Uint8Array` of cell flags (stored-as-number, date, boolean, error, formula, formula without a
  saved result). Flags keep what the file said without bloating memory.
* `ArrayTable` — a header-interpreted view (header row chosen by source row number, or none). Columns
  get stable ids `c<index>`; duplicate headers are disambiguated (`Qty (column D)`).
* `MatchConfig` — identifiers, compared values (type + explicit options), and per-file number/date
  formats. It is persisted with every result and written to exports.

## Matching semantics (src/engine)

1. **Identifiers** are exact strings. Optional per-rule trim / case-fold are off by default. A compound
   key is serialised as length-prefixed parts (`serializeKey`), so `a|b`+`c` cannot equal `a`+`b|c`.
2. A row with a blank/whitespace-only identifier part, an error cell, or a formula without a saved result
   is an **invalid key** and is never matched.
3. Identifiers are grouped. A group with more than one row on either side is **ambiguous**: no pairing is
   attempted and no row is reused (no Cartesian product). One row on each side → a **pair**; one side
   only → **only in A / B**.
4. A pair is **matched** only if every selected value agrees; otherwise **different**, with one
   plain-language reason per value. Unreadable values make a pair different and say why.
5. **Numbers** use BigInt-scaled exact decimals (`decimal.ts`) — no floating point. Per-file decimal and
   thousands separators (incl. Indian grouping), optional currency-symbol stripping (no conversion),
   tolerance `|a−b| ≤ t` with default 0. Blank, 0, the text `NULL`, and malformed numbers are distinct.
   Numbers *stored as numbers* in XLSX are rounded to Excel's 15 significant digits.
6. **Dates** are calendar days with no time zone. Numeric day/month text needs the file's order (blocking
   until chosen when such text exists); year-first and month-name dates are unambiguous. Excel serials
   use the workbook's own system (1900 incl. the fake 29 Feb 1900, or 1904).
7. **Accounting**: every eligible row of each file appears exactly once (`computeAccounting` also detects
   a row index used twice). The worker refuses to publish an unbalanced result.
8. **Approximate suggestions** (`suggest.ts`): optional, bounded, one-to-one; Dice similarity over
   character bigrams (text), relative closeness (numbers), equality (dates/booleans); candidate blocking
   with a trigram index; caps on candidate pairs, elapsed time and pool size, reported when hit. Accepted
   links are transactional (`applyManualLinks`), labelled *Manually linked*, keep both identifiers, and
   are undoable.

## Limits and hostile input

Starting limits (central in `src/import/limits.ts`, shown in the UI): 10 MiB, 100,000 populated rows,
100 columns, 2,000,000 populated cells per file. XLSX is read by `import/xlsx`:

* the ZIP central directory is parsed first (entry count capped); entries are inflated in 16 KiB input
  slices against one **cumulative decompressed-byte budget** (256 MiB) — declared sizes are never
  trusted; encrypted entries, ZIP64 and DTDs (`<!DOCTYPE`/`<!ENTITY`) are refused;
* sheet XML is scanned as a stream; a `<dimension>` attribute is never used to size anything; columns
  past the limit raise an error instead of allocating; there is a wall-clock budget;
* OLE2 containers (legacy `.xls`, password-protected workbooks) are detected and explained.

Tested with a ~64 MB and a ~300 MB decompression bomb, an entry-count bomb, a DTD, a huge declared
dimension, truncated/garbage archives, an encrypted-flag archive, and cell/row/column/time limits.

## Concurrency

Every request has a job id. The client ignores replies for ids it no longer waits for. Cancel is
cooperative (jobs `await` a macrotask every few thousand rows and check a flag); if the worker has not
stopped within a grace period it is terminated, recreated, and the loaded files are replayed from the
retained bytes. A restarted worker marks displayed results out of date. Any change to files or rules
marks the current result **out of date** (details, links and export pause until it is re-run).

## Persistence

Nothing is stored unless the user presses a save button. IndexedDB (`rowsignal` DB) holds `recipes`,
`projects` (metadata) and `projectData`; the database is not even created until the first save
(`dbExists()` checks first). Deleting a project removes metadata *and* data in one transaction (tested
against the raw stores). Data is not encrypted and not a backup; the UI says so wherever it offers to
save. Recipes hold header names, labels, rules and formats — never rows — and are validated with a strict
schema on import (unknown keys are rejected).

## Exports

`export/build.ts` builds CSV or a multi-sheet XLSX from the engine result. Formula-injection policy:
`export/safeText.ts` (documented at the top of the file and on `/methodology`). XLSX is written with
inline *string* cells only (there is no code path that emits a formula) plus Excel's quote-prefix style
for text that starts with a formula character. Exports are verified in tests by reading the produced
bytes back with ExcelJS and openpyxl, independent of the UI.

## Decisions worth knowing

* **Own XLSX reader/writer on `fflate`** instead of the npm `xlsx` package (stuck at an advisory-affected
  0.18.5 on npm). It is tested against files produced by openpyxl and ExcelJS and with hostile archives.
* **BigInt decimals** instead of a decimal library: ~100 lines, no dependency, exhaustively tested.
* **TypeScript 6.0 / ESLint 9**: typescript-eslint and jsx-a11y do not yet support TS 7 / ESLint 10.
* **zod in jitless mode** (`src/engine/schema.ts`): its JIT probes `new Function`, which a strict CSP
  forbids and reports.
* **No dark mode** in this release (optional in the brief; the token structure makes it a contained
  addition, but it was not built or contrast-verified, so it is not offered).
