# RowSignal implementation checklist

`[x]` = built and verified (tests named in docs/VERIFICATION.md), `[~]` = partly, `[ ]` = not built.

## Priority A — reliable product
- [x] Scaffold (Vite + React + TS, vitest, playwright, eslint), pinned deps + lockfile
- [x] Engine: exact decimals, explicit dates, field parsing, collision-safe compound keys
- [x] Engine: keyed comparison, duplicate/invalid keys, accounting invariant
- [x] Import: CSV (delimiter/encoding/BOM/multiline/sep=), XLSX (guarded zip, sheets, header row, dates, formulas, hidden)
- [x] Sample fixtures (CSV + XLSX) reproduce the brief's expected counts
- [x] Exports: CSV + XLSX, formula-injection policy, independent read-back (ExcelJS, openpyxl)
- [x] Worker session, cancellable jobs, stale-result guard, hard reset with file replay
- [x] App UI: files → rules → results, filters, virtualized table + accessible pages mode, detail panel

## Priority B — repeat use
- [x] Recipes (IndexedDB), JSON import/export with strict validation, schema-change check on rerun
- [x] Local projects by explicit save; storage dashboard; delete/clear (verified against raw stores)
- [x] Review annotations (never change the algorithmic status), included in exports only on request
- [x] Replace-unsaved-work confirmation; beforeunload warning

## Priority C — differentiation
- [x] Approximate suggestions (bounded, cancellable, one-to-one), manual links + undo, accounting kept balanced
- [x] Side-by-side detail with normalised values and exact reasons, tolerances, multiple compared fields
- [x] Responsive visual system (360–1440), reduced motion, mobile cards
- [ ] Dark mode (optional in the brief — deliberately not built rather than shipped unverified)

## Priority D — discovery
- [x] Public pages (home, 4 tool pages, 3 guides, privacy/terms/methodology/about/contact) with
      engine-computed worked examples
- [x] Prerender, unique metadata, sitemap/robots/canonical only with a configured URL, OG image, accurate JSON-LD
- [x] Ads/analytics integration points, disabled by default and tested absent

## Verification & docs
- [x] 139 unit/integration tests pass
- [x] 40 e2e specs pass (flows, privacy/network/CSP audit, axe on every page/step/dialog, keyboard, mobile, overflow at 5 widths)
- [x] Screenshots reviewed (desktop/tablet/phone) and issues fixed
- [x] Benchmarks recorded (docs/benchmarks, docs/VERIFICATION.md)
- [x] README, ARCHITECTURE, VERIFICATION, LAUNCH_CHECKLIST, ADS_AND_ANALYTICS, THIRD_PARTY, deploy examples
- [ ] Owner actions: domain, identity/contact, legal review, hosting with the generated headers (see LAUNCH_CHECKLIST)
- [ ] Not verified here: real screen reader, Safari/Firefox, Excel desktop opening the exports, hosted deployment
