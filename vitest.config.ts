import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config. All foundation unit/contract tests are pure logic and run
 * in the Node environment (parser, registry, provider conformance, serialization,
 * analytics, API smoke via fastify.inject). Browser e2e lives in Playwright
 * (`pnpm test:e2e`) and is intentionally excluded here.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/test/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'apps/**/test/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.e2e.ts'],
    reporters: ['default'],
  },
});
