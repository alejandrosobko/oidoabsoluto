import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mismo motor que Safari del iPhone.
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
