import { expect, test } from '@playwright/test';
import { addSampleFiles, configureSampleRules, expectCounts } from './helpers/app';

test('duplicate key → understand the reason → return to mapping → add an identifier column', async ({ page }) => {
  await page.goto('/app/?sample=1');
  await page.getByTestId('results').waitFor();

  // Understand: the ambiguous group lists every row involved and explains what to do.
  await page.getByTestId('chip-ambiguous').click();
  await page.getByRole('button', { name: /Open details for 1008/ }).click();
  const detail = page.getByTestId('detail');
  await expect(detail).toContainText('appears on 2 rows in File A and 1 row in File B');
  await expect(detail).toContainText('Add another identifier column');
  await expect(detail.getByText('row 9')).toBeVisible();
  await expect(detail.getByText('row 10')).toBeVisible();
  await page.keyboard.press('Escape');

  // Return to the rules and add SKU ↔ Product Code as a second identifier.
  await page.getByRole('button', { name: /^Match rules/ }).click();
  await expect(page.getByTestId('diagnostics')).toContainText('Some identifiers repeat');
  await page.getByTestId('diagnostics').getByRole('button', { name: 'Add another identifier column' }).click();
  const second = page.getByTestId('key-row-1');
  await second.getByLabel(/File A/).selectOption({ label: 'B · SKU' });
  await second.getByLabel(/File B/).selectOption({ label: 'B · Product Code' });
  // File B has " MUG " with spaces around it: the app says so, and spaces only matter until the user opts out.
  await expect(second).toContainText('have spaces around them');
  await second.getByLabel('Ignore spaces around values').check();
  await second.getByLabel('Ignore upper/lower case').check();
  await page.getByTestId('compare-btn').click();
  await page.getByTestId('results').waitFor();
  // Order 1008 now pairs TAG-A with TAG-A; TAG-B (only in A) is a plain missing row. Nothing is ambiguous.
  await expect(page.getByTestId('chip-ambiguous').locator('strong')).toHaveText('0');
  await expect(page.getByTestId('chip-only-a').locator('strong')).toHaveText('2');
  await expect(page.getByTestId('chip-matched').locator('strong')).toHaveText('5');
});

test('save project locally → reload → reopen → delete → verify it is gone', async ({ page }) => {
  await page.goto('/app/');
  // Nothing is stored until the user asks: no database exists after a full comparison.
  await addSampleFiles(page);
  await configureSampleRules(page);
  await page.getByTestId('compare-btn').click();
  await page.getByTestId('results').waitFor();
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('rowsignal');

  // Annotate a row, then save explicitly.
  await page.getByRole('button', { name: /Open details for 1004/ }).click();
  await page.getByLabel('Needs follow-up').check();
  await page.getByLabel('Note (optional)').fill('ask warehouse about 1004');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save project on this device' }).click();
  const dlg = page.getByRole('dialog', { name: 'Save project on this device' });
  await expect(dlg).toContainText('not encrypted');
  await expect(dlg).toContainText('not a backup');
  await dlg.getByLabel('Project name').fill('April orders');
  await dlg.getByTestId('save-project-go').click();
  await expect(page.getByRole('status').filter({ hasText: 'saved on this device' })).toBeVisible();

  // A fresh page load: the project is listed on the return screen, opens, and restores notes.
  await page.reload();
  await expect(page.getByTestId('return-panel')).toContainText('April orders');
  await page.getByTestId('return-panel').getByRole('button', { name: 'Open' }).click();
  await page.getByTestId('results').waitFor();
  await expectCounts(page, { matched: 4, different: 2, onlyA: 1, onlyB: 2, ambiguous: 1, invalid: 2 });
  await page.getByRole('button', { name: /Open details for 1004/ }).click();
  await expect(page.getByLabel('Note (optional)')).toHaveValue('ask warehouse about 1004');
  await page.keyboard.press('Escape');

  // Delete it, then prove the stored records are really gone.
  await page.getByRole('button', { name: 'Saved' }).click();
  const saved = page.getByRole('dialog', { name: 'Saved on this device' });
  await expect(saved.getByTestId('project-item')).toContainText('April orders');
  await saved.getByRole('button', { name: 'Delete', exact: true }).click();
  await saved.getByRole('button', { name: 'Delete project' }).click();
  await expect(saved.getByTestId('project-item')).toHaveCount(0);
  const counts = await page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const req = indexedDB.open('rowsignal');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const out: Record<string, number> = {};
          const tx = db.transaction(['projects', 'projectData'], 'readonly');
          let pending = 2;
          for (const name of ['projects', 'projectData']) {
            const c = tx.objectStore(name).count();
            c.onsuccess = () => {
              out[name] = c.result;
              if (--pending === 0) {
                db.close();
                resolve(out);
              }
            };
          }
        };
      }),
  );
  expect(counts).toEqual({ projects: 0, projectData: 0 });
});

test('saved recipes and projects can be cleared separately', async ({ page }) => {
  await page.goto('/app/');
  await addSampleFiles(page);
  await configureSampleRules(page);
  await page.getByRole('button', { name: 'Save as recipe' }).click();
  await page.getByRole('dialog', { name: 'Recipes' }).getByRole('button', { name: 'Save recipe' }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('compare-btn').click();
  await page.getByTestId('results').waitFor();
  await page.getByRole('button', { name: 'Save project on this device' }).click();
  await page.getByTestId('save-project-go').click();
  await page.getByRole('button', { name: 'Saved' }).click();
  const saved = page.getByRole('dialog', { name: 'Saved on this device' });
  await saved.getByRole('button', { name: 'Clear all saved projects' }).click();
  await saved.getByRole('button', { name: /Delete all 1 projects/ }).click();
  await expect(saved.getByTestId('project-item')).toHaveCount(0);
  await expect(saved).toContainText('Recipes (1)');
});
