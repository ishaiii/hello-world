import { expect, type Page } from '@playwright/test';
import { sample } from './files';

export async function addSampleFiles(page: Page, ext: 'csv' | 'xlsx' = 'csv') {
  await page.getByTestId('file-input-A').setInputFiles(sample(`orders.${ext}`));
  await expect(page.getByTestId('file-name-A')).toHaveText(`orders.${ext}`);
  await page.getByTestId('file-input-B').setInputFiles(sample(`dispatch.${ext}`));
  await expect(page.getByTestId('file-name-B')).toHaveText(`dispatch.${ext}`);
}

/** Goes through the rules step for the brief's sample files using the suggestions, then the explicit date formats. */
export async function configureSampleRules(page: Page) {
  await page.getByTestId('next-rules').click();
  await page.getByTestId('apply-suggestions').click();
  // The data proves neither date order (all dates have day and month <= 12): the app must ask.
  await expect(page.getByTestId('compare-btn')).toBeDisabled();
  await page.getByTestId('format-A').getByLabel('How dates are written in this file').selectOption('DMY');
  await page.getByTestId('format-B').getByLabel('How dates are written in this file').selectOption('MDY');
  await expect(page.getByTestId('compare-btn')).toBeEnabled();
  await enableSkuNormalisation(page);
}

/** The brief's sample compares SKU with outer trim and case-insensitivity enabled — explicit choices, never defaults. */
export async function enableSkuNormalisation(page: Page) {
  const sku = page.locator('[data-testid^="field-row-"]').filter({ has: page.locator('input[value="SKU"]') });
  await sku.getByText('Rules for this value').click();
  await sku.getByLabel('Ignore spaces around values').check();
  await sku.getByLabel('Ignore upper/lower case').check();
}

export async function expectCounts(page: Page, c: { matched: number; different: number; onlyA: number; onlyB: number; ambiguous: number; invalid: number }) {
  const chip = (id: string) => page.getByTestId(`chip-${id}`).locator('strong');
  await expect(chip('matched')).toHaveText(String(c.matched));
  await expect(chip('different')).toHaveText(String(c.different));
  await expect(chip('only-a')).toHaveText(String(c.onlyA));
  await expect(chip('only-b')).toHaveText(String(c.onlyB));
  await expect(chip('ambiguous')).toHaveText(String(c.ambiguous));
  await expect(chip('invalid')).toHaveText(String(c.invalid));
}

export const SAMPLE_COUNTS = { matched: 4, different: 2, onlyA: 1, onlyB: 2, ambiguous: 1, invalid: 2 };

/** Counts clicks that reach any file input, so keyboard activation can be verified even if the browser's chooser event is lost. */
export async function trackFileInputClicks(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __fileClicks: number }).__fileClicks = 0;
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLInputElement | null;
        if (t && t.tagName === 'INPUT' && t.type === 'file') (window as unknown as { __fileClicks: number }).__fileClicks++;
      },
      true,
    );
  });
}

/**
 * Press Enter on the focused "Choose file" button and hand back a way to supply the file.
 * Normally that is the browser's file chooser. Headless Chromium occasionally loses the chooser
 * event even though the page did activate the file input; in that case the keypress is verified by
 * the click the page made on the input, and the files are set on the input directly.
 */
export async function chooseFileWithEnter(page: Page, role: 'A' | 'B', path: string) {
  const before = await page.evaluate(() => (window as unknown as { __fileClicks: number }).__fileClicks);
  for (let attempt = 0; attempt < 2; attempt++) {
    const chooser = page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null);
    await page.keyboard.press('Enter');
    const c = await chooser;
    if (c) return c.setFiles(path);
  }
  const after = await page.evaluate(() => (window as unknown as { __fileClicks: number }).__fileClicks);
  expect(after, 'Enter on the button should have activated the file input').toBeGreaterThan(before);
  await page.getByTestId(`file-input-${role}`).setInputFiles(path);
}
