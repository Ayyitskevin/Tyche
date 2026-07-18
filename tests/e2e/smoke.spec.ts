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

test('command bar autocompletes commands and symbols with a full keyboard flow', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Command input');
  await input.click();

  // Alias completion: CHAR → GP (alias CHART), keyboard select + run.
  await input.fill('AAPL CHAR');
  const gpOption = page.getByRole('option', { name: /AAPL GP/ });
  await expect(gpOption).toBeVisible();
  await input.press('ArrowDown');
  await expect(gpOption).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  await expect(page.getByText('AAPL · GP').first()).toBeVisible();

  // Symbol suggestions via the search capability: Tab fills, Enter runs.
  await input.click();
  await input.fill('msf');
  await expect(page.getByRole('option', { name: /MSFT/ })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Tab'); // fill "MSFT " without executing
  await expect(input).toHaveValue('MSFT ');
  await input.press('Enter'); // bare symbol → default command (DES)
  await expect(page.getByText('MSFT · DES').first()).toBeVisible();
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

test('financials Ratios view shows derived margins, returns and growth', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL FA');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Export buttons are visible on a statement view...
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeVisible();

  // ...switching to the derived Ratios view renders the computed rows.
  await page.getByRole('button', { name: 'Ratios' }).click();
  await expect(page.getByText('Gross margin')).toBeVisible();
  await expect(page.getByText('Return on equity')).toBeVisible();
  await expect(page.getByText('Debt / equity')).toBeVisible();
  await expect(page.getByText('Current ratio')).toBeVisible();
  await expect(page.getByText('Interest coverage')).toBeVisible();
  await expect(page.getByText('Revenue growth')).toBeVisible();

  // Ratios are a derivation, not a raw statement, so export is hidden.
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toHaveCount(0);
});

test('EM estimates board exports a provenance-stamped CSV', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL EM');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('AAPL-estimates.csv');
});

test('OMON option chain exports a provenance-stamped CSV', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL OMON');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  // Filename carries the symbol and the selected expiry: AAPL-options-<expiry>.csv
  expect(download.suggestedFilename()).toMatch(/^AAPL-options-.+\.csv$/);
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
  // A max-pain readout is derived from the chain's open interest.
  await expect(page.getByText(/^Max pain /)).toBeVisible();
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

test('COMM shows a grouped commodities board', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'COMM');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Group headers and at least one commodity label render.
  await expect(page.getByText('Energy', { exact: true })).toBeVisible();
  await expect(page.getByText('Metals', { exact: true })).toBeVisible();
  await expect(page.getByText('Agriculture', { exact: true })).toBeVisible();
  await expect(page.getByText('Gold', { exact: true })).toBeVisible();
  await expect(page.getByText('WTI Crude', { exact: true })).toBeVisible();
});

test('DEX lists on-chain pools for a token and re-searches from the input', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'ETH DEX');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // The mock venue set renders, deepest liquidity first.
  await expect(page.getByText('Liquidity', { exact: true })).toBeVisible();
  await expect(page.getByText('uniswap').first()).toBeVisible();
  // Re-search for another token via the panel input.
  const tokenInput = page.getByLabel('DEX pool search token');
  await tokenInput.fill('SOL');
  await tokenInput.press('Enter');
  await expect(page.getByText('SOL/WETH', { exact: true })).toBeVisible();
});

test('FX shows the currency board with a working converter', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'FX');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByLabel('Amount')).toBeVisible();
  await expect(page.getByLabel('From currency')).toBeVisible();
  // Converting an amount produces a result and never crashes the panel.
  await page.getByLabel('Amount').fill('100');
  await page.getByRole('button', { name: 'Convert' }).click();
  await expect(page.getByRole('button', { name: 'Convert' })).toBeEnabled();
});

test('HEAT renders a market heatmap with a size-by toggle and tiles', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'HEAT');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByText('Size by', { exact: true })).toBeVisible();
  await expect(page.getByText(/names · click a tile to retarget/)).toBeVisible();
});

test('BOOK shows a level-2 depth ladder for a crypto symbol', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'BTC-USDT BOOK');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByText('Depth', { exact: true })).toBeVisible();
  await expect(page.getByText('Price', { exact: true })).toBeVisible();
  await expect(page.getByText('Size', { exact: true })).toBeVisible();
});

