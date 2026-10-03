// Ad-hoc screenshot helper: node scripts/shot.mjs <url-path> <out.png> [width] [height] [fullpage]
import { chromium } from '@playwright/test';
const [, , path = '/app/', out = 'shot.png', w = '1440', h = '900', full = '1'] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:4173' + path);
await page.waitForTimeout(Number(process.env.WAIT ?? 800));
await page.screenshot({ path: out, fullPage: full === '1' });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
