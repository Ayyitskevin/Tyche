import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke config. Boots the API (mock mode) and the web dev server, then runs
 * the workspace persistence smoke test in Chromium. Chromium is provided by the
 * environment (PLAYWRIGHT_BROWSERS_PATH) — do not run `playwright install`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'on-first-retry',
    // The environment provides Chromium at a fixed path; do not download.
    launchOptions: {
      executablePath: process.env.TYCHE_CHROMIUM ?? '/opt/pw-browsers/chromium',
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
