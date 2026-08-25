import { defineConfig, devices } from '@playwright/test';

/**
 * Suíte de compra aberta.
 *
 * Só faz sentido contra um build gerado com ARANDU_COMMERCIAL_READY=true (ver
 * `pretest:e2e:commerce`). A suíte principal cobre o estado da beta, em que a
 * reserva está fechada e o site oferece a curadoria no lugar dela; esta cobre
 * o fluxo de reserva que precisa continuar correto quando a política comercial
 * for aprovada.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/commerce-journeys.spec.js',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright-commerce', open: 'never' }]],
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
