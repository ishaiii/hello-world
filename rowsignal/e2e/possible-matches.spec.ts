import { expect, test } from '@playwright/test';
import { tempFile } from './helpers/files';

test('approximate suggestions: find → link (labelled Manually linked) → accounting balances → undo', async ({ page }) => {
  await page.goto('/app/');
  await page.getByTestId('file-input-A').setInputFiles(tempFile('a.csv', ['id,name,qty', 'A-100,Acme Ltd,5', 'B-200,Globex,7', 'C-300,Initech,1', ''].join('\n')));
  await page.getByTestId('file-input-B').setInputFiles(tempFile('b.csv', ['id,name,qty', 'A100,ACME Ltd.,5', 'B-200,Globex,7', 'Z-999,Zorg,2', ''].join('\n')));
  await page.getByTestId('next-rules').click();
  await page.getByTestId('apply-suggestions').click();
  await page.getByTestId('compare-btn').click();
  await page.getByTestId('results').waitFor();
  const chip = (id: string) => page.getByTestId(`chip-${id}`).locator('strong');
  await expect(chip('matched')).toHaveText('1');
  await expect(chip('only-a')).toHaveText('2');
  await expect(chip('only-b')).toHaveText('2');

  // Off by default: nothing is suggested until asked, and exact results are untouched.
  const panel = page.getByTestId('possible-matches');
  await panel.locator('summary').click();
  await expect(page.getByTestId('suggestions')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Find possible matches' }).click();
  const items = page.getByTestId('suggestion');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('A-100');
  await expect(items.first()).toContainText('A100');
  await expect(items.first()).toContainText('Similarity 100%');
  // C-300 / Z-999 are nothing alike, so they are not offered.
  await expect(items.first()).not.toContainText('Zorg');

  await items.first().getByRole('button', { name: 'Link these rows' }).click();
  await expect(chip('only-a')).toHaveText('1');
  await expect(chip('only-b')).toHaveText('1');
  await expect(page.getByTestId('result-table')).toContainText('Manually linked');
  await expect(page.getByTestId('manual-links')).toContainText('A-100 ⇄ A100');
  // A linked row cannot be offered or linked again.
  await expect(page.getByTestId('suggestion')).toHaveCount(0);
  // Both original identifiers are kept in the details, and the accounting still balances.
  await page.getByRole('button', { name: /Open details for A-100 ⇄ A100/ }).click();
  await expect(page.getByTestId('detail')).toContainText('not an exact match');
  await page.keyboard.press('Escape');
  await page.getByText('How the rows add up').click();
  const acct = page.getByRole('region', { name: 'Row accounting table' });
  await expect(acct.getByRole('row').nth(1)).toContainText('3'); // File A: 3 rows in total
  await expect(acct.getByRole('row').nth(2)).toContainText('3');

  // Undo restores the exact result.
  await page.getByTestId('manual-links').getByRole('button', { name: 'Undo' }).click();
  await expect(chip('only-a')).toHaveText('2');
  await expect(chip('only-b')).toHaveText('2');
  await expect(page.getByTestId('result-table')).not.toContainText('Manually linked');
});
