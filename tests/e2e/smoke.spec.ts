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
