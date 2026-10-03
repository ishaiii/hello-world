import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { SAMPLE_COUNTS, expectCounts } from './helpers/app';

test('landing page → sample comparison → inspect changed quantity → filter Only in B → export', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Two spreadsheets. A clear answer.');
  await page.getByRole('link', { name: 'Try sample comparison' }).first().click();

  // The sample runs through the real engine and is clearly labelled.
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByText('Sample data').first()).toBeVisible();
  await expect(page.getByTestId('summary-sentence')).toHaveText('We paired 6 records. Four agree, two have differences. Review unmatched records, ambiguous keys, and invalid identifiers below.');
  await expectCounts(page, SAMPLE_COUNTS);
  await expect(page.getByTestId('shown-count')).toContainText('Showing 12 of 12');
  expect(page.url()).not.toContain('sample'); // start-up flags are removed from the address bar

  // Inspect the changed quantity (order 1004: A has 5, B has 4).
  await page.getByRole('button', { name: /Open details for 1004/ }).click();
  const detail = page.getByTestId('detail');
  await expect(detail).toContainText('Quantity: A has 5, B has 4.');
  await expect(detail.getByRole('row', { name: /Quantity/ })).toContainText('Different');
  await expect(detail.getByRole('row', { name: /Amount/ })).toContainText('Same');
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  // Filtering changes what is shown, never the counts.
  await page.getByTestId('chip-only-b').click();
  await expect(page.getByTestId('shown-count')).toContainText('Showing 2 of 12');
  await expectCounts(page, SAMPLE_COUNTS);
  await expect(page.getByTestId('result-table').getByRole('row')).toHaveCount(3); // header + 1009 + 1010

  // Export the filtered view and verify the downloaded file independently of the UI.
  await page.getByTestId('export-open').click();
  await page.getByLabel('Only what I am looking at now').check();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  expect(download.suggestedFilename()).toMatch(/^rowsignal-results-\d{8}-\d{4}\.xlsx$/);
  const path = await download.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(path!) as unknown as ArrayBuffer);
  expect(wb.getWorksheet('Only in File B')!.rowCount - 1).toBe(2);
  expect(wb.getWorksheet('Paired results')!.rowCount - 1).toBe(0);
  const keys = [2, 3].map((r) => wb.getWorksheet('Only in File B')!.getRow(r).getCell(2).value);
  expect(keys.sort()).toEqual(['1009', '1010']);
});

test('the filtered-out and empty states are distinct', async ({ page }) => {
  await page.goto('/app/?sample=1');
  await page.getByTestId('results').waitFor();
  await page.getByRole('searchbox', { name: 'Search results' }).fill('zzzz-nothing');
  await expect(page.getByTestId('empty-filter')).toBeVisible();
  await expect(page.getByTestId('empty-filter')).toContainText('No rows match these filters');
  await expect(page.getByTestId('empty-none')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByTestId('shown-count')).toContainText('Showing 12 of 12');
});

test('results that are out of date are labelled and paused until re-run', async ({ page }) => {
  await page.goto('/app/?sample=1');
  await page.getByTestId('results').waitFor();
  await page.getByRole('button', { name: /^Match rules/ }).click();
  await page.getByTestId('field-row-1').getByLabel(/Allowed difference/).count();
  await page.getByTestId('field-row-1').getByText('Rules for this value').click();
  await page.getByTestId('field-row-1').getByLabel('Allowed difference').fill('1');
  await page.getByRole('button', { name: /^Results/ }).click();
  await expect(page.getByTestId('stale-banner')).toContainText('out of date');
  await expect(page.getByTestId('export-open')).toBeDisabled();
  await page.getByRole('button', { name: 'Run comparison again' }).click();
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);
  // With a tolerance of 1 on Quantity, 1004 (5 vs 4) now agrees.
  await expect(page.getByTestId('chip-matched').locator('strong')).toHaveText('5');
  await expect(page.getByTestId('chip-different').locator('strong')).toHaveText('1');
});

test('without the explicit trim/case rules, order 1003 is reported as different and the reason names the option', async ({ page }) => {
  await page.goto('/app/?sample=1');
  await page.getByTestId('results').waitFor();
  await page.getByRole('button', { name: /^Match rules/ }).click();
  const sku = page.locator('[data-testid^="field-row-"]').filter({ has: page.locator('input[value="SKU"]') });
  await sku.getByText('Rules for this value').click();
  await sku.getByLabel('Ignore spaces around values').uncheck();
  await sku.getByLabel('Ignore upper/lower case').uncheck();
  await page.getByTestId('compare-btn').click();
  await page.getByTestId('results').waitFor();
  await expect(page.getByTestId('chip-matched').locator('strong')).toHaveText('3');
  await expect(page.getByTestId('chip-different').locator('strong')).toHaveText('3');
  await page.getByRole('button', { name: /Open details for 1003/ }).click();
  await expect(page.getByTestId('detail')).toContainText('Ignore upper/lower case');
});
