# RowSignal implementation checklist

Resume point for interrupted sessions. `[x]` = done and verified, `[~]` = partly done, `[ ]` = not started.

## Priority A — reliable product
- [ ] Scaffold (Vite + React + TS, vitest, playwright, eslint), pinned deps + lockfile
- [ ] Engine: exact decimals, dates, field parsing, compound keys
- [ ] Engine: keyed comparison, duplicate/invalid keys, accounting invariant
- [ ] Import: CSV (delimiter/encoding/BOM/multiline), XLSX (guarded zip, sheets, dates, formulas)
- [ ] Sample fixtures (CSV + XLSX) reproduce the brief's expected counts
- [ ] Exports: CSV + XLSX, formula-injection policy, independent read-back tests
- [ ] Worker session + cancellable jobs + stale-result guard
- [ ] App UI: files → rules → results, filters, detail panel

## Priority B — repeat use
- [ ] Recipes (IndexedDB), import/export JSON, schema-change check on rerun
- [ ] Local projects (explicit save), storage dashboard, delete/clear
- [ ] Review annotations

## Priority C — differentiation
- [ ] Approximate suggestions (bounded, cancellable), manual links + undo
- [ ] Side-by-side detail, tolerances, multi-field compare
- [ ] Responsive visual system (360–1440), reduced motion

## Priority D — discovery
- [ ] Public pages (home, 4 tool pages, 3 guides, privacy/terms/methodology/about/contact)
- [ ] Prerender, metadata, sitemap, robots, OG image, structured data
- [ ] Ads/analytics integration points (disabled by default)

## Verification & docs
- [ ] Unit/integration tests pass
- [ ] E2E tests pass (incl. network/CSP audit, a11y, keyboard, mobile)
- [ ] Screenshots reviewed at 360/390/768/1024/1440
- [ ] Benchmarks recorded
- [ ] README, ARCHITECTURE, VERIFICATION report, LAUNCH_CHECKLIST, deployment configs
