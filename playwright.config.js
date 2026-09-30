import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  // Duas suítes dependem de um build com variável própria e falhariam contra o
  // build padrão: apresentação (ARANDU_PRESENTATION_MODE=true) e compra aberta
  // (ARANDU_COMMERCIAL_READY=true). Cada uma tem a sua config e fica de fora
  // daqui, para que `npm run test:e2e` continue cobrindo o estado publicado.
  testIgnore: ['**/presentation-journeys.spec.js', '**/demo-journeys.spec.js', '**/demo-workspace.spec.js', '**/commerce-journeys.spec.js'], timeout: 30000, fullyParallel: true, retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } }
  ],
  webServer: { command: 'npm run serve:test', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 120000 }
});