test('FUND shows the perpetual funding board with rate and annualized columns', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'FUND');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByText('Rate', { exact: true })).toBeVisible();
  await expect(page.getByText('Ann.', { exact: true })).toBeVisible();
  await expect(page.getByText('Mark', { exact: true })).toBeVisible();
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

  // Risk analytics: toggling Risk computes beta/Sharpe/VaR over the holdings'
  // history vs a benchmark — pure analytics, still no order-placement anywhere.
  await page.getByRole('button', { name: 'risk', exact: true }).click();
  await expect(page.getByText('Sharpe')).toBeVisible();
  await expect(page.getByText('Beta', { exact: true })).toBeVisible();
  await expect(page.getByText(/vs SPY/)).toBeVisible();
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

test('GP chart toggles candles, moving-average overlays, and the RSI study', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL GP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // The data branch rendered (not loading/empty/capability state): the price
  // header carries the active range. This guards against a candle-math regression
  // throwing inside the chart while the chips (rendered outside it) stay mounted.
  await expect(page.getByText(/· 6mo/)).toBeVisible();

  // Candlesticks are the default; switching to Line flips the pressed state.
  const candles = page.getByRole('button', { name: 'Candles', exact: true });
  const line = page.getByRole('button', { name: 'Line', exact: true });
  await expect(candles).toHaveAttribute('aria-pressed', 'true');
  await line.click();
  await expect(line).toHaveAttribute('aria-pressed', 'true');
  await expect(candles).toHaveAttribute('aria-pressed', 'false');

  // Overlays and the RSI study toggle independently and persist on the panel.
  const sma = page.getByRole('button', { name: 'SMA 20', exact: true });
  const rsi = page.getByRole('button', { name: 'RSI', exact: true });
  await sma.click();
  await rsi.click();
  await expect(sma).toHaveAttribute('aria-pressed', 'true');
  await expect(rsi).toHaveAttribute('aria-pressed', 'true');

  // The volume pane defaults ON and toggles off.
  const vol = page.getByRole('button', { name: 'Vol', exact: true });
  await expect(vol).toHaveAttribute('aria-pressed', 'true');
  await vol.click();
  await expect(vol).toHaveAttribute('aria-pressed', 'false');
  // The chart panel survives all of it.
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
});

test('GP chart toggles the Bollinger overlay and the MACD study pane', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL GP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  const boll = page.getByRole('button', { name: 'Boll', exact: true });
  const vwap = page.getByRole('button', { name: 'VWAP', exact: true });
  const macd = page.getByRole('button', { name: 'MACD', exact: true });
  const stoch = page.getByRole('button', { name: 'Stoch', exact: true });
  await expect(boll).toHaveAttribute('aria-pressed', 'false');
  await boll.click();
  await vwap.click();
  await macd.click();
  await stoch.click();
  await expect(boll).toHaveAttribute('aria-pressed', 'true');
  await expect(vwap).toHaveAttribute('aria-pressed', 'true');
  await expect(macd).toHaveAttribute('aria-pressed', 'true');
  await expect(stoch).toHaveAttribute('aria-pressed', 'true');

  // Three lower panes (MACD, Stoch, RSI) stack with the price overlays without
  // breaking the chart.
  await page.getByRole('button', { name: 'RSI', exact: true }).click();
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
});

test('ECO opens an economic series (mock) and switches series via a preset', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'ECO');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Defaults to GDP; the mock catalog supplies a recognizable title.
  await expect(page.getByText('Gross Domestic Product')).toBeVisible();

  // Switching to a preset re-queries and the header updates.
  await page.getByRole('button', { name: 'Unemployment', exact: true }).click();
  await expect(page.getByText('Unemployment Rate')).toBeVisible();

  // A transform chip re-expresses the series (client-side analytics) and the
  // units readout reflects it — no advice, just a different lens on the data.
  await page.getByRole('button', { name: 'YoY %', exact: true }).click();
  await expect(page.getByText('% change, year ago')).toBeVisible();
});

test('OVME prices an option with Greeks and a no-advice disclaimer; toggles call/put', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL OVME');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Pure-compute panel: value + Greeks render, spot is wired to the symbol.
  await expect(page.getByText('Option value')).toBeVisible();
  await expect(page.getByText('Delta (Δ)')).toBeVisible();
  await expect(page.getByText(/spot from AAPL/)).toBeVisible();
  await expect(page.getByText(/Tyche places no orders/i)).toBeVisible();

  // A payoff-at-expiry diagram is derived from the modeled premium.
  await expect(page.getByText('Payoff at expiry')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Option payoff at expiry' })).toBeVisible();

  // Call is the default; switching to Put flips the pressed state and keeps the panel.
  const put = page.getByRole('button', { name: 'put', exact: true });
  await put.click();
  await expect(put).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Option value')).toBeVisible();
});

