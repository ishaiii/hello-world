# RowSignal — Compare Spreadsheets. Resolve Differences.

A calm, precise tool for finding what changed, what's missing and what needs attention between two
spreadsheets (CSV or Excel `.xlsx`), built for small businesses, online sellers and office teams in the US
and India. **Everything runs in the browser: files are never uploaded.**

* Public site (prerendered, no framework runtime needed to read it): home, four tool pages, three guides,
  privacy, terms, methodology, about, contact.
* Workspace at `/app/`: **Files → Match rules → Results**, with exact keyed matching, duplicate/blank-key
  handling, per-file number/date formats, tolerances, a side-by-side detail panel, review notes, CSV/XLSX
  export, reusable **recipes**, optional **local projects**, and optional approximate-match suggestions.

"RowSignal" is a working brand — domain and trademark availability have **not** been checked.

## Quick start

```bash
npm ci                 # Node >= 22
npm run dev            # http://localhost:5173  (public pages are server-rendered on the fly; workspace at /app/)

npm test               # 140 unit/integration tests (vitest)
npm run lint           # eslint (typescript-eslint, react-hooks, jsx-a11y)
npm run typecheck      # tsc --noEmit

npm run build          # typecheck + client build + SSR build + prerender + dist checks
npm run preview        # serves dist/ on :4173 *with the generated security headers*
npm run test:e2e       # 46 Playwright specs against the preview server (see below)
```

`npm run test:e2e` expects Chromium. In this repository's environment it is at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (set `PW_CHROMIUM` to use another). Do not run
`playwright install` there.

Useful scripts: `npm run fixtures` (regenerate `public/samples/*`), `node scripts/make-og.mjs` (OG image),
`node scripts/capture-screenshots.mjs` (docs/screenshots), `scripts/bench/*` (benchmarks, see
`docs/VERIFICATION.md`), `python3 scripts/make-test-fixtures.py` (independent openpyxl test inputs).

## Try it

* `/app/?sample=1` opens the brief's sample comparison and runs it through the real engine.
* Sample files to download: `/samples/orders.csv`, `dispatch.csv`, `orders.xlsx`, `dispatch.xlsx`.
* Expected result (CSV and XLSX identical): **4 matched pairs, 2 pairs with differences (1004 quantity,
  1005 amount), 1 only in A (1007), 2 only in B (1009, 1010), 1 ambiguous key (1008: 2 A rows + 1 B row),
  1 invalid key in each file.** A and B each account for 10 rows (6 + 1 + 2 + 1 and 6 + 2 + 1 + 1).

## Configuration

Build-time `VITE_*` variables (see `.env.example`): `VITE_SITE_URL`, `VITE_APP_URL`, `VITE_PUBLIC_URL`,
`VITE_OPERATOR_NAME`, `VITE_CONTACT_EMAIL`, `VITE_ADS_ENABLED`, `VITE_ADS_PUBLISHER_ID`. None is a secret —
they are compiled into public code. Limits live in `src/import/limits.ts`.

## Deployment

`dist/` is plain static files. Serve it with the headers in `dist/_headers` (Netlify/Cloudflare Pages) or
`deploy/nginx.conf.example`. The most important header is the workspace's
`Content-Security-Policy: … connect-src 'none' …`. Read `docs/LAUNCH_CHECKLIST.md` before going public —
it lists everything that needs an owner's decision (domain, identity, legal review, ads, consent).

## Documentation

| | |
|---|---|
| `docs/ARCHITECTURE.md` | Local processing, privacy boundary, matching semantics, limits, persistence |
| `docs/VERIFICATION.md` | What was tested and observed, benchmarks, honest limitations |
| `docs/LAUNCH_CHECKLIST.md` | Owner actions before launch |
| `docs/ADS_AND_ANALYTICS.md` | Disabled-by-default integration points and what enabling them requires |
| `docs/THIRD_PARTY.md` | Dependencies and licences |
| `docs/IMPLEMENTATION_CHECKLIST.md` | Status by brief priority |
| `docs/screenshots/` | Rendered screenshots (desktop, tablet, phone) |

## Selected dependency versions

React 19.3.0 · Vite 8.3.2 · TypeScript 6.0.3 · Vitest 5.0.3 · Playwright 1.63.0 · fflate 0.8.3 ·
PapaParse 5.7.0 · idb 8.0.3 · zod 4.6.5 · lucide-react 1.51.0 · Inter (Fontsource) 5.3.0. All pinned
exactly; `npm audit` reports 0 findings.

## Known limitations (honest list)

* Not built: dark mode (optional in the brief), the out-of-scope items (bank/payment/cloud/team/
  scheduling/macros/API integrations/PDF-OCR/unrestricted fuzzy joins/automatic one-to-many matching).
* Not verified: a screen reader (NVDA/JAWS/VoiceOver) pass, real Safari/Firefox runs, Windows/macOS
  Excel opening the exported files (they were read back with openpyxl and ExcelJS), and a hosted deployment
  — none were available in the build environment. Automated axe checks and manual keyboard flows passed.
* At the 100,000-row limit the browser stays responsive but there is a ~0.5–1.1 s main-thread pause
  when results arrive, a heap of roughly 150 MB on the UI thread and up to ~400 MB in the worker (measured
  in Node) for a 100k×12 XLSX pair. Timings are from one 4-vCPU machine and are not a promise.
* The XLSX reader is purpose-built for cell values: it does not render number formats (cells show the
  stored value), rich formatting, merged-cell structure, charts or pivot tables.
* Dates are compared as calendar days; a time of day is ignored by the date type.
