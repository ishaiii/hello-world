# Third-party software

Exact versions are pinned in `package.json` and `package-lock.json`.

## Shipped to users (bundled, no runtime CDN)

| Package | Version | Licence | Used for |
|---|---|---|---|
| react, react-dom | 19.3.0 | MIT | UI and server rendering of the public pages |
| fflate | 0.8.3 | MIT | Inflate for XLSX (metered), ZIP writing for exports |
| papaparse | 5.7.0 | MIT | Quoted-field CSV parsing |
| idb | 8.0.3 | ISC | IndexedDB wrapper (opt-in saves) |
| zod | 4.6.5 | MIT | Validation of worker messages and recipe files (jitless) |
| lucide-react | 1.51.0 | ISC | Outlined icon set |
| @fontsource-variable/inter | 5.3.0 | SIL OFL 1.1 | Inter variable font, latin + latin-ext only; licence in `/licenses/Inter-OFL-1.1.txt` |

## Development and verification only

vite 8.3.2, @vitejs/plugin-react 6.1.1, typescript 6.0.3, vitest 5.0.3, @playwright/test 1.63.0,
@axe-core/playwright 4.13.0 (MPL-2.0, test-time only), eslint 9.39.5 with typescript-eslint 8.71.0,
eslint-plugin-react-hooks 7.1.1, eslint-plugin-jsx-a11y 6.10.2, fake-indexeddb 6.2.5, exceljs 4.4.0
(independent XLSX reader in tests), tsx 4.23.15. openpyxl (Python, not a dependency) was used to
generate fixtures and to read exports back.

## Not used

The `xlsx` ("SheetJS") package from npm is deliberately not used: its npm releases stopped at an
advisory-affected version. RowSignal has its own guarded reader/writer instead (see ARCHITECTURE.md).
