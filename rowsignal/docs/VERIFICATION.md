# Verification report

What was run, what was observed, and what was **not** verified. Everything below was executed in the
build environment (Linux, Node 22.22.0, Chromium 141 via Playwright 1.63, 4 vCPU Intel Xeon @ 2.10 GHz,
16 GB RAM). Nothing here is a claim about other machines, and no hosted deployment exists.

## Summary

| Check | Command | Observed |
|---|---|---|
| Type check | `npm run typecheck` | clean (TypeScript 6.0.3, strict) |
| Lint | `npm run lint` | clean (typescript-eslint, react-hooks, jsx-a11y) |
| Unit / integration | `npm test` | **140 passed**, 0 failed (11 files) |
| Production build | `npm run build` | passes, including `check:dist` for 15 HTML files, with and without `VITE_SITE_URL` |
| End-to-end (Chromium) | `npm run test:e2e` | **46 passed**, 0 failed, 0 flaky |
| Dependency audit | `npm audit` | 0 vulnerabilities (`uuid` pinned by `overrides` for the dev-only ExcelJS) |
| Clean-room reproduction | `git archive HEAD` → `npm ci` → lint, typecheck, test, build, e2e | all passed on the committed tree (46 e2e at that commit) |

Unit tests by file: engine 32 · CSV import 21 · XLSX import (openpyxl files) 14 · hostile XLSX 12 ·
ExcelJS cross-check 4 · export 14 · suggestions/diagnostics/recipes 16 · worker protocol 10 ·
storage 9 · worked examples 6 · brief sample 2.

E2E specs by area: automated accessibility (axe) 16 · sample flow 4 · upload + recipe + rerun 4 ·
duplicates, projects, discard guard 4 · privacy/network/CSP 3 · public pages 5 + phone nav 1 ·
keyboard 2 + mobile 1 + overflow at 5 widths 5 · approximate suggestions 1.

## How the brief's required tests (§16) are covered

| Requirement | Evidence |
|---|---|
| 1 Exact sample counts, CSV **and** XLSX | `tests/sample.test.ts`; `e2e/sample-flow.spec.ts` (UI chips and summary sentence) |
| 2 Shuffling rows does not change classification | `engine.test.ts` "independent of row order" (6 seeded shuffles of either file) |
| 3 `00123` ≠ `123` | `engine.test.ts` "identifiers are exact strings" |
| 4 Compound keys cannot collide | `engine.test.ts` "compound keys cannot collide" (serialiser + real comparison) |
| 5 Duplicate/blank keys never silently paired | `engine.test.ts` "duplicate and blank keys" (A-only, B-only, both, no Cartesian product) |
| 6 Whitespace/case only when enabled | `engine.test.ts` "field rules are applied only when enabled"; e2e "without the explicit trim/case rules…" |
| 7 Tolerance, precision, negatives, blanks, malformed | `engine.test.ts` "decimal arithmetic is exact" (boundary `<=`, 0.1+0.2 style, blank ≠ 0 ≠ NULL ≠ malformed, per-file formats) |
| 8 Dates: ambiguous, invalid, both systems, no TZ shift | `engine.test.ts` "dates" (runs under four TZ values); `import-xlsx.test.ts` (1900 incl. serial 60, 1904) |
| 9 Formula cache / no cache / no execution | `import-xlsx.test.ts` (openpyxl: no cached result → flagged), `import-exceljs.test.ts` (cached result used) |
| 10 CSV quirks, BOM, non-Latin, encodings | `import-csv.test.ts` (21 cases incl. UTF-16, Windows-1252, `sep=`) |
| 11 Duplicate headers, header row, blank rows, sheets, changed schemas | `import-csv/xlsx.test.ts`; `suggest-portable.test.ts` "recipes: portable config and schema changes"; e2e "a changed header is never silently remapped" |
| 12 Suggestions never double-consume; accept/undo keep accounting | `suggest-portable.test.ts`; `e2e/possible-matches.spec.ts` |
| 13 Export injection protection; identifiers preserved | `export.test.ts` (CSV + XLSX read back with ExcelJS; sheet names; control chars; 32,767 limit) |
| 14 Malformed, limits, decompression, cancel/restart, worker errors, stale | `import-hostile.test.ts` (64 MB and 300 MB bombs stopped by the budget, entry count, DTD, huge dimension, truncated/garbage/encrypted archives, row/cell/column/time limits); `worker.test.ts` (cooperative cancel, hard reset with file replay, crash recovery, stale replies, validation, no leakage in error text) |
| 15 Persistence only after opt-in; delete really deletes | `storage.test.ts` (no DB created by looking; raw-store counts after delete); `e2e/duplicates-and-projects.spec.ts` (IndexedDB inspected after a full comparison, then after delete) |

