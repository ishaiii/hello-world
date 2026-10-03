// Renders public/og-image.png (1200x630) from an inline template. Run: node scripts/make-og.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = readFileSync(join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:Inter,sans-serif;background:#f6f8fc;color:#17253b;position:relative;overflow:hidden}
.lines{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 47px,rgba(36,87,214,.07) 47px 48px)}
.wrap{position:relative;display:flex;height:100%;padding:64px 72px;gap:48px;align-items:center}
.l{flex:1.05}.brand{display:flex;align-items:center;gap:14px;font-weight:800;font-size:34px;letter-spacing:-.02em;margin-bottom:44px}
.brand b{color:#2457d6}
h1{font-size:62px;line-height:1.02;letter-spacing:-.035em;font-weight:800}
p{margin-top:26px;font-size:28px;line-height:1.35;color:#52627a;max-width:520px}
.card{flex:.95;background:#fff;border:2px solid #dce3ed;border-radius:22px;padding:26px;box-shadow:0 22px 60px rgba(23,37,59,.14)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;border-bottom:1px solid #dce3ed;font-size:22px}
.row:last-child{border:0}.k{font-family:ui-monospace,Menlo,monospace;font-weight:700}
.b{display:inline-flex;align-items:center;gap:8px;padding:5px 14px;border-radius:99px;font-weight:700;font-size:19px;border:1px solid}
.g{background:#e7f5f2;color:#066b65;border-color:#b9e0d9}.w{background:#fff4db;color:#925b08;border-color:#efd7a0}.i{background:#eaf0ff;color:#1c43a8;border-color:#c3d3fb}
.d{background:#fff4db;border-left:5px solid #d9a441;padding:3px 12px;border-radius:5px;font-family:ui-monospace,monospace;font-size:19px;line-height:1.3}
.t{font-weight:700;font-size:21px;margin-bottom:8px;color:#52627a}
</style></head><body><div class="lines"></div><div class="wrap">
<div class="l"><div class="brand"><svg width="46" height="46" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2457d6"/><g fill="#fff"><rect x="5.5" y="8" width="8.5" height="3" rx="1.5"/><rect x="5.5" y="14.5" width="8.5" height="3" rx="1.5"/><rect x="5.5" y="21" width="8.5" height="3" rx="1.5"/><rect x="18" y="8" width="8.5" height="3" rx="1.5" opacity=".92"/><rect x="18" y="21" width="8.5" height="3" rx="1.5" opacity=".92"/></g><rect x="18" y="14.5" width="8.5" height="3" rx="1.5" fill="#7fe3d8"/></svg><span>Row<b>Signal</b></span></div>
<h1>Two spreadsheets.<br>A clear answer.</h1><p>Find missing rows, changed values and duplicates — on your own device.</p></div>
<div class="card"><div class="t">Orders vs dispatch · sample</div>
<div class="row"><span class="k">1001</span><span class="b g">✓ Matched</span></div>
<div class="row"><span class="k">1004</span><span class="b w">± Different</span><span class="d">A 5<br>B 4</span></div>
<div class="row"><span class="k">1007</span><span class="b i">◀ Only in A</span></div>
<div class="row"><span class="k">1008</span><span class="b w">≡ Ambiguous key</span></div></div>
</div></body></html>`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: join(root, 'public/og-image.png') });
await browser.close();
console.log('wrote public/og-image.png');
