import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { deploymentBaseUrl, renderSeoHead } from './scripts/seo-meta.mjs';
import { INTERNAL_PAGE_SET } from './lib/internal-pages.mjs';
import { ownSiteUrl } from './lib/public-site-url.mjs';
import { assertPresentationModeIsSafe } from './lib/presentation-mode.mjs';
import { applyPublicShell, shellApplies } from './lib/public-shell.mjs';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'reports', 'tests', 'test-results', 'playwright-report']);
const routeManifest = JSON.parse(readFileSync(resolve(root, 'data/public-routes.json'), 'utf8'));
const canonicalPages = new Set(routeManifest.canonical);
const configuredSiteUrl = ownSiteUrl(process.env.ARANDU_SITE_URL);
const configuredShareBaseUrl = deploymentBaseUrl();
const configuredPilotEnabled = ['1','true','yes','sim'].includes(String(process.env.ARANDU_PILOT_ENABLED || '').trim().toLowerCase());
// Lança quando VERCEL_ENV=production e ARANDU_PRESENTATION_MODE está ligado:
// o build inteiro falha antes de emitir qualquer página de demonstração.
const configuredPresentationMode = assertPresentationModeIsSafe();
const configuredCommercialReady = ['1','true','yes','sim'].includes(String(process.env.ARANDU_COMMERCIAL_READY || '').trim().toLowerCase());
const ASSET_VERSION = '20260608';
const FINANCE_PAGE_PREFIXES = ['finance/', 'provider/'];

// Beta pública: enquanto a política comercial não estiver aprovada e o catálogo
// real não estiver liberado, toda página pública declara o estado no topo. O
// aviso é estático no HTML emitido (nada de injeção tardia, que deslocaria o
// layout) e some sozinho quando ARANDU_COMMERCIAL_READY entrar como verdadeiro.
const BETA_BANNER = configuredCommercialReady
  ? ''
  : '<aside class="beta-banner" data-beta-banner aria-label="Estado da plataforma">'
    + '<div class="container"><b>Beta</b>'
    + '<span>Acervo em validação curatorial; compra ainda não aberta. '
    + '<a href="para-artistas.html">Enviar portfólio</a> · '
    + '<a href="contato.html">Falar com a curadoria</a></span></div></aside>';

// O aviso entra depois do link de pular conteúdo para não roubar o primeiro
// foco do teclado, e antes do cabeçalho para ser a primeira coisa lida.
function injectBetaBanner(html) {
  if (!BETA_BANNER || html.includes('data-beta-banner')) return html;
  const skipLink = html.match(/<body[^>]*>\s*<a class="skip-link"[^>]*>[^<]*<\/a>/i);
  if (skipLink) return html.replace(skipLink[0], `${skipLink[0]}${BETA_BANNER}`);
  const body = html.match(/<body[^>]*>/i);
  return body ? html.replace(body[0], `${body[0]}${BETA_BANNER}`) : html;
}

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

