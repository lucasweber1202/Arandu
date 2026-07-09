import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', 'dist']);
const ASSET_VERSION = '20260608';
const HARDENING_VERSION = '20260707-hardening-1';
const POLISH_VERSION = '20260707-polish-1';
const UX_VERSION = '20260708-ux-1';
const UX_TUNE_VERSION = '20260708-ux-tune-1';
const OP_VERSION = '20260709-operational-1';
const NEXT_OPS_VERSION = '20260709-next-ops-1';
const ADVANCED_VERSION = '20260709-advanced-1';
const RESCUE_VERSION = '20260709-ui-rescue-1';

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
  collectHtmlFiles().map((file) => {
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
    .replace(/href="css\/arandu-final-polish\.css(\?v=[^"]*)?"/g, `href="css/arandu-final-polish.css?v=${POLISH_VERSION}"`)
    .replace(/href="\/css\/arandu-final-polish\.css(\?v=[^"]*)?"/g, `href="/css/arandu-final-polish.css?v=${POLISH_VERSION}"`)
    .replace(/href="css\/arandu-ux-refresh\.css(\?v=[^"]*)?"/g, `href="css/arandu-ux-refresh.css?v=${UX_VERSION}"`)
    .replace(/href="\/css\/arandu-ux-refresh\.css(\?v=[^"]*)?"/g, `href="/css/arandu-ux-refresh.css?v=${UX_VERSION}"`)
    .replace(/href="css\/arandu-ux-final-tune\.css(\?v=[^"]*)?"/g, `href="css/arandu-ux-final-tune.css?v=${UX_TUNE_VERSION}"`)
    .replace(/href="\/css\/arandu-ux-final-tune\.css(\?v=[^"]*)?"/g, `href="/css/arandu-ux-final-tune.css?v=${UX_TUNE_VERSION}"`)
    .replace(/href="css\/arandu-operational-upgrade\.css(\?v=[^"]*)?"/g, `href="css/arandu-operational-upgrade.css?v=${OP_VERSION}"`)
    .replace(/href="\/css\/arandu-operational-upgrade\.css(\?v=[^"]*)?"/g, `href="/css/arandu-operational-upgrade.css?v=${OP_VERSION}"`)
    .replace(/href="css\/arandu-next-ops\.css(\?v=[^"]*)?"/g, `href="css/arandu-next-ops.css?v=${NEXT_OPS_VERSION}"`)
    .replace(/href="\/css\/arandu-next-ops\.css(\?v=[^"]*)?"/g, `href="/css/arandu-next-ops.css?v=${NEXT_OPS_VERSION}"`)
    .replace(/href="css\/arandu-advanced-features\.css(\?v=[^"]*)?"/g, `href="css/arandu-advanced-features.css?v=${ADVANCED_VERSION}"`)
    .replace(/href="\/css\/arandu-advanced-features\.css(\?v=[^"]*)?"/g, `href="/css/arandu-advanced-features.css?v=${ADVANCED_VERSION}"`)
    .replace(/href="css\/arandu-ui-rescue\.css(\?v=[^"]*)?"/g, `href="css/arandu-ui-rescue.css?v=${RESCUE_VERSION}"`)
    .replace(/href="\/css\/arandu-ui-rescue\.css(\?v=[^"]*)?"/g, `href="/css/arandu-ui-rescue.css?v=${RESCUE_VERSION}"`)
    .replace(/src="js\/site\.js(\?v=[^"]*)?"/g, `src="js/site.js?v=${ASSET_VERSION}"`)
    .replace(/src="\/js\/site\.js(\?v=[^"]*)?"/g, `src="/js/site.js?v=${ASSET_VERSION}"`);
}

function injectNativeSearch(html) {
  if (html.includes('native-search-link') || html.includes('href="pesquisa.html"')) return html;
  const searchLink = '<a class="search-trigger native-search-link" href="pesquisa.html">Pesquisar</a>';
  if (html.includes('class="brand-logo"')) return html.replace(/(<a class="brand-logo"[^>]*>.*?<\/a>)/, `$1${searchLink}`);
  if (html.includes('<header')) return html.replace('</header>', `${searchLink}</header>`);
  return html;
}

