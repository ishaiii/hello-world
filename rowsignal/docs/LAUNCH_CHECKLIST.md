# Launch checklist

Nothing here has been done on the owner's behalf: no domain was registered, nothing was deployed, no
ad/analytics service was activated, and no legal identity was invented. Tick each item deliberately.

## 1. Identity and domain (owner-supplied)
- [ ] Choose and register a domain; check name and trademark availability yourself — "RowSignal" is a
      **working brand**, not a claim that it is available.
- [ ] Set `VITE_SITE_URL` (verified production origin, no trailing slash) for the build. Until then no
      canonical URLs, Open Graph URLs, structured data or `sitemap.xml` are emitted (by design).
- [ ] Set `VITE_OPERATOR_NAME` and `VITE_CONTACT_EMAIL` if you have them. With no contact address the
      Contact page offers only the local diagnostics download (it never fakes a message form).
- [ ] Have the Privacy and Terms pages reviewed for your jurisdiction; add governing law and operator
      details. Do not claim certifications or audits you do not have.
- [ ] Decide whether to host the workspace on its own origin (`VITE_APP_URL` / `VITE_PUBLIC_URL`).

## 2. Hosting and headers
- [ ] Build: `npm ci && npm run build` (runs typecheck, both Vite builds, prerender, and `check:dist`).
- [ ] Serve `dist/` as static files with the generated headers: `dist/_headers` (Netlify / Cloudflare
      Pages) or `deploy/nginx.conf.example`. **The privacy page's claim that the workspace cannot make
      network connections depends on `connect-src 'none'` actually being served.** Verify with
      `curl -sI https://YOUR-DOMAIN/app/ | grep -i content-security-policy` and in DevTools → Network.
- [ ] Confirm `X-Robots-Tag: noindex` on `/app/`, HTTPS everywhere, and that `/404.html` is served for
      unknown paths.
- [ ] Run `npm run test:e2e` against the production build (`PORT=… npm run preview`), or repeat its privacy
      checks manually on the deployed origin (no third-party requests, no console output with data).

## 3. Content and data verification
- [ ] Re-open the sample (`/app/?sample=1`): 4 matched, 2 differences, 1 only in A, 2 only in B, 1
      ambiguous group (2 A rows + 1 B row), 2 invalid keys; A and B each account for 10 rows
      (covered by `tests/sample.test.ts` and `e2e/sample-flow.spec.ts`).
- [ ] Download `/samples/orders.xlsx` and `/samples/dispatch.xlsx`, open in Excel/LibreOffice, compare.
- [ ] Read every public page once for claims you cannot stand behind. There are no testimonials, ratings,
      user counts or badges by design; do not add any that are not real.
- [ ] Open Graph image: `public/og-image.png` (regenerate with `node scripts/make-og.mjs`).

## 4. Dependencies
- [ ] `npm audit` (0 findings at build time; `uuid` is pinned via `overrides` for ExcelJS, a dev-only
      test dependency). Re-check at release. Lockfile is committed; versions are pinned exactly.
- [ ] Review `docs/THIRD_PARTY.md` licences. Inter is SIL OFL 1.1 (`/licenses/Inter-OFL-1.1.txt`).

## 5. Optional services (off by default)
- [ ] **Ads:** only after reading `docs/ADS_AND_ANALYTICS.md`: current publisher policies, a real consent
      implementation, a widened public-page CSP, an updated Privacy page. Never in the workspace.
- [ ] **Analytics:** none installed. If you add one, use the typed events only, with any consent required.

## 6. Measurement you may want (collected by nobody by default)
Sample-to-own-file activation, completion rate, export rate, recipe save/reuse, time to first useful
result, parsing/mapping failure rate by category, repeat use (consented only). A short successful
session is a good outcome; never optimise for time on site.

## 7. Backup and support guidance to publish
- Saved projects/recipes live in the visitor's browser: not encrypted, not a backup, can be cleared.
  Tell users to export results they need to keep (the app already says so where it offers to save).