// A casca canônica traz o botão do menu; sem js/site.js ele não abre. Antes,
// obrigado.html ficava com um menu inerte porque nunca carregou o script.
function ensureShellRuntime(html, pageName) {
  if (!shellApplies(pageName)) return html;
  if (/src=["'][^"']*\/?js\/site\.js(?:\?[^"']*)?["']/i.test(html)) return html;
  const tag = `<script src="/js/site.js?v=${ASSET_VERSION}"></script>`;
  return html.includes('</body>') ? html.replace('</body>', `${tag}</body>`) : `${html}${tag}`;
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
  // Mesma fonte do aviso de beta: enquanto a política comercial não estiver
  // aprovada, a página não pode oferecer reserva — o servidor a recusa.
  const commercialBootstrapTag = `<meta name="arandu-commercial-ready" content="${configuredCommercialReady ? 'true' : 'false'}">`;
  const commerceJsTag = '<script src="/js/commerce-availability.js?v=20260825-commerce-1" defer></script>';
  const presentationCssTag = '<link rel="stylesheet" href="/css/arandu-presentation.css?v=20260814-1">';
  const presentationRuntimeTag = '<script src="/js/presentation-runtime.js?v=20260814-1" defer></script>';

  return {
    name: 'inject-arandu-global-assets',
    transformIndexHtml(html, context) {
      let output = cacheBustKnownAssets(html);
      const pageName = context?.filename ? relative(root, context.filename).split(sep).join('/') : '';
      // Os portais B2B (procurement financeiro) têm casca, CSS e runtime
      // próprios. Injetar aqui a casca pública, o banner de beta do acervo e os
      // scripts do site de arte quebraria o layout do painel e carregaria
      // JavaScript irrelevante. Eles recebem apenas o bloco de SEO, sem
      // canônica — são páginas de aplicação, não de conteúdo indexável.
      if (FINANCE_PAGE_PREFIXES.some((prefix) => pageName.startsWith(prefix))) {
        // O runtime do portal só carrega o conjunto demonstrativo quando esta
        // marcação existe, e ela só existe fora de produção: o build inteiro
        // falha se ARANDU_PRESENTATION_MODE for ligado com VERCEL_ENV=production.
        if (configuredPresentationMode && !output.includes('name="arandu-presentation-mode"')) {
          output = output.replace('</head>', `${presentationBootstrapTag}</head>`);
        }
        return renderSeoHead(output, {
          pageName,
          siteUrl: configuredSiteUrl,
          shareBaseUrl: configuredShareBaseUrl,
          isCanonical: false
        });
      }
      output = renderSeoHead(output, {
        pageName,
        siteUrl: configuredSiteUrl,
        shareBaseUrl: configuredShareBaseUrl,
        isCanonical: canonicalPages.has(pageName)
      });
      output = applyPublicShell(output, pageName);
      output = ensureShellRuntime(output, pageName);
      output = injectNativeSearch(output);
      output = injectBetaBanner(output);
      if (!output.includes('/css/arandu-product.css')) output = output.includes('</head>') ? output.replace('</head>', `${productCssTag}</head>`) : `${productCssTag}${output}`;
      if (!output.includes('/css/arandu-runtime.css')) output = output.includes('</head>') ? output.replace('</head>', `${runtimeCssTag}</head>`) : `${runtimeCssTag}${output}`;
      if (!output.includes('/js/catalog-source.js')) output = output.includes('</head>') ? output.replace('</head>', `${catalogSourceJsTag}</head>`) : `${catalogSourceJsTag}${output}`;
      if (!output.includes('name="arandu-pilot-enabled"')) output = output.includes('</head>') ? output.replace('</head>', `${pilotBootstrapTag}</head>`) : `${pilotBootstrapTag}${output}`;
      if (!output.includes('name="arandu-presentation-mode"')) output = output.includes('</head>') ? output.replace('</head>', `${presentationBootstrapTag}</head>`) : `${presentationBootstrapTag}${output}`;
      if (!output.includes('name="arandu-commercial-ready"')) output = output.includes('</head>') ? output.replace('</head>', `${commercialBootstrapTag}</head>`) : `${commercialBootstrapTag}${output}`;
      if (configuredPresentationMode && !output.includes('/css/arandu-presentation.css')) output = output.includes('</head>') ? output.replace('</head>', `${presentationCssTag}</head>`) : `${presentationCssTag}${output}`;
      if (!output.includes('/js/arandu-interface-audit.js')) output = output.includes('</body>') ? output.replace('</body>', `${auditJsTag}</body>`) : `${output}${auditJsTag}`;
      if (!output.includes('/js/arandu-assistant.js')) output = output.includes('</body>') ? output.replace('</body>', `${assistantJsTag}</body>`) : `${output}${assistantJsTag}`;
      if (!output.includes('/js/commerce-availability.js')) output = output.includes('</body>') ? output.replace('</body>', `${commerceJsTag}</body>`) : `${output}${commerceJsTag}`;
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

