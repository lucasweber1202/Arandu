import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', 'dist']);
const ASSET_VERSION = '20260608';
const HARDENING_VERSION = '20260707-hardening-1';
const POLISH_VERSION = '20260707-polish-1';

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
    .replace(/src="js\/site\.js(\?v=[^"]*)?"/g, `src="js/site.js?v=${ASSET_VERSION}"`)
    .replace(/src="\/js\/site\.js(\?v=[^"]*)?"/g, `src="/js/site.js?v=${ASSET_VERSION}"`);
}

function injectNativeSearch(html) {
  if (html.includes('native-search-link') || html.includes('href="pesquisa.html"')) return html;
  const searchLink = '<a class="search-trigger native-search-link" href="pesquisa.html">Pesquisar</a>';
  if (html.includes('class="brand-logo"')) {
    return html.replace(/(<a class="brand-logo"[^>]*>.*?<\/a>)/, `$1${searchLink}`);
  }
  if (html.includes('<header')) return html.replace('</header>', `${searchLink}</header>`);
  return html;
}

function injectGlobalAssets() {
  const speedInsightsTag = '<script type="module" src="/src/vercel-speed-insights.js"></script>';
  const productCssTag = `<link rel="stylesheet" href="/css/arandu-product.css?v=${ASSET_VERSION}">`;
  const hardeningCssTag = `<link rel="stylesheet" href="/css/arandu-interface-hardening.css?v=${HARDENING_VERSION}">`;
  const polishCssTag = `<link rel="stylesheet" href="/css/arandu-final-polish.css?v=${POLISH_VERSION}">`;
  const auditJsTag = `<script src="/js/arandu-interface-audit.js?v=${HARDENING_VERSION}" defer></script>`;

  return {
    name: 'inject-arandu-global-assets',
    transformIndexHtml(html) {
      let output = cacheBustKnownAssets(html);
      output = injectNativeSearch(output);
      if (!output.includes('/css/arandu-product.css')) {
        output = output.includes('</head>') ? output.replace('</head>', `${productCssTag}</head>`) : `${productCssTag}${output}`;
      }
      if (!output.includes('/css/arandu-interface-hardening.css')) {
        output = output.includes('</head>') ? output.replace('</head>', `${hardeningCssTag}</head>`) : `${hardeningCssTag}${output}`;
      }
      if (!output.includes('/css/arandu-final-polish.css')) {
        output = output.includes('</head>') ? output.replace('</head>', `${polishCssTag}</head>`) : `${polishCssTag}${output}`;
      }
      if (!output.includes('/js/arandu-interface-audit.js')) {
        output = output.includes('</body>') ? output.replace('</body>', `${auditJsTag}</body>`) : `${output}${auditJsTag}`;
      }
      if (!output.includes('/src/vercel-speed-insights.js')) {
        output = output.includes('</body>') ? output.replace('</body>', `${speedInsightsTag}</body>`) : `${output}${speedInsightsTag}`;
      }
      return output;
    }
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [injectGlobalAssets()],
  build: {
    rollupOptions: {
      input: htmlInputs
    }
  }
});
