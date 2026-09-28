import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cd ../frontend && npm install && npm run dev -- --host 0.0.0.0 --port 5173',
    url: 'http://localhost:5173',
    // Any value turns the Google buttons on: the Google cases replace Google's script and the API
    // answers, so it does not need to be real. An already running dev server is reused as is; if it
    // was started without one, those cases skip.
    env: { VITE_GOOGLE_CLIENT_ID: 'qa-client.apps.googleusercontent.com' },
    reuseExistingServer: true,
    timeout: 120000,
  },
});
