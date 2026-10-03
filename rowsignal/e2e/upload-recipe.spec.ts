import { expect, test } from '@playwright/test';
import { SAMPLE_COUNTS, addSampleFiles, configureSampleRules, expectCounts } from './helpers/app';
import { tempFile } from './helpers/files';

test('upload two real files → map columns → compare → save recipe → rerun with reordered new files', async ({ page }) => {
  await page.goto('/app/');
  await addSampleFiles(page);
  await expect(page.getByTestId('file-stats-A')).toContainText('10 data rows');
  await configureSampleRules(page);
  await page.getByTestId('compare-btn').click();
  await expect(page.getByTestId('results')).toBeVisible();
  await expectCounts(page, SAMPLE_COUNTS);

  // Save the rules as a recipe.
  await page.getByRole('button', { name: 'Save these rules as a recipe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recipes' });
  await dialog.getByLabel('Recipe name').fill('Weekly orders check');
  await dialog.getByRole('button', { name: 'Save recipe' }).click();
  await expect(dialog.getByTestId('recipe-item')).toContainText('Weekly orders check');
  await page.keyboard.press('Escape');

  // Start fresh (reload), then reuse the recipe with new files: columns in a different order, rows shuffled.
  await page.reload();
  await page.getByRole('button', { name: 'Use with new files' }).first().click();
  await expect(page.getByTestId('pending-recipe')).toContainText('Weekly orders check');
  const ordersNew = tempFile(
    'orders-week2.csv',
    ['Date,Amount,Quantity,SKU,Order ID', '03/04/2026,100.00,10,PEN,1001', '03/04/2026,55.00,3,CAP,2002', '03/04/2026,"1,200.00",12,BOOK,1002', ''].join('\n'),
  );
  const dispatchNew = tempFile(
    'dispatch-week2.csv',
    ['Qty,Total,Dispatch Date,Order Number,Product Code', '12,1200.00,04/03/2026,1002,BOOK', '10,100.00,04/03/2026,1001,pen', '7,9.00,04/03/2026,2003,CUP', ''].join('\n'),
  );
  await page.getByTestId('file-input-A').setInputFiles(ordersNew);
  await page.getByTestId('file-input-B').setInputFiles(dispatchNew);

  // The recipe found every column by its header name, regardless of position.
  const schema = page.getByTestId('schema-panel');
  await expect(schema).toContainText('All the columns your rules use were found by name');
  await expect(page.getByTestId('key-row-0')).toBeVisible();
  await page.getByTestId('compare-btn').click();
  await expect(page.getByTestId('results')).toBeVisible();
  // 1001 matches (pen vs PEN ignoring case), 1002 matches, 2002 only in A, 2003 only in B.
  await expectCounts(page, { matched: 2, different: 0, onlyA: 1, onlyB: 1, ambiguous: 0, invalid: 0 });
});

test('a changed header is never silently remapped by position', async ({ page }) => {
  await page.goto('/app/');
  await addSampleFiles(page);
  await configureSampleRules(page);
  await page.getByRole('button', { name: 'Save as recipe' }).click();
  await page.getByRole('dialog', { name: 'Recipes' }).getByRole('button', { name: 'Save recipe' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to files' }).click();

  // Replace File A with a file where "Quantity" was renamed "Units" and "Order ID" changed case.
  const changed = tempFile('orders-renamed.csv', ['order id,SKU,Units,Amount,Date', '1001,PEN,10,100.00,03/04/2026', ''].join('\n'));
  await page.getByTestId('file-input-A').setInputFiles(changed);
  const schema = page.getByTestId('schema-panel');
  await expect(schema).toContainText('could not be matched by name');
  await expect(schema).toContainText('RowSignal never guesses by position');
  await expect(page.getByTestId('compare-btn')).toBeDisabled();
  await expect(page.locator('#compare-blockers')).toContainText('Choose a column from each file');
  // The near-miss ("order id" for "Order ID") is offered, but only applied when the user confirms.
  await schema.getByRole('button', { name: /Use “order id”/ }).click();
  await schema.getByLabel('Choose another column').first().selectOption({ label: 'C · Units' });
  await expect(page.getByTestId('compare-btn')).toBeEnabled();
});

test('an invalid recipe file is rejected with a plain explanation', async ({ page }) => {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Recipes' }).click();
  const bad = tempFile('bad.json', JSON.stringify({ kind: 'rowsignal-recipe', version: 1, onLoad: 'alert(1)' }));
  await page.getByLabel('Choose a recipe file to import').setInputFiles(bad);
  await expect(page.getByRole('status').filter({ hasText: /unsupported or malformed|not a RowSignal/ }).or(page.getByRole('alert').filter({ hasText: /unsupported or malformed|not a RowSignal/ }))).toBeVisible();
});

test('unsupported files are refused with a useful explanation', async ({ page }) => {
  await page.goto('/app/');
  await page.getByTestId('file-input-A').setInputFiles(tempFile('legacy.xls', 'x'));
  await expect(page.getByTestId('file-card-A')).toContainText('older Excel 97–2003 format');
  await page.getByTestId('file-input-B').setInputFiles(tempFile('report.pdf', '%PDF-1.4'));
  await expect(page.getByTestId('file-card-B')).toContainText('cannot read PDFs');
  await page.getByTestId('file-input-A').setInputFiles(tempFile('macro.xlsm', 'x'));
  await expect(page.getByTestId('file-card-A')).toContainText('never run');
});