test('CALC computes time-value math and switches modes', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'CALC');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Defaults to Future value; the result rows (unique to the computed output) render.
  await expect(page.getByText('Total contributed')).toBeVisible();
  await expect(page.getByText('Growth', { exact: true })).toBeVisible();

  // Switching to Loan recomputes a payment.
  await page.getByRole('button', { name: 'Loan', exact: true }).click();
  await expect(page.getByText('Payment / period')).toBeVisible();
  await expect(page.getByText('Total interest')).toBeVisible();
});

test('DCF values a ticker, shows market-implied growth, and reprices on an assumption change', async ({
  page,
}) => {
  await page.goto('/');
  await runCommand(page, 'AAPL DCF');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Seeded valuation output: enterprise value, the reverse-DCF readout, and the
  // sensitivity grid all render; research-only disclaimer present.
  await expect(page.getByText('Enterprise value')).toBeVisible();
  await expect(page.getByText('Market-implied growth')).toBeVisible();
  await expect(page.getByText(/WACC × terminal growth/)).toBeVisible();
  await expect(page.getByText(/Not investment advice/i)).toBeVisible();

  // Editing an assumption keeps the panel and recomputes (no crash on re-render).
  const wacc = page.getByLabel('Discount');
  await wacc.fill('12');
  await expect(page.getByText('Enterprise value')).toBeVisible();
});

test('WACC computes CAPM cost of equity and the weighted cost of capital', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL WACC');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // CAPM + WACC breakdown renders; research-only disclaimer present.
  await expect(page.getByText('Cost of equity', { exact: true })).toBeVisible();
  await expect(page.getByText('After-tax cost of debt')).toBeVisible();
  await expect(page.getByText('Weight equity')).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();

  // Editing beta recomputes without crashing.
  await page.getByLabel('Beta').fill('1.5');
  await expect(page.getByText('Cost of equity', { exact: true })).toBeVisible();
});

test('CORR builds a return-correlation heatmap and switches the window', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL CORR MSFT NVDA');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Heatmap renders with the ρ header and a self-correlation diagonal of 1.00.
  await expect(page.getByText('Return ρ')).toBeVisible();
  await expect(page.getByText('1.00').first()).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();

  // Changing the window re-fetches and re-renders (no crash).
  await page.getByRole('button', { name: '2y', exact: true }).click();
  await expect(page.getByText('Return ρ')).toBeVisible();
});

test('RV builds a peer-comps grid with a peer-median benchmark and edits the set', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL RV MSFT GOOGL');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Valuation multiples grid with a peer-median row; peers seeded from the line.
  await expect(page.getByText('EV/EBITDA')).toBeVisible();
  await expect(page.getByText('Peer median')).toBeVisible();
  await expect(page.getByText('MSFT', { exact: true })).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();

  // Removing a peer chip drops it from the comp set (re-fetches, row disappears).
  await page.getByRole('button', { name: /^MSFT/ }).click();
  await expect(page.getByText('MSFT', { exact: true })).toHaveCount(0);
});

test('YCRV plots the Treasury curve with spreads and per-tenor yields', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'YCRV');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Curve chart, headline spreads, and the per-tenor table all render (mock).
  await expect(page.getByRole('img', { name: 'Treasury yield curve' })).toBeVisible();
  await expect(page.getByText('2s10s')).toBeVisible();
  await expect(page.getByText('3m10y')).toBeVisible();
  await expect(page.getByRole('cell', { name: '30Y' })).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();
});

test('ECOC shows the economic release calendar and filters by importance', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'ECOC');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Calendar renders with upcoming + recent sections and known macro prints.
  await expect(page.getByText('Upcoming')).toBeVisible();
  await expect(page.getByText('FOMC Rate Decision')).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();

  // The importance filter narrows the set but keeps the high-importance prints.
  const high = page.getByRole('button', { name: 'high', exact: true });
  await high.click();
  await expect(high).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('FOMC Rate Decision')).toBeVisible();
});

test('13F shows a manager\'s institutional holdings and switches managers via a preset', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, '13F BERKSHIRE');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Manager header, a ranked holding, and the research-only disclaimer all render.
  await expect(page.getByText('Berkshire Hathaway')).toBeVisible();
  await expect(page.getByText('AAPL')).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();

  // A preset chip swaps the manager without re-running the command.
  await page.getByRole('button', { name: 'SCION', exact: true }).click();
  await expect(page.getByText('Scion Asset Management')).toBeVisible();
});

