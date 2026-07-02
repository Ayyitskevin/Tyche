import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke config. Boots the API (mock mode) and the web dev server, then runs
 * the browser smoke suite in Chromium. When the environment provides Chromium
 * at a fixed path (TYCHE_CHROMIUM, or the dev container's /opt/pw-browsers),
 * that binary is used; otherwise Playwright's own managed browser is resolved
 * (CI runs `playwright install chromium`).
 */
const providedChromium = process.env.TYCHE_CHROMIUM ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(existsSync(providedChromium) ? { executablePath: providedChromium } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @tyche/api start',
      url: 'http://127.0.0.1:4010/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { API_PORT: '4010', TYCHE_DATA_DIR: './.tyche-e2e' },
    },
    {
      command: 'pnpm --filter @tyche/web dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
