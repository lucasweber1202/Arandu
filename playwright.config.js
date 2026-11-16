import { ciWorkers } from './scripts/ci-resource-policy.mjs';
import { defineConfig, devices } from '@playwright/test';
import presentation from './playwright.presentation.config.js';
import hostedDemo from './playwright.demo.config.js';
export default defineConfig({
  testDir: './tests/e2e',
  // A suíte de apresentação/demonstração depende de um build com variável
  // própria (ARANDU_PRESENTATION_MODE=true) e tem a sua config; fica de fora
  // daqui, para que `npm run test:e2e` continue cobrindo o estado publicado.
  // Specs da suíte de apresentação (build ARANDU_PRESENTATION_MODE) e da Demo
  // canônica (playwright.demo.config.js, app ARANDU_ENV=demo) nunca rodam aqui: a lista vem da própria config de apresentação,
  // para não divergir (antes, demo-workspace-v2, demo-work-os-v3 e public-tour
  // rodavam no build errado e falhavam em `npx playwright test`).
  testIgnore: [...new Set([...presentation.testMatch, ...hostedDemo.testMatch])], timeout: 30000, fullyParallel: true, retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? ciWorkers() : undefined,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }], ['./scripts/ci-browser-reporter.mjs']],
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
