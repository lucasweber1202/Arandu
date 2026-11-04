import {existsSync,readFileSync} from 'node:fs';
import {localDemoCertificateArgs} from './scripts/ci-demo/browser-tls.mjs';
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
const baseURL = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
// Trust this stack's exact loopback key instead of restarting transactions
// through Chromium's per-request certificate-error exception handler.
const certFile = new URL('./scripts/pilot-local/.state/cert.pem', import.meta.url);
const certificateArgs = localDemoCertificateArgs(baseURL, existsSync(certFile) ? readFileSync(certFile) : null);
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/demo-baseline.spec.js', '**/demo-workspaces.spec.js', '**/demo-entry-journeys.spec.js', '**/demo-entry-lifecycle.spec.js'],
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright-demo', open: 'never' }]],
  use: {
    baseURL,
    ignoreHTTPSErrors: certificateArgs.length === 0, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: certificateArgs }
  },
  projects: [
    { name: 'demo-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'demo-mobile', use: { ...devices['Pixel 7'] } }
  ]
});
