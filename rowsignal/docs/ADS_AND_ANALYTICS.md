# Advertising and analytics

Both are **off in this build** and the workspace is built so that neither can ever run there.

## Advertising

* `site.ads.enabled` is `false` unless `VITE_ADS_ENABLED=true`; `AdSlot` renders **nothing** unless it is
  enabled *and* a `VITE_ADS_PUBLISHER_ID` is set. There is no placeholder id, no empty "Advertisement"
  box, and no ad script in the repository. `scripts/check-dist.mjs` and `e2e/privacy-network.spec.ts`
  fail the build/tests if ad markup or well-known ad/analytics hosts appear in the output.
* Slots exist only on **public tool pages and guides** (never on the workspace, upload, mapping, results
  or export screens, and not on privacy/terms/methodology).
* `src/public-site/ads.ts` has `adConsentGranted()`, which returns `false`. **No script may be loaded
  until you replace it with a real consent decision.**
* The CSP in `dist/_headers` currently forbids third-party scripts on every page. Enabling ads means
  deliberately widening the **public-page** policy only (never `/app/*`), per your ad provider's current
  documentation.

### Before you enable AdSense (or any ad network)

1. Read the **current** publisher policies and program requirements at that time. Approval is never
   guaranteed, and this repository makes no claim about it.
2. Add a consent-management implementation that satisfies the rules that apply to your visitors (for
   example in the EEA/UK/Switzerland and other regions), and make `adConsentGranted()` reflect it.
3. Keep the workspace ad-free. Consider hosting it on a separate origin (`VITE_APP_URL` /
   `VITE_PUBLIC_URL`, see ARCHITECTURE.md) so a public script can never share an origin with real data.
4. Update `/privacy` to describe exactly what is loaded and why.
5. Re-run `npm test`, `npm run test:e2e` (the privacy specs will need their ad assertions adjusted
   deliberately — that failure is the point), and the manual network audit.

## Analytics

`src/analytics/events.ts` defines a typed event interface and **no sink**. Every `track()` call is a
no-op until the owner calls `setAnalyticsSink(fn)`. Events carry only enumerated, non-sensitive values:

| Event | Fields | Answers |
|---|---|---|
| `sample_opened` | – | sample → own-file activation |
| `own_files_added` | `kinds` | activation |
| `comparison_completed` | `seconds`, `usedRecipe` | completion, time to first useful result |
| `result_exported` | `format` | export rate |
| `recipe_saved` / `recipe_reused` | – | recipe-save and reuse rate |
| `import_failed` | `category` (enum) | parsing/mapping failure rate |

No event may include file names, column names, cell values, keys, notes or row counts; the types make
that impossible by construction. Repeat use can only be measured with a transparent, consented
implementation (for example a first-party aggregate counter). Do not label anything in this repository
as production analytics: the numbers in `docs/benchmarks` are benchmark runs, not user metrics.

A shorter successful session is a good outcome. Do not optimise for time-on-site.
