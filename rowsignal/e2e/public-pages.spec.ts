import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ROUTES } from '../src/public-site/routes';

test('the "same rows, different order" demo is interactive and honest', async ({ page }) => {
  await page.goto('/');
  const demo = page.getByTestId('reorder-demo');
  await expect(demo).toContainText('Line by line: 4 of 4 rows look different — but only one order actually changed.');
  await demo.getByLabel('By identifier (what RowSignal does)').check();
  await expect(demo).toContainText('By identifier: 1 difference found — order 1004 has quantity 5 in File A and 4 in File B.');
  await demo.getByLabel('Line by line (row position)').check();
  await expect(demo).toContainText('4 of 4');
});

test('the home-page preview and worked result come from the engine (same numbers as the app)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hero-preview')).toContainText('We paired 6 records. Four agree, two have differences.');
  await expect(page.getByTestId('hero-preview')).toContainText('Showing 3 of 12 result rows');
  // The full worked result lists every sample row, labelled with text as well as colour.
  const rows = page.locator('#ex-h').locator('xpath=ancestor::section').locator('tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(page.locator('#ex-h').locator('xpath=ancestor::section')).toContainText('Ambiguous key');
});

test('diagnostics download contains no file or column data', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('main')).toContainText('does not offer a message form');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('diag-download').click()]);
  expect(download.suggestedFilename()).toBe('rowsignal-diagnostics.json');
  const text = readFileSync((await download.path())!, 'utf8');
  const json = JSON.parse(text);
  expect(json.about).toContain('no file names, column names, cell values or results');
  expect(json.limits.maxRows).toBe(100000);
  expect(json.version).toBeTruthy();
  for (const s of ['orders', 'dispatch', '1001', 'Order ID']) expect(text).not.toContain(s);
});

test.describe('phone navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the menu opens and closes with the keyboard and leads somewhere', async ({ page }) => {
    await page.goto('/');
    const menu = page.locator('summary[aria-label="Menu"]');
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Methodology' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Privacy' }).first().click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy');
  });
});

test('every internal link on every public page resolves, and the 404 page is served for unknown paths', async ({ page, request }) => {
  const seen = new Set<string>();
  for (const r of ROUTES) {
    await page.goto(r.path);
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
    for (const h of hrefs) {
      if (h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('http')) continue;
      const path = h.split('#')[0]!;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const res = await request.get(path);
      expect(res.status(), `${r.path} links to ${h}`).toBe(200);
    }
    // Every anchor target inside the page exists.
    const frags = hrefs.filter((h) => h.startsWith('#') && h.length > 1).map((h) => h.slice(1));
    for (const f of frags) expect(await page.locator(`[id="${f}"]`).count(), `${r.path} #${f}`).toBeGreaterThan(0);
  }
  expect(seen.size).toBeGreaterThan(15);
  const missing = await request.get('/definitely-not-a-page');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('Page not found');
});

test('each public page has one h1, a unique title and a description', async ({ page }) => {
  const titles = new Set<string>();
  for (const r of ROUTES) {
    await page.goto(r.path);
    await expect(page.locator('h1')).toHaveCount(1);
    const title = await page.title();
    expect(titles.has(title), `duplicate title ${title}`).toBe(false);
    titles.add(title);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
    // without a configured production URL no canonical/OG url is emitted
    expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  }
});
