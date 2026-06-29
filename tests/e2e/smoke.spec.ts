import { readFileSync } from 'node:fs';
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

test('linked panels sync the active ticker', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL FOCUS');
  await runCommand(page, 'AAPL FOCUS');
  const frames = page.getByTestId('panel-frame');
  await expect(frames).toHaveCount(2);

  // Link both panels to the same (first) color group.
  const linkButtons = page.getByRole('button', { name: 'Cycle link group' });
  await linkButtons.nth(0).click();
  await linkButtons.nth(1).click();

  // Retarget the first panel; the linked second panel should follow.
  const symbolInputs = page.getByLabel('Focus symbol');
  await symbolInputs.nth(0).fill('MSFT');
  await symbolInputs.nth(0).press('Enter');
  await expect(frames.nth(1)).toContainText('MSFT');
});

test('Tab cycles panel focus', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL FOCUS');
  await runCommand(page, 'MSFT FOCUS');
  const frames = page.getByTestId('panel-frame');
  await expect(frames).toHaveCount(2);
  // The newest panel is active (sky border).
  await expect(frames.nth(1)).toHaveClass(/border-sky-500/);
  await page.keyboard.press('Escape'); // blur the command bar
  await page.keyboard.press('Tab');
  await expect(frames.nth(0)).toHaveClass(/border-sky-500/);
});

test('TOP opens a global news feed with working filters', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'TOP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // The filter bar is present and the global feed lists multiple symbols.
  await expect(page.getByLabel('Source')).toBeVisible();
  await expect(page.getByLabel('Keyword')).toBeVisible();

  // Applying a source filter re-queries and the panel survives (no crash).
  await page.getByLabel('Keyword').fill('guidance');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
});

test('an alert rule fires on the quote stream and surfaces in the status bar', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL ALERT');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Add a rule that is immediately satisfied (price > 1) against the mock stream.
  await page.getByLabel('Alert threshold').fill('1');
  await page.getByRole('button', { name: 'add', exact: true }).click();
  await expect(page.getByText('Price > 1', { exact: true }).first()).toBeVisible();

  // The dedicated alert stream evaluates it and a fire reaches the status bar.
  await expect(page.getByText(/AAPL alert —/).first()).toBeVisible();
});

test('OMON renders an option chain grid; a non-optionable symbol shows empty state', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL OMON');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Calls | Strike | Puts grid with Greek columns.
  await expect(page.getByRole('columnheader', { name: 'Calls' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Strike' })).toBeVisible();
  // Switch to the second expiry; the grid still renders.
  const expiries = page.getByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ });
  await expiries.nth(1).click();
  await expect(page.getByRole('columnheader', { name: 'Puts' })).toBeVisible();

  // A non-optionable symbol degrades to the empty state, not a crash.
  await runCommand(page, 'BTC-USD OMON');
  await expect(page.getByTestId('panel-frame')).toHaveCount(2);
  await expect(page.getByText(/No option chain for BTC-USD/).first()).toBeVisible();
});

test('TAS streams a time & sales tape', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL TAS');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Tape columns render and seeded/streamed prints show a venue.
  await expect(page.getByText('Venue', { exact: true })).toBeVisible();
  await expect(page.getByText(/^(XNAS|ARCX|BATS|EDGX)$/).first()).toBeVisible();
});

test('EM, ANR, and HDS render their fundamentals panels', async ({ page }) => {
  await page.goto('/');

  await runCommand(page, 'AAPL EM');
  await expect(page.getByText('Implied P/E', { exact: true })).toBeVisible();
  await expect(page.getByText('EPS (mean)', { exact: true })).toBeVisible();

  await runCommand(page, 'AAPL ANR');
  await expect(page.getByText('Firm', { exact: true })).toBeVisible();
  await expect(page.getByText('Target', { exact: true })).toBeVisible();

  await runCommand(page, 'AAPL HDS');
  await expect(page.getByText('Holder', { exact: true })).toBeVisible();
  await expect(page.getByText('% Out', { exact: true })).toBeVisible();
});

test('COMP overlays a normalized multi-security comparison', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL COMP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Primary symbol legend + a rendered canvas.
  await expect(page.getByText('AAPL', { exact: true }).first()).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  // Add a second symbol; a second legend chip appears.
  await page.getByPlaceholder('add symbol').fill('MSFT');
  await page.getByPlaceholder('add symbol').press('Enter');
  await expect(page.getByText('MSFT', { exact: true }).first()).toBeVisible();

  // Switch range; the panel survives the refetch.
  await page.getByRole('button', { name: '1y', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
});

test('WEI shows a regioned world-indices board with a YTD column', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'WEI');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Region headers and the YTD column header render.
  await expect(page.getByText('Americas', { exact: true })).toBeVisible();
  await expect(page.getByText('EMEA', { exact: true })).toBeVisible();
  await expect(page.getByText('APAC', { exact: true })).toBeVisible();
  await expect(page.getByText('YTD', { exact: true })).toBeVisible();
  // At least one index label renders.
  await expect(page.getByText('S&P 500', { exact: true })).toBeVisible();
});

