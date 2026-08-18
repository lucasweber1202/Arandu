import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { deploymentBaseUrl, renderSeoHead } from './scripts/seo-meta.mjs';
import { INTERNAL_PAGE_SET } from './lib/internal-pages.mjs';
import { assertPresentationModeIsSafe } from './lib/presentation-mode.mjs';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'reports', 'tests', 'test-results', 'playwright-report']);
const routeManifest = JSON.parse(readFileSync(resolve(root, 'data/public-routes.json'), 'utf8'));
const canonicalPages = new Set(routeManifest.canonical);
const configuredSiteUrl = (() => {
  try {
    const url = new URL(process.env.ARANDU_SITE_URL);
    if (url.protocol !== 'https:' || url.hostname.endsWith('.vercel.app') || url.hostname === 'localhost') return '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
})();
const configuredShareBaseUrl = deploymentBaseUrl();
const configuredPilotEnabled = ['1','true','yes','sim'].includes(String(process.env.ARANDU_PILOT_ENABLED || '').trim().toLowerCase());
// Lança quando VERCEL_ENV=production e ARANDU_PRESENTATION_MODE está ligado:
// o build inteiro falha antes de emitir qualquer página de demonstração.
const configuredPresentationMode = assertPresentationModeIsSafe();
const ASSET_VERSION = '20260608';

function collectHtmlFiles(dir = root) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (ignoredDirs.has(entry)) continue;
      files.push(...collectHtmlFiles(fullPath));
      continue;
    }
    if (extname(entry) === '.html') files.push(fullPath);
  }
  return files;
}

const htmlInputs = Object.fromEntries(
  collectHtmlFiles().filter((file) => !INTERNAL_PAGE_SET.has(relative(root, file).split(sep).join('/'))).map((file) => {
    const name = relative(root, file).replace(/\.html$/, '').split(sep).join('/');
    return [name, file];
  })
);

function cacheBustKnownAssets(html) {
  return html
    .replace(/href="css\/arandu-system\.css(\?v=[^"]*)?"/g, `href="css/arandu-system.css?v=${ASSET_VERSION}"`)
    .replace(/href="\/css\/arandu-system\.css(\?v=[^"]*)?"/g, `href="/css/arandu-system.css?v=${ASSET_VERSION}"`)
    .replace(/href="css\/arandu-product\.css(\?v=[^"]*)?"/g, `href="css/arandu-product.css?v=${ASSET_VERSION}"`)
    .replace(/href="\/css\/arandu-product\.css(\?v=[^"]*)?"/g, `href="/css/arandu-product.css?v=${ASSET_VERSION}"`)
    .replace(/src="js\/site\.js(\?v=[^"]*)?"/g, `src="js/site.js?v=${ASSET_VERSION}"`)
    .replace(/src="\/js\/site\.js(\?v=[^"]*)?"/g, `src="/js/site.js?v=${ASSET_VERSION}"`);
}

function injectNativeSearch(html) {
  if (/src=["'][^"']*site\.js(?:\?[^"']*)?["']/i.test(html)) return html;
  if (html.includes('native-search-link') || html.includes('href="pesquisa.html"')) return html;
  const searchLink = '<a class="search-trigger native-search-link" href="pesquisa.html">Pesquisar</a>';
  if (html.includes('class="brand-logo"')) return html.replace(/(<a class="brand-logo"[^>]*>.*?<\/a>)/, `$1${searchLink}`);
  if (html.includes('<header')) return html.replace('</header>', `${searchLink}</header>`);
  return html;
}

const SPEED_INSIGHTS_TAG = '<script type="module" src="/src/vercel-speed-insights.js"></script>';

/**
 * O tag do Speed Insights precisa entrar ANTES do plugin interno de HTML do
 * Vite: só assim `/src/vercel-speed-insights.js` é reconhecido como entrada,
 * empacotado e reescrito para o asset com hash. Injetado depois (ordem
 * padrão), o Vite nunca vê o módulo, nada é emitido em `dist/src/` e todas as
 * páginas publicadas disparam um 404 a cada carregamento.
 */
function injectSpeedInsights() {
  return {
    name: 'inject-arandu-speed-insights',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (html.includes('/src/vercel-speed-insights.js')) return html;
        return html.includes('</body>')
          ? html.replace('</body>', `${SPEED_INSIGHTS_TAG}</body>`)
          : `${html}${SPEED_INSIGHTS_TAG}`;
      }
    }
  };
}