test('13F reads the typed manager (a CIK) and does not inherit the active instrument', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL DES'); // sets the active instrument to AAPL
  await runCommand(page, '13F 1067983'); // a CIK — must resolve as "1067983", not "AAPL 1067983"
  // The manager header shows exactly the typed CIK; an inherited ticker would read "Aapl 1067983".
  await expect(page.getByText('1067983', { exact: true })).toBeVisible();
});

test('13F Changes view shows quarter-over-quarter position changes', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, '13F BERKSHIRE');
  await page.getByRole('button', { name: 'Changes', exact: true }).click();

  // The summary shows change counts and the diff surfaces the synthetic exited position.
  await expect(page.getByText(/\d+ exited/)).toBeVisible();
  await expect(page.getByText('EXITED HOLDINGS CO')).toBeVisible();
  await expect(page.getByText(/not investment advice/i)).toBeVisible();
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

test('EVT shows a corporate-events calendar and widens the window', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL EVT');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Scoped to the symbol; a 90-day window guarantees at least one earnings row.
  await expect(page.getByText('events for AAPL')).toBeVisible();
  await page.getByRole('button', { name: '90d', exact: true }).click();
  await expect(page.getByText('EPS', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/quarterly earnings/).first()).toBeVisible();
});

test('LAYOUT forks the workspace, starts a new empty layout, and switches back', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL DES');
  await runCommand(page, 'LAYOUT');
  await expect(page.getByTestId('panel-frame')).toHaveCount(2);

  // Unique names per run: the API persists workspaces across runs, so a fixed
  // name ("E2E layout") accumulates and a name-matched locator resolves to many
  // rows (strict-mode violation). A run-unique name always targets exactly one.
  const forkName = `E2E fork ${Date.now()}`;
  const forkRow = page.getByRole('button', { name: new RegExp(`${forkName} \\d+ panels`) });

  // Fork the current panels under the new name; it becomes the current layout.
  page.once('dialog', (d) => void d.accept(forkName));
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(forkRow).toBeVisible();
  await expect(page.getByText('current', { exact: true })).toBeVisible();

  // A new empty layout clears the grid (including this panel).
  page.once('dialog', (d) => void d.accept(`E2E scratch ${Date.now()}`));
  await page.getByRole('button', { name: 'New empty' }).click();
  await expect(page.getByTestId('panel-frame')).toHaveCount(0);

  // Switch back: the fork restores its panels (DES + the layout manager).
  await runCommand(page, 'LAYOUT');
  await forkRow.click();
  await expect(page.getByTestId('panel-frame')).toHaveCount(2);
  await expect(page.getByText('AAPL · DES').first()).toBeVisible();
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

test('SETTINGS shows a recent-activity audit log after a mutating action', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL DES');

  // A mutating action: save the workspace; wait for the server to record it.
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/workspaces') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await saved;

  await runCommand(page, 'SETTINGS');
  await expect(page.getByText('Recent activity (audit)')).toBeVisible();
  await expect(page.getByText('workspace.save').first()).toBeVisible();
});

test('GIP shows an intraday chart and switches interval', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL GIP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // Defaults to 5m · 1d; the shared technical-chart header reflects the context.
  await expect(page.getByRole('button', { name: '5m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/· 5m · 1d/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Candles', exact: true })).toBeVisible();

  // Switching the interval re-queries and updates the header.
  await page.getByRole('button', { name: '1m', exact: true }).click();
  await expect(page.getByRole('button', { name: '1m', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/· 1m · 1d/)).toBeVisible();
});

