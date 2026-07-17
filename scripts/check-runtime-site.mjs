import process from 'node:process';
import { URL } from 'node:url';

const rawBaseUrl = process.argv[2] || process.env.ARANDU_SITE_URL;

if (!rawBaseUrl) {
  console.error('Informe <url-base> ou configure ARANDU_SITE_URL.');
  process.exit(2);
}

const baseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;
const origin = new URL(baseUrl).origin;
const pages = [
  'index.html',
  'comprar-arte.html',
  'colecoes.html',
  'obras.html',
  'para-artistas.html',
  'obra.html?id=estudo-de-solo-04',
  'confianca.html'
];
const apiChecks = ['/api/health', '/api/catalog', '/api/collections'];
const checked = new Set();
const failures = [];
const warnings = [];

async function fetchText(url, label) {
  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();
  return { response, text };
}

async function checkUrl(url, label) {
  const fullUrl = new URL(url, baseUrl).toString();
  if (checked.has(fullUrl)) return;
  checked.add(fullUrl);
  try {
    const { response, text } = await fetchText(fullUrl, label);
    if (!response.ok) {
      if (label.startsWith('api:')) {
        warnings.push(`${label} -> ${response.status} ${response.statusText}`);
      } else {
        failures.push(`${label} -> ${response.status} ${response.statusText}`);
      }
      return;
    }
    if (label.includes('page')) {
      const assetMatches = [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
      const internalLinks = assetMatches.filter((value) => !value.startsWith('http') && !value.startsWith('mailto:') && !value.startsWith('tel:') && !value.startsWith('#'));
      for (const asset of internalLinks.slice(0, 20)) {
        if (asset.includes('.css') || asset.includes('.js') || asset.includes('.png') || asset.includes('.jpg') || asset.includes('.jpeg') || asset.includes('.svg') || asset.includes('.webp') || asset.includes('.gif') || asset.includes('.ico')) {
          const assetUrl = new URL(asset, fullUrl).toString();
          const assetResponse = await fetch(assetUrl, { redirect: 'follow' });
          if (!assetResponse.ok) failures.push(`${label} asset ${asset} -> ${assetResponse.status}`);
        }
      }
    }
    console.log(`OK ${label} ${fullUrl}`);
  } catch (error) {
    failures.push(`${label} -> ${error.message}`);
  }
}

async function main() {
  for (const page of pages) {
    await checkUrl(page, `page:${page}`);
  }

  for (const apiPath of apiChecks) {
    await checkUrl(apiPath, `api:${apiPath}`);
  }

  const homepage = await fetchText(baseUrl, 'page:home');
  const homeText = homepage.text;
  const internalPageLinks = [...homeText.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1]).filter((value) => value.endsWith('.html') || value.startsWith('/'));
  for (const link of internalPageLinks.slice(0, 20)) {
    await checkUrl(link, `link:${link}`);
  }

  if (failures.length) {
    console.error(`\nRuntime check failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  if (warnings.length) {
    console.warn(`\nRuntime check reported ${warnings.length} API warning(s):`);
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  }

  console.log(`\nRuntime check passed for ${pages.length} page(s), ${apiChecks.length} API endpoint(s), and ${Math.min(20, internalPageLinks.length)} internal link(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
