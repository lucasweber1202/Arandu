import { defineConfig, devices } from '@playwright/test';

/**
 * Suíte de apresentação.
 *
 * Só faz sentido contra um build gerado com ARANDU_PRESENTATION_MODE=true e
 * VERCEL_ENV=preview (ver `pretest:e2e:presentation`). Fica separada da config
 * principal para que `npm run test:e2e` continue cobrindo todas as jornadas
 * normais sem depender do modo de demonstração.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/presentation-journeys.spec.js', '**/demo-journeys.spec.js', '**/demo-workspace.spec.js', '**/demo-workspace-next.spec.js'],
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright-presentation', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } }
  ],
  webServer: { command: 'npm run serve:test', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120000 }
});
