// Curated screenshots for docs/screenshots (needs `npm run build` and the preview server on :4173).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const base = 'http://localhost:4173';

async function shoot(name, width, height, steps, full = true) {
  const page = await browser.newPage({ viewport: { width, height } });
  await steps(page);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  await page.close();
}

await shoot('01-home-desktop-1440', 1440, 900, async (p) => { await p.goto(base + '/'); }, false);
await shoot('02-home-full-390', 390, 844, async (p) => { await p.goto(base + '/'); });
await shoot('03-tool-page-excel-1024', 1024, 900, async (p) => { await p.goto(base + '/compare-excel-files'); }, false);
await shoot('04-workspace-files-1440', 1440, 900, async (p) => { await p.goto(base + '/app/'); }, false);
await shoot('05-workspace-files-loaded-1440', 1440, 900, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); await p.getByRole('button', { name: /^Files/ }).click(); });
await shoot('06-rules-1440', 1440, 900, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); await p.getByRole('button', { name: /^Match rules/ }).click(); await p.getByTestId('diagnostics').waitFor(); });
await shoot('07-results-1440', 1440, 900, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); });
await shoot('08-detail-drawer-1440', 1440, 900, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); await p.getByRole('button', { name: /Open details for 1004/ }).click(); await p.getByTestId('detail').locator('table').first().waitFor(); }, false);
await shoot('09-export-dialog-1440', 1440, 900, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); await p.getByTestId('export-open').click(); }, false);
await shoot('10-results-cards-390', 390, 844, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); });
await shoot('11-possible-matches-1440', 1440, 900, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); await p.getByTestId('possible-matches').locator('summary').click(); await p.getByTestId('find-possible').click(); await p.getByTestId('suggestions').waitFor(); await p.getByTestId('possible-matches').scrollIntoViewIfNeeded(); }, false);
await shoot('12-results-tablet-768', 768, 1024, async (p) => { await p.goto(base + '/app/?sample=1'); await p.getByTestId('results').waitFor(); }, false);
await browser.close();
console.log('screenshots written to docs/screenshots');
