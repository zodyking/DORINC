import { defineConfig } from '@playwright/test'

/** Standalone CSS fixture audit — no app server or DB required. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'messages-mobile-audit.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'audit',
      use: {},
    },
  ],
})