E2E flows from §16: landing → sample → inspect → filter → export ✔ · upload → map → compare → save recipe →
rerun with reordered files ✔ · duplicate key → understand → add identifier ✔ · save project → reload →
reopen → delete → verify gone ✔ · keyboard-only flow ✔ · mobile flow ✔ · network/script/console audit ✔.

## Exports were verified independently of the UI

The downloaded bytes are re-read with **ExcelJS** (Node) and **openpyxl** (Python, a different
implementation) — sheet names, per-category row counts, string-typed identifiers, raw values such as
`1,200.00` and `" MUG "`, source row numbers, summary counts and balanced accounting, zero formula cells,
and formula-like text stored as literal strings. The Playwright sample flow also loads the file it downloads
with ExcelJS. **Not done:** opening exports in desktop Excel/LibreOffice (not available here).

## Privacy and security audit (e2e/privacy-network.spec.ts)

While processing real files, building results, opening details and exporting, the spec asserts: every
request is a same-origin `GET` for a static asset with no body or query string, none containing file
names or values; no `securitypolicyviolation` events; no external script/style/frame/image in the DOM; the
page URL never changes; the console holds no warnings/errors and nothing containing file content; `/app/`
responds with `connect-src 'none'`, `default-src 'none'`, `X-Robots-Tag: noindex`; the worker script has its
own `connect-src 'none'` policy; public pages load no ad/analytics hosts; and a global set on a public page
does not survive entering the workspace (hard navigation).

## Accessibility

* **Automated:** axe-core with the WCAG 2.0/2.1/2.2 A and AA tags reports **no violations** on all 13 public
  pages and the 404 page, and on the workspace at every step and dialog (files empty/loaded, rules,
  results in scrolling/pages/cards modes, detail drawer, export, recipes, saved, help, possible matches).
* **Keyboard:** a complete keyboard-only run (file chooser → rules → compare → open details → Escape,
  focus returns to the same control); shortcuts (`/`, `J`/`K`) work outside fields and never inside them.
* **Found and fixed by these checks:** 20 px checkboxes below WCAG 2.2's 24 px target size; an `aria-label`
  on a role-less container; focus dropping to `<body>` after a file loads or is removed.
* **Not done:** a real screen-reader pass (NVDA/JAWS/VoiceOver), 200 % browser-zoom walkthrough by a person,
  forced-colours mode. The live region announces stage completions and errors without reading result rows,
  and a paginated and a card mode exist as alternatives to the virtualised grid, but they have not been
  heard through a screen reader.

## Responsive layout

No horizontal page overflow at 360, 390, 768, 1024 and 1440 px on every public page and on the workspace
files / rules / results screens (e2e). Screenshots were reviewed at 1440, 1024, 768 and 390 px
(`docs/screenshots/`). The overflow check caught a real bug (absolutely positioned visually-hidden text
inside scrolling tables widened the page by up to 158 px on phones) which is fixed.

## Defects found by verification (and fixed)

* Mapping suggestion rejected an ID column as the key because a duplicate lowered its uniqueness.
* A text difference caused by *both* spaces and case named no remedy in its reason.
* zod's JIT probe triggered CSP `unsafe-eval` reports; the engine worker script had no CSP of its own.
* Homepage overflow on phones; focus loss after file load; discard guard ran its action inside a state
  updater; a saved header row missing from a new file produced an internal error instead of a warning.