function injectGlobalAssets() {
  const speedInsightsTag = '<script type="module" src="/src/vercel-speed-insights.js"></script>';
  const productCssTag = `<link rel="stylesheet" href="/css/arandu-product.css?v=${ASSET_VERSION}">`;
  const hardeningCssTag = `<link rel="stylesheet" href="/css/arandu-interface-hardening.css?v=${HARDENING_VERSION}">`;
  const polishCssTag = `<link rel="stylesheet" href="/css/arandu-final-polish.css?v=${POLISH_VERSION}">`;
  const uxCssTag = `<link rel="stylesheet" href="/css/arandu-ux-refresh.css?v=${UX_VERSION}">`;
  const uxTuneCssTag = `<link rel="stylesheet" href="/css/arandu-ux-final-tune.css?v=${UX_TUNE_VERSION}">`;
  const opCssTag = `<link rel="stylesheet" href="/css/arandu-operational-upgrade.css?v=${OP_VERSION}">`;
  const nextOpsCssTag = `<link rel="stylesheet" href="/css/arandu-next-ops.css?v=${NEXT_OPS_VERSION}">`;
  const advancedCssTag = `<link rel="stylesheet" href="/css/arandu-advanced-features.css?v=${ADVANCED_VERSION}">`;
  const rescueCssTag = `<link rel="stylesheet" href="/css/arandu-ui-rescue.css?v=${RESCUE_VERSION}">`;
  const auditJsTag = `<script src="/js/arandu-interface-audit.js?v=${HARDENING_VERSION}" defer></script>`;
  const assistantJsTag = `<script src="/js/arandu-assistant.js?v=${RESCUE_VERSION}" defer></script>`;

  return {
    name: 'inject-arandu-global-assets',
    transformIndexHtml(html) {
      let output = cacheBustKnownAssets(html);
      output = injectNativeSearch(output);
      if (!output.includes('/css/arandu-product.css')) output = output.includes('</head>') ? output.replace('</head>', `${productCssTag}</head>`) : `${productCssTag}${output}`;
      if (!output.includes('/css/arandu-interface-hardening.css')) output = output.includes('</head>') ? output.replace('</head>', `${hardeningCssTag}</head>`) : `${hardeningCssTag}${output}`;
      if (!output.includes('/css/arandu-final-polish.css')) output = output.includes('</head>') ? output.replace('</head>', `${polishCssTag}</head>`) : `${polishCssTag}${output}`;
      if (!output.includes('/css/arandu-ux-refresh.css')) output = output.includes('</head>') ? output.replace('</head>', `${uxCssTag}</head>`) : `${uxCssTag}${output}`;
      if (!output.includes('/css/arandu-ux-final-tune.css')) output = output.includes('</head>') ? output.replace('</head>', `${uxTuneCssTag}</head>`) : `${uxTuneCssTag}${output}`;
      if (!output.includes('/css/arandu-operational-upgrade.css')) output = output.includes('</head>') ? output.replace('</head>', `${opCssTag}</head>`) : `${opCssTag}${output}`;
      if (!output.includes('/css/arandu-next-ops.css')) output = output.includes('</head>') ? output.replace('</head>', `${nextOpsCssTag}</head>`) : `${output}${nextOpsCssTag}`;
      if (!output.includes('/css/arandu-advanced-features.css')) output = output.includes('</head>') ? output.replace('</head>', `${advancedCssTag}</head>`) : `${output}${advancedCssTag}`;
      if (!output.includes('/css/arandu-ui-rescue.css')) output = output.includes('</head>') ? output.replace('</head>', `${rescueCssTag}</head>`) : `${output}${rescueCssTag}`;
      if (!output.includes('/js/arandu-interface-audit.js')) output = output.includes('</body>') ? output.replace('</body>', `${auditJsTag}</body>`) : `${output}${auditJsTag}`;
      if (!output.includes('/js/arandu-assistant.js')) output = output.includes('</body>') ? output.replace('</body>', `${assistantJsTag}</body>`) : `${output}${assistantJsTag}`;
      if (!output.includes('/src/vercel-speed-insights.js')) output = output.includes('</body>') ? output.replace('</body>', `${speedInsightsTag}</body>`) : `${output}${speedInsightsTag}`;
      return output;
    }
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [injectGlobalAssets()],
  build: { rollupOptions: { input: htmlInputs } }
});
