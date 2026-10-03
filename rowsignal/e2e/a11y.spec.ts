import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addSampleFiles, configureSampleRules } from './helpers/app';

async function audit(page: Page, label: string) {
  // Contrast is measured on the settled page, not part-way through a dialog's fade-in.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), undefined, { timeout: 3000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

test.describe('automated accessibility checks (axe, WCAG 2.2 AA tags)', () => {
  for (const path of ['/', '/compare-excel-files', '/compare-csv-files', '/find-missing-rows', '/compare-inventory', '/guides/how-spreadsheet-matching-works', '/guides/duplicate-keys-and-missing-records', '/guides/dates-numbers-and-leading-zeros', '/privacy', '/terms', '/methodology', '/about', '/contact', '/nonexistent']) {
    test(`public page ${path}`, async ({ page }) => {
      await page.goto(path);
      await audit(page, path);
    });
  }

  test('workspace: every step and dialog', async ({ page }) => {
    await page.goto('/app/');
    await audit(page, 'files (empty)');
    await addSampleFiles(page);
    await audit(page, 'files (loaded)');
    await configureSampleRules(page);
    await audit(page, 'rules');
    await page.getByTestId('compare-btn').click();
    await page.getByTestId('results').waitFor();
    await audit(page, 'results');
    await page.getByRole('button', { name: /Open details for 1004/ }).click();
    await page.getByTestId('detail').waitFor();
    await audit(page, 'detail dialog');
    await page.keyboard.press('Escape');
    await page.getByTestId('export-open').click();
    await audit(page, 'export dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Pages' }).click();
    await audit(page, 'results (pages mode)');
    await page.getByRole('button', { name: 'Cards' }).click();
    await audit(page, 'results (cards mode)');
    await page.getByRole('button', { name: 'Recipes' }).click();
    await audit(page, 'recipes dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Saved' }).click();
    await audit(page, 'saved dialog');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Help' }).click();
    await audit(page, 'help dialog');
  });

  test('possible matches panel', async ({ page }) => {
    await page.goto('/app/?sample=1');
    await page.getByTestId('results').waitFor();
    await page.getByTestId('possible-matches').locator('summary').click();
    await page.getByTestId('find-possible').click();
    await page.getByTestId('suggestions').waitFor();
    await audit(page, 'possible matches');
  });
});