## Benchmarks

Machine: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, 16 GB; Node v22.22.0; Chromium 141.0.7390.37.
Fixtures: N rows × 12 columns (text, ints, decimals, dates, booleans), file B shuffled with ~3 % removed,
~3 % added and ~5 % changed (`scripts/bench/generate.ts`). Raw outputs: `docs/benchmarks/*.json`.
**One machine, one run each — these are observations, not guarantees.**

### Engine only (Node, `scripts/bench/engine.ts`; 5 compared fields)

| Rows | Format | File size A / B (MB) | Parse A / B (ms) | Compare (ms) | Heap (MB) | Accounting balanced |
|---|---|---|---|---|---|---|
| 10,000 | CSV | 0.8 / 0.8 | 32 / 14 | 217 | 41 | yes |
| 10,000 | XLSX | 0.6 / 0.7 | 254 / 201 | 186 | 59 | yes |
| 50,000 | CSV | 4.0 / 4.0 | 79 / 146 | 826 | 129 | yes |
| 50,000 | XLSX | 3.2 / 3.3 | 999 / 934 | 831 | 216 | yes |
| 100,000 | CSV | 8.0 / 8.0 | 169 / 209 | 1,870 | 252 | yes |
| 100,000 | XLSX | 6.4 / 6.7 | 1,932 / 1,855 | 1,784 | 413 | yes |

### Through the real UI (Chromium, `scripts/bench/browser.mjs`; suggested pairs → 11 compared fields)

| Rows | Format | Add file A / B (ms) | Compare click → results (ms) | Longest main-thread task (ms) | Tasks > 200 ms | DOM rows rendered | Scroll to middle (ms) | Search (ms) | UI-thread heap (MB) |
|---|---|---|---|---|---|---|---|---|---|
| 10,000 | CSV | 195 / 103 | 1,396 | 76 | 0 | 20–28 | 12 | 113 | 26 |
| 10,000 | XLSX | 438 / 324 | 1,395 | 91 | 0 | 20–28 | 15 | 129 | 26 |
| 100,000 | CSV | 326 / 214 | 8,232 | 539 | 3 | 20–28 | 29 | 409 | 153 |
| 100,000 | XLSX | 2,433 / 2,320 | 9,398 | 1,096 | 3 | 20–28 | 117 | 535 | 142 |

Reading these honestly:

* The interface stays responsive during work (parsing and matching run in a worker, the table renders
  only ~20–28 rows regardless of size), but when a 100,000-row result arrives there is a main-thread pause
  of roughly 0.5 s (CSV) to 1.1 s (XLSX) while it is received and the first view is built.
* Time to first useful result is ~1.4 s for 10,000 rows × 12 columns on this machine; ~8–9 s at the
  100,000-row limit (eleven compared values, results of ~103,000 rows).
* Memory: the worker held up to ~415 MB of JS heap for a 100k × 12 XLSX pair in the Node run, because both
  grids are kept as text. A device with little memory may struggle at the top of the limits; lower the
  limits in `src/import/limits.ts` if your audience needs it.
* The 2,000,000-cell limit was not stress-tested in a browser at its extreme (a 100 × 20,000 sheet).

## Not verified / limitations

* Real devices, Safari, Firefox, Edge; touch gestures beyond the emulated mobile viewport.
* Screen readers; high-contrast/forced-colours; browser zoom by a person.
* Desktop Excel / LibreOffice / Google Sheets opening the generated `.xlsx` and `.csv` files.
* A deployed site: headers were exercised only through `scripts/serve.mjs`, which applies the generated
  `_headers` file; host-specific behaviour (for example how a CDN merges duplicate headers) is untested.
* IndexedDB behaviour in private windows or under storage pressure (error mapping is unit-tested with
  synthetic `QuotaExceededError`/`SecurityError`).
* Dark mode was deliberately not built (optional in the brief).
* The XLSX reader is purpose-built for cell values. It does not apply number formats for display, so a
  cell shown as `1,200.00` in Excel appears as its stored value `1200`; comparison uses stored values.
