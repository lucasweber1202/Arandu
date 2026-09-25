import { defineConfig } from 'vite';
import { resolve, relative, sep } from 'node:path';
import { deploymentBaseUrl, renderSeoHead } from './scripts/seo-meta.mjs';
import { ownSiteUrl } from './lib/public-site-url.mjs';
import { assertPresentationModeIsSafe } from './lib/presentation-mode.mjs';

const root = process.cwd();
const siteUrl = ownSiteUrl(process.env.ARANDU_SITE_URL);
const presentationMode = assertPresentationModeIsSafe();
const publicPages = new Set(['index.html', 'produto.html', 'credito.html', 'adquirencia.html', 'seguranca.html', 'limites.html']);
// Explicit production surface: legacy HTML is never discovered automatically.
const pages = [
  ...publicPages, 'login.html', 'cadastro.html', '404.html',
  'finance/index.html', 'finance/dashboard.html', 'finance/rfqs.html',
  'finance/rfq.html', 'finance/providers.html', 'finance/proposals.html',
  'finance/contracts.html', 'finance/settings.html', 'finance/boundaries.html',
  'provider/index.html', 'provider/invite.html', 'provider/rfqs.html', 'provider/proposal.html'
];
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
        if (presentationMode && /^(finance|provider)\//.test(page)) {
          html = html.replace('</head>', '<meta name="arandu-presentation-mode" content="true"></head>');
        }
        // Legacy invite query strings can contain a one-time secret.
        if (page !== 'provider/invite.html') html = html.replace('</body>', speedInsightsTag + '</body>');
        return renderSeoHead(html, {
          pageName: page, siteUrl, shareBaseUrl: deploymentBaseUrl(),
          isCanonical: publicPages.has(page)
        });
      }
    }
  }],
  build: { rollupOptions: { input } }
});
