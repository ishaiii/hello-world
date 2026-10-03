import { expect, test, type Page } from '@playwright/test';
import { chooseFileWithEnter, trackFileInputClicks } from './helpers/app';
import { sample } from './helpers/files';
import { ROUTES } from '../src/public-site/routes';

/** Press Tab until the focused element matches; fails if it is never reached. */
async function tabTo(page: Page, match: (el: Element) => boolean, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const ok = await page.evaluate((src) => (new Function('el', `return (${src})(el)`) as (el: Element | null) => boolean)(document.activeElement), match.toString());
    if (ok) return;
  }
  throw new Error('Never reached the expected control with Tab');
}

test('complete keyboard-only flow: upload → rules → compare → details → close, focus returns', async ({ page }) => {
  await trackFileInputClicks(page);
  await page.goto('/app/');
  // File A: reach the visible "Choose file" button with Tab, open the chooser with Enter.
  await tabTo(page, (el) => /Choose file for File A/.test(el.textContent ?? ''));
  await chooseFileWithEnter(page, 'A', sample('orders.csv'));
  await expect(page.getByTestId('file-name-A')).toHaveText('orders.csv');
  await tabTo(page, (el) => /Choose file for File B/.test(el.textContent ?? ''));
  await chooseFileWithEnter(page, 'B', sample('dispatch.csv'));
  await expect(page.getByTestId('file-name-B')).toHaveText('dispatch.csv');

  await tabTo(page, (el) => /Next: Match rules/.test(el.textContent ?? ''));
  await page.keyboard.press('Enter');
  await tabTo(page, (el) => /Use suggested pairs/.test(el.textContent ?? ''));
  await page.keyboard.press('Enter');

  // Choose date formats with the keyboard (typing the first letter of an option selects it).
  for (const [role, key] of [['A', 'D'], ['B', 'M']] as const) {
    const sel = page.getByTestId(`format-${role}`).getByLabel('How dates are written in this file');
    await sel.focus();
    await page.keyboard.press(key);
    await expect(sel).toHaveValue(key === 'D' ? 'DMY' : 'MDY');
  }
  await tabTo(page, (el) => /Compare files/.test(el.textContent ?? '') && el.tagName === 'BUTTON');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('results')).toBeVisible();
  // The progress dialog closed and focus is somewhere sensible (not lost to <body> inside a hidden dialog).
  await expect(page.getByRole('dialog', { name: 'Comparing files' })).toBeHidden();

  // Open a row's details with the keyboard; Escape closes it and focus returns to the same button.
  await tabTo(page, (el) => /Open details for/.test(el.getAttribute('aria-label') ?? ''));
  const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('detail')).toBeVisible();
  // Focus is inside the dialog while it is open.
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detail')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(label);
});

test('keyboard shortcuts work outside text fields and never inside them', async ({ page }) => {
  await page.goto('/app/?sample=1');
  await page.getByTestId('results').waitFor();
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search results' })).toBeFocused();
  await page.keyboard.type('a/b'); // typing a slash inside the field must not re-trigger the shortcut
  await expect(page.getByRole('searchbox', { name: 'Search results' })).toHaveValue('a/b');
  await page.getByRole('searchbox', { name: 'Search results' }).fill('');
  await page.getByRole('button', { name: /Open details for 1004/ }).click();
  const first = await page.getByTestId('detail').locator('.detail__key').textContent();
  await page.keyboard.press('j');
  await expect(page.getByTestId('detail').locator('.detail__key')).not.toHaveText(first!);
  await page.keyboard.press('k');
  await expect(page.getByTestId('detail').locator('.detail__key')).toHaveText(first!);
  await page.getByLabel('Note (optional)').fill('jjj');
  await expect(page.getByTestId('detail').locator('.detail__key')).toHaveText(first!);
});

test.describe('mobile viewport flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('files → rules → results as cards → details, without sideways page scroll', async ({ page }) => {
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.goto('/app/');
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Use sample files' }).click();
    await expect(page.getByTestId('file-name-B')).toHaveText('dispatch.csv');
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByTestId('next-rules').click();
    await expect(page.getByTestId('compare-btn')).toBeEnabled();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByTestId('compare-btn').click();
    await page.getByTestId('results').waitFor();
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Cards are the default on a phone; the table is still available inside its own scroll area.
    const cards = page.getByTestId('result-cards');
    await expect(cards).toBeVisible();
    await expect(cards.locator('li').first()).toBeVisible();
    await page.getByRole('button', { name: 'Scrolling' }).click();
    await expect(page.getByTestId('result-table')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Cards' }).click();
    await cards.getByRole('button', { name: /Open details for 1004/ }).click();
    await expect(page.getByTestId('detail')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Touch targets of primary controls are comfortable.
    const box = await page.getByRole('button', { name: 'Previous row (K)' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(34);
  });
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`no horizontal page overflow at ${width}px on every public page and workspace step`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    for (const r of ROUTES) {
      await page.goto(r.path);
      expect(await overflow(), `${r.path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.goto('/app/');
    expect(await overflow(), `app files at ${width}px`).toBeLessThanOrEqual(0);
    await page.goto('/app/?sample=1');
    await page.getByTestId('results').waitFor();
    expect(await overflow(), `results at ${width}px`).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /^Match rules/ }).click();
    await page.getByTestId('compare-btn').waitFor();
    expect(await overflow(), `rules at ${width}px`).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /^Files/ }).click();
    expect(await overflow(), `files (loaded) at ${width}px`).toBeLessThanOrEqual(0);
  });
}
