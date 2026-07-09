import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'mobile-375',
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: 'desktop-1440',
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: process.env.CI ? 'npm run build && npm run preview -- --port 3000' : 'npm run dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