function injectGlobalAssets() {
  const productCssTag = `<link rel="stylesheet" href="/css/arandu-product.css?v=${ASSET_VERSION}">`;
  const runtimeCssTag = '<link rel="stylesheet" href="/css/arandu-runtime.css?v=20260818-structural-1">';
  const auditJsTag = '<script src="/js/arandu-interface-audit.js?v=20260709-ui-rescue-1" defer></script>';
  const assistantJsTag = '<script src="/js/arandu-assistant.js?v=20260709-ui-rescue-1" defer></script>';
  const catalogSourceJsTag = `<script src="/js/catalog-source.js?v=20260717-catalog-release-1"></script>`;
  const pilotBootstrapTag = `<meta name="arandu-pilot-enabled" content="${configuredPilotEnabled ? 'true' : 'false'}">`;
  const pilotJsTag = `<script src="/js/pilot.js?v=20260717-pilot-1" defer></script>`;
  const platformRuntimeTag = `<script src="/js/platform-runtime.js?v=20260717-platform-1" defer></script>`;
  const presentationBootstrapTag = `<meta name="arandu-presentation-mode" content="${configuredPresentationMode ? 'true' : 'false'}">`;
  const presentationCssTag = '<link rel="stylesheet" href="/css/arandu-presentation.css?v=20260814-1">';
  const presentationRuntimeTag = '<script src="/js/presentation-runtime.js?v=20260814-1" defer></script>';

  return {
    name: 'inject-arandu-global-assets',
    transformIndexHtml(html, context) {
      let output = cacheBustKnownAssets(html);
      const pageName = context?.filename ? relative(root, context.filename).split(sep).join('/') : '';
      output = renderSeoHead(output, {
        pageName,
        siteUrl: configuredSiteUrl,
        shareBaseUrl: configuredShareBaseUrl,
        isCanonical: canonicalPages.has(pageName)
      });
      output = injectNativeSearch(output);
      if (!output.includes('/css/arandu-product.css')) output = output.includes('</head>') ? output.replace('</head>', `${productCssTag}</head>`) : `${productCssTag}${output}`;
      if (!output.includes('/css/arandu-runtime.css')) output = output.includes('</head>') ? output.replace('</head>', `${runtimeCssTag}</head>`) : `${runtimeCssTag}${output}`;
      if (!output.includes('/js/catalog-source.js')) output = output.includes('</head>') ? output.replace('</head>', `${catalogSourceJsTag}</head>`) : `${catalogSourceJsTag}${output}`;
      if (!output.includes('name="arandu-pilot-enabled"')) output = output.includes('</head>') ? output.replace('</head>', `${pilotBootstrapTag}</head>`) : `${pilotBootstrapTag}${output}`;
      if (!output.includes('name="arandu-presentation-mode"')) output = output.includes('</head>') ? output.replace('</head>', `${presentationBootstrapTag}</head>`) : `${presentationBootstrapTag}${output}`;
      if (configuredPresentationMode && !output.includes('/css/arandu-presentation.css')) output = output.includes('</head>') ? output.replace('</head>', `${presentationCssTag}</head>`) : `${presentationCssTag}${output}`;
      if (!output.includes('/js/arandu-interface-audit.js')) output = output.includes('</body>') ? output.replace('</body>', `${auditJsTag}</body>`) : `${output}${auditJsTag}`;
      if (!output.includes('/js/arandu-assistant.js')) output = output.includes('</body>') ? output.replace('</body>', `${assistantJsTag}</body>`) : `${output}${assistantJsTag}`;
      if (!output.includes('/js/pilot.js')) output = output.includes('</body>') ? output.replace('</body>', `${pilotJsTag}</body>`) : `${output}${pilotJsTag}`;
      if (!output.includes('/js/platform-runtime.js')) output = output.includes('</body>') ? output.replace('</body>', `${platformRuntimeTag}</body>`) : `${output}${platformRuntimeTag}`;
      if (configuredPresentationMode && !output.includes('/js/presentation-runtime.js')) output = output.includes('</body>') ? output.replace('</body>', `${presentationRuntimeTag}</body>`) : `${output}${presentationRuntimeTag}`;
      return output;
    }
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [injectSpeedInsights(), injectGlobalAssets()],
  build: { rollupOptions: { input: htmlInputs } }
});

