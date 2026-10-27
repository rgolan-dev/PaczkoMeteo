import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'allow' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
  ],
  webServer: { command: 'npm run preview -- --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  reporter: 'list'
});