test('AI copilot grounds its answer in the open panels with a citation', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL DES');
  await runCommand(page, 'AI');
  await expect(page.getByTestId('panel-frame')).toHaveCount(2);

  const input = page.getByPlaceholder('Ask the copilot…');
  await input.fill('summarize what is on screen');
  await input.press('Enter');

  // The grounded answer references the on-screen panels and shows a provenance citation chip.
  await expect(page.getByText(/On screen \(/)).toBeVisible();
  await expect(page.getByText(/mock · quotes/).first()).toBeVisible();
});

test('PORT values a read-only portfolio with no order-placement affordance', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'PORT');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Add a holding via the inline form.
  await page.getByLabel('Position symbol').fill('AAPL');
  await page.getByLabel('Position quantity').fill('10');
  await page.getByLabel('Position average cost').fill('100');
  await page.getByRole('button', { name: 'add', exact: true }).click();

  // The position renders as a clickable row and the panel states its read-only guarantee.
  await expect(page.getByRole('button', { name: 'AAPL', exact: true }).first()).toBeVisible();
  await expect(page.getByText(/places no orders/i).first()).toBeVisible();

  // There is no buy/sell/trade control anywhere in the panel — Tyche places no orders.
  await expect(page.getByRole('button', { name: /^(buy|sell|trade)$/i })).toHaveCount(0);

  // CSV import is available and the panel survives importing extra rows.
  await page.getByRole('button', { name: 'import CSV' }).click();
  await page.getByLabel('Holdings CSV').fill('MSFT,5,400\nNVDA,2,800');
  await page.getByRole('button', { name: 'add rows', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MSFT', exact: true }).first()).toBeVisible();
});

test('NOTE saves a markdown research note that renders, tags it, and exports JSON', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL NOTE');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Compose a markdown note with a tag.
  await page.getByPlaceholder('Note about AAPL…').fill('Earnings thesis');
  await page.getByPlaceholder(/markdown supported/).fill('**Strong** conviction on AAPL');
  await page.getByPlaceholder('Tags, comma-separated…').fill('earnings, long');
  await page.getByRole('button', { name: 'Save note' }).click();

  // The saved note renders markdown (a <strong> span) and its tag chip.
  await expect(page.locator('strong', { hasText: 'Strong' }).first()).toBeVisible();
  await expect(page.getByText('#earnings').first()).toBeVisible();

  // Export downloads a JSON snapshot of the journal.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export notes' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('tyche-notes.json');
});

test('EQS screens the universe and a restrictive filter narrows it to none', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'EQS');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // The default screen returns the universe (market-cap sorted); a match count shows.
  await expect(page.getByText(/\d+ matches/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'AAPL', exact: true }).first()).toBeVisible();

  // Add an impossible filter (% change > 100000) and run → no matches.
  await page.getByRole('button', { name: '+ filter' }).click();
  await page.getByLabel('Filter field').selectOption('changePercent');
  await page.getByLabel('Filter operator').selectOption('gt');
  await page.getByLabel('Filter value').fill('100000');
  await page.getByRole('button', { name: 'Run screen' }).click();
  await expect(page.getByText(/No matches/i)).toBeVisible();
});

test('MOST shows a movers board with switchable gainers/losers/active views', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'MOST');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // The gainers view loads with rows (top of the universe by % change).
  await expect(page.getByRole('button', { name: 'Gainers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AAPL', exact: true }).first()).toBeVisible();

  // Switching to Most active re-queries and the panel survives.
  await page.getByRole('button', { name: 'Most active' }).click();
  await expect(page.getByText('Volume', { exact: true })).toBeVisible();
});

test('EQS saves a screen preset that persists in the Saved row', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'EQS');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Build a filter, then save the screen (window.prompt → accept a name).
  await page.getByRole('button', { name: '+ filter' }).click();
  await page.getByLabel('Filter field').selectOption('marketCap');
  await page.getByLabel('Filter value').fill('1');
  page.once('dialog', (d) => void d.accept('E2E screen'));
  await page.getByRole('button', { name: 'Save screen' }).click();

  // The saved preset appears as a clickable chip (persisted via /api/screens).
  await expect(page.getByText('Saved:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'E2E screen', exact: true }).first()).toBeVisible();
});

test('SETTINGS shows a provider capability dashboard; mock-only shows no entitlement banner', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'SETTINGS');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // The dashboard lists the union summary and a per-capability grid.
  await expect(page.getByText('All providers (union)')).toBeVisible();
  await expect(page.getByText('total terminal coverage')).toBeVisible();
  await expect(page.getByText('quotes').first()).toBeVisible();

  // Mock-only session: no entitlement/licensing banner.
  await expect(page.getByText(/does not license this data/i)).toHaveCount(0);

  // The plugin manager renders; with no TYCHE_PLUGINS configured it shows the empty state.
  await expect(page.getByText('Plugins', { exact: true })).toBeVisible();
  await expect(page.getByText(/No plugins installed/i)).toBeVisible();
});

test('history CSV export begins with a provenance header', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL HP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const contents = readFileSync(path, 'utf8');
  expect(contents.startsWith('# provider=mock')).toBe(true);
  expect(contents).toContain('# capability=historicalPrices');
  expect(contents).toContain('date,open,high,low,close,volume');
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
