import { test, expect, type Page } from '@playwright/test';

async function runCommand(page: Page, command: string): Promise<void> {
  const input = page.getByLabel('Command input');
  await input.click();
  await input.fill(command);
  await input.press('Enter');
}

test('opens panels, saves the workspace, and restores them after reload', async ({ page }) => {
  await page.goto('/');

  const input = page.getByLabel('Command input');
  await expect(input).toBeVisible();

  // 1) AAPL DES
  await runCommand(page, 'AAPL DES');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // 2) AAPL GP
  await runCommand(page, 'AAPL GP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(2);

  // 3) QM
  await runCommand(page, 'QM');
  await expect(page.getByTestId('panel-frame')).toHaveCount(3);

  // active instrument should be AAPL
  await expect(page.getByText('Active:')).toContainText('AAPL');

  // 4) Save the workspace
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // 5) Reload, 6) verify panels return
  await page.reload();
  await expect(input).toBeVisible();
  await expect(page.getByTestId('panel-frame')).toHaveCount(3);
});

test('HELP opens the command reference', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'HELP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByPlaceholder('Search commands…')).toBeVisible();
});

test('quote monitor shows an age column and sorts on header click', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL MSFT NVDA QM');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // The age column is part of the default v2 column set.
  await expect(page.getByRole('button', { name: 'Age' })).toBeVisible();
  // Clicking a sortable header shows the active-sort indicator.
  await page.getByRole('button', { name: 'Last', exact: true }).click();
  await expect(page.getByText('▼').first()).toBeVisible();
});

test('watchlist supports a new named tab and batch import', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'W');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Create a new list; it opens an autofocused rename input.
  await page.getByRole('button', { name: 'New watchlist' }).click();
  const rename = page.getByLabel('Rename watchlist');
  await expect(rename).toBeVisible();
  await rename.fill('E2E List');
  await rename.press('Enter');

  // Batch import: two valid symbols + one clearly-unknown long token.
  await page.getByRole('button', { name: 'import', exact: true }).click();
  await page.getByLabel('Symbols to import').fill('AAPL\nMSFT\nTHISISNOTATICKER');
  await page.getByRole('button', { name: /validate & add/ }).click();
  await expect(page.getByText(/2 added/)).toBeVisible();
  await expect(page.getByText(/1 unknown/)).toBeVisible();
});

test('financials toggles period and exports CSV with a provenance-stamped filename', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL FA');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Period toggle switches the fetched series.
  await page.getByRole('button', { name: 'Quarterly' }).click();
  await expect(page.getByRole('button', { name: 'Annual' })).toBeVisible();

  // CSV export triggers a download with the type+period in the filename.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^AAPL-income-quarterly\.csv$/);
});

test('clicking a filing row opens the filing viewer (mock: no document url)', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL CF');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Click the first filing row (mock AAPL filings include a 10-K).
  await page.getByText('10-K', { exact: false }).first().click();
  await expect(page.getByTestId('panel-frame')).toHaveCount(2);
  await expect(page.getByText(/No document URL is available/i)).toBeVisible();
});