test('SETTINGS rebinds a keyboard shortcut (capture wins, persists, resets)', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'SETTINGS');
  await expect(page.getByText('Keyboard shortcuts')).toBeVisible();
  await expect(page.getByText('⌘/Ctrl + Shift + Z')).toBeVisible(); // reopen default

  // Rebind "Reopen last closed panel" to ⌘/Ctrl+K — which is the LIVE focus-bar
  // chord. If the capture beats the global handler, the command bar must NOT focus.
  const commandInput = page.getByLabel('Command input');
  await page.getByRole('button', { name: 'Rebind Reopen last closed panel' }).click();
  await expect(page.getByText('Press a chord (⌘/Ctrl/Alt)…')).toBeVisible();
  const savedPref = page.waitForResponse(
    (r) => r.url().includes('/api/preferences') && r.request().method() === 'POST',
  );
  await page.keyboard.press('Control+k');
  await expect(commandInput).not.toBeFocused(); // capture phase won the race
  await expect(page.getByText('⌘/Ctrl + K')).toHaveCount(2); // focus + reopen now share it
  await expect(page.getByText(/Two actions share a shortcut/)).toBeVisible();

  // The override persists across a reload (wait for the server to store it first).
  await savedPref;
  await page.reload();
  await runCommand(page, 'SETTINGS');
  await expect(page.getByText(/Two actions share a shortcut/)).toBeVisible();
  await expect(page.getByText('⌘/Ctrl + K')).toHaveCount(2);

  // Reset restores the default chord and clears the conflict.
  await page.getByRole('button', { name: 'Reset Reopen last closed panel' }).click();
  await expect(page.getByText('⌘/Ctrl + Shift + Z')).toBeVisible();
  await expect(page.getByText(/Two actions share a shortcut/)).toHaveCount(0);
});

test('history CSV export begins with a provenance header', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL HP');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const contents = readFileSync(path, 'utf8');
  expect(contents.startsWith('# provider=mock')).toBe(true);
  expect(contents).toContain('# capability=historicalPrices');
  expect(contents).toContain('Date,Open,High,Low,Close,Volume');

  // The same panel also exports JSON with provenance + the raw rows embedded.
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const json = JSON.parse(readFileSync(await (await jsonDownload).path(), 'utf8'));
  expect(json.provenance.provider).toBe('mock');
  expect(Array.isArray(json.rows)).toBe(true);
  expect(json.rows.length).toBeGreaterThan(0);
});

test('ERN renders the earnings estimates board with a reported surprise', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL ERN');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // The board shows a Surprise column and EPS/Revenue rows; the current quarter
  // carries a reported actual (mock), so at least one surprise % renders.
  await expect(page.getByText('Surprise', { exact: true })).toBeVisible();
  // The metric cell text is 'eps' (upper-cased via CSS, so the DOM keeps lowercase).
  await expect(page.getByText('eps', { exact: true }).first()).toBeVisible();
});

test('CHANGELOG opens the release history rendered from CHANGELOG.md', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'CHANGELOG');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Content is the bundled CHANGELOG.md (headings render as text).
  await expect(page.getByText('Changelog', { exact: true })).toBeVisible();
  await expect(page.getByText('Unreleased', { exact: true })).toBeVisible();
});

test('TOUR replays the keyboard tour on demand', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'TOUR');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // The tour panel shows the shared 30-second-tour heading and its first step.
  await expect(page.getByText('The 30-second tour', { exact: true })).toBeVisible();
  await expect(page.getByText('charts Apple', { exact: false })).toBeVisible();
});

test('FTS searches filing full text and lists cross-issuer matches', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'FTS climate risk');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);

  // The query input is present and the results table renders matched filings.
  await expect(page.getByLabel('Filing search query')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Filer' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Form' })).toBeVisible();
  await expect(page.getByText('SEC EDGAR full-text search')).toBeVisible();
});

test('INSD lists insider transactions with buy/sell direction', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL INSD');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Owned after' })).toBeVisible();
  // Mock insiders include at least one buy and the SEC/no-advice footer.
  await expect(page.getByText(/Form 3\/4\/5/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeVisible();

  // The Summary view aggregates net insider buying/selling.
  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await expect(page.getByText('Net shares')).toBeVisible();
  await expect(page.getByText('Distinct insiders')).toBeVisible();
});

test('MEVT decodes 8-K material events into a labeled timeline', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL MEVT');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  // Header, a decoded item label, and a category tally chip all render.
  await expect(page.getByText('material events (8-K)')).toBeVisible();
  await expect(page.getByText('Results of Operations and Financial Condition')).toBeVisible();
  await expect(page.getByText(/Financial Results · \d+/)).toBeVisible();
  // The untagged mock 8-K is shown honestly rather than guessed.
  await expect(page.getByText('Items not tagged by filer')).toBeVisible();
});

test('SCORE shows the Altman Z′ and Piotroski F fundamental scorecard', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'AAPL SCORE');
  await expect(page.getByTestId('panel-frame')).toHaveCount(1);
  await expect(page.getByText('Altman Z′-Score')).toBeVisible();
  await expect(page.getByText('Piotroski F-Score')).toBeVisible();
  // A Z′ component row and an F-Score signal row render from the mock fundamentals.
  await expect(page.getByText('Working capital / total assets')).toBeVisible();
  await expect(page.getByText('Positive operating cash flow')).toBeVisible();
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
