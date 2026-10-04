import { defineConfig } from 'vite';
import { resolve, relative, sep } from 'node:path';
import { deploymentBaseUrl, renderSeoHead, PUBLIC_PAGES } from './scripts/seo-meta.mjs';
import { ownSiteUrl } from './lib/public-site-url.mjs';
import { assertPresentationModeIsSafe } from './lib/presentation-mode.mjs';
import { assertDemoModeIsSafe } from './lib/demo-mode.mjs';
import { PAGES as FINANCE_PAGES, DEMO_ONLY_PAGES } from './scripts/generate-finance-pages.mjs';

const root = process.cwd();
const siteUrl = ownSiteUrl(process.env.ARANDU_SITE_URL);
assertPresentationModeIsSafe();
// Demonstração interativa: decidida no build, nunca por parâmetro de URL. Em
// produção financeira a constante é false e o motor não entra no pacote.
const demoMode = assertDemoModeIsSafe();
const publicPages = new Set(PUBLIC_PAGES);
// Explicit production surface: legacy HTML is never discovered automatically.
const financePages = FINANCE_PAGES.map((page) => page.path);
// Telas exclusivas da demo (Work OS) só entram no build demonstrativo.
const demoPages = demoMode ? ['demo/index.html', ...financePages.map((page) => `demo/${page}`), ...DEMO_ONLY_PAGES.map((page) => `demo/${page.path}`)] : [];
const pages = [...publicPages, 'login.html', 'cadastro.html', '404.html', ...financePages, ...demoPages];
const input = Object.fromEntries(pages.map(page => [page.replace(/\.html$/, ''), resolve(root, page)]));
const speedInsightsTag = '<script type="module" src="/src/vercel-speed-insights.js"></script>';

export default defineConfig({
  appType: 'mpa',
  plugins: [{
    name: 'financial-head',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const page = relative(root, context.filename).split(sep).join('/');
        // A demonstração não carrega analytics: nada do sandbox vira métrica real.
        // O convite também não: o token de uso único nunca pode chegar a terceiros.
        if (page !== 'provider/invite.html' && !page.startsWith('demo/')) html = html.replace('</body>', speedInsightsTag + '</body>');
        if (demoMode && page === 'index.html') {
          html = html.replace('<a class="button ghost" href="#fluxo">', '<a class="button ghost" href="/demo/index.html" data-demo-cta>Explorar demonstração</a><a class="button ghost" href="#fluxo">');
        }
        return renderSeoHead(html, {
          pageName: page, siteUrl, shareBaseUrl: deploymentBaseUrl(),
          isCanonical: publicPages.has(page)
        });
      }
    }
  }],
  define: { __ARANDU_DEMO__: JSON.stringify(demoMode) },
  build: { rollupOptions: { input } }
});
