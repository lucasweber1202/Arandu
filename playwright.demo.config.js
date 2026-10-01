import { defineConfig, devices } from '@playwright/test';

/**
 * Jornada da demonstração canônica (Vitta Foods) contra o produto REAL:
 * app com ARANDU_ENV=demo + Supabase com o dataset de scripts/demo/seed.mjs.
 *
 *   npm run demo:setup                      # sobe e semeia o ambiente local
 *   set -a; . scripts/pilot-local/.state/demo.env; set +a
 *   npm run test:e2e:demo
 *
 * Contra a demo publicada: ARANDU_DEMO_APP_URL=https://… ARANDU_DEMO_PASSWORD=… npm run test:e2e:demo
 * A jornada é só de leitura: pode rodar quantas vezes for preciso sem reset.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/demo-baseline.spec.js'],
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright-demo', open: 'never' }]],
  use: {
    baseURL: process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443',
    ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {}
  },
  projects: [
    { name: 'demo-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'demo-mobile', use: { ...devices['Pixel 7'] } }
  ]
});
