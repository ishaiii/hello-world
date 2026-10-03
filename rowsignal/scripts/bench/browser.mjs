// Browser benchmark through the real UI. Usage: node scripts/bench/browser.mjs <dir> <rows> <csv|xlsx>
// Requires `npm run build` and the preview server on :4173. Prints JSON.
import { chromium } from '@playwright/test';
import os from 'node:os';

const [, , dir = '/tmp/bench2', rowsArg = '10000', kind = 'csv'] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ entryTypes: ['longtask'] });
});
await page.goto('http://localhost:4173/app/');

const t0 = Date.now();
await page.getByTestId('file-input-A').setInputFiles(`${dir}/a-${rowsArg}.${kind}`);
await page.getByTestId('file-stats-A').waitFor();
const tA = Date.now() - t0;
const t1 = Date.now();
await page.getByTestId('file-input-B').setInputFiles(`${dir}/b-${rowsArg}.${kind}`);
await page.getByTestId('file-stats-B').waitFor();
const tB = Date.now() - t1;
await page.getByTestId('next-rules').click();
await page.getByTestId('apply-suggestions').click();
const fields = await page.locator('[data-testid^="field-row-"]').count();
const t2 = Date.now();
await page.getByTestId('compare-btn').click();
await page.getByTestId('results').waitFor({ timeout: 120000 });
const tCompare = Date.now() - t2;
const summary = await page.getByTestId('summary-sentence').textContent();

const renderedRows = await page.locator('[data-testid="result-table"] [role="row"]').count();
// scroll to the middle of the virtual list and measure how long the next frame takes
const scrollMs = await page.evaluate(async () => {
  const el = document.querySelector('[data-testid="result-table"] .rt__scroll');
  const s = performance.now();
  el.scrollTop = el.scrollHeight / 2;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return performance.now() - s;
});
const renderedAfter = await page.locator('[data-testid="result-table"] [role="row"]').count();
// search narrows the list
const t3 = Date.now();
await page.getByRole('searchbox', { name: 'Search results' }).fill('SKU-00123');
await page.getByTestId('shown-count').filter({ hasText: /Showing \d+ of/ }).waitFor();
await page.waitForFunction(() => !/Showing \d{3,} of/.test(document.querySelector('[data-testid="shown-count"]')?.textContent ?? ''), null, { timeout: 30000 });
const searchMs = Date.now() - t3;
const shown = await page.getByTestId('shown-count').textContent();

const long = await page.evaluate(() => window.__long);
const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
console.log(
  JSON.stringify(
    {
      rows: Number(rowsArg),
      kind,
      fieldsCompared: fields,
      addFileAms: tA,
      addFileBms: tB,
      compareClickToResultsMs: tCompare,
      scrollMidMs: Math.round(scrollMs),
      searchMs,
      domRowsRendered: { top: renderedRows, afterScroll: renderedAfter },
      longestMainThreadTaskMs: Math.round(Math.max(0, ...long)),
      longTasksOver200ms: long.filter((d) => d > 200).length,
      mainThreadHeapMB: heap,
      summary,
      shown: shown?.trim(),
      env: { chromium: browser.version(), cpu: os.cpus()[0]?.model, cores: os.cpus().length },
    },
    null,
    1,
  ),
);
await browser.close();
