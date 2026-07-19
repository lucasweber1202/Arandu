import path from 'node:path';

export const SEO_MARKER_START = '<!-- arandu:seo:start -->';
export const SEO_MARKER_END = '<!-- arandu:seo:end -->';
export const SEO_THEME_COLOR = '#180804';
export const SEO_DEFAULT_DESCRIPTION =
  'Arte brasileira contemporânea com curadoria, obras selecionadas, procedência e reserva assistida.';

const SITE_NAME = 'Arandu';
const LOCALE = 'pt_BR';
const SOCIAL_IMAGE_PATH = '/assets/social/arandu-og.png';
const SOCIAL_IMAGE_ALT =
  'Arandu — arte brasileira contemporânea com curadoria e procedência.';

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function plainText(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAttribute(value) {
  return plainText(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAbsoluteUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function deploymentBaseUrl(environment = process.env) {
  for (const candidate of [
    environment.ARANDU_SITE_URL,
    environment.VERCEL_PROJECT_PRODUCTION_URL,
    environment.VERCEL_URL
  ]) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    const normalized = safeAbsoluteUrl(/^https:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (normalized) return normalized;
  }
  return '';
}

export function routeSuffix(pageName) {
  const normalized = String(pageName || '')
    .split(path.sep)
    .join('/')
    .replace(/^\/+/, '');
  return normalized === 'index.html' ? '/' : `/${normalized}`;
}

function findTag(html, matcher) {
  const match = String(html || '').match(matcher);
  return match ? match[0] : '';
}

function tagAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? plainText(match[1]) : '';
}

export function pageTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return plainText(match?.[1]) || SITE_NAME;
}

export function pageDescription(html, title = pageTitle(html)) {
  const tag = findTag(html, /<meta[^>]+name=["']description["'][^>]*>/i);
  const content = tagAttribute(tag, 'content');
  if (content) return content;
  const subject = plainText(title).replace(/\s*[—-]\s*Arandu\s*$/i, '').trim();
  return subject && subject !== SITE_NAME
    ? `${subject} — ${SEO_DEFAULT_DESCRIPTION}`
    : SEO_DEFAULT_DESCRIPTION;
}

function stripManagedTags(html) {
  let output = String(html || '').replace(
    new RegExp(`\\s*${SEO_MARKER_START}[\\s\\S]*?${SEO_MARKER_END}\\s*`, 'g'),
    '\n'
  );
  const patterns = [
    /\s*<link[^>]+rel=["']canonical["'][^>]*>\s*/gi,
    /\s*<meta[^>]+name=["']robots["'][^>]*>\s*/gi,
    /\s*<meta[^>]+name=["']theme-color["'][^>]*>\s*/gi,
    /\s*<meta[^>]+name=["']mobile-web-app-capable["'][^>]*>\s*/gi,
    /\s*<meta[^>]+name=["']apple-mobile-web-app-title["'][^>]*>\s*/gi,
    /\s*<link[^>]+rel=["']manifest["'][^>]*>\s*/gi,
    /\s*<link[^>]+rel=["']apple-touch-icon["'][^>]*>\s*/gi,
    /\s*<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]*>\s*/gi,
    /\s*<meta[^>]+property=["']og:[^"']+["'][^>]*>\s*/gi,
    /\s*<meta[^>]+(?:name|property)=["']twitter:[^"']+["'][^>]*>\s*/gi
  ];
  for (const pattern of patterns) output = output.replace(pattern, '\n');
  return output;
}

function structuredData(siteUrl) {
  const payload = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: `${siteUrl}/`,
        logo: `${siteUrl}/assets/logo-arandu.svg`,
        description: SEO_DEFAULT_DESCRIPTION
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: SITE_NAME,
        inLanguage: 'pt-BR',
        publisher: { '@id': `${siteUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/pesquisa.html?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      }
    ]
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function buildSeoBlock({
  html,
  pageName,
  siteUrl = '',
  shareBaseUrl = '',
  isCanonical = false
}) {
  const title = pageTitle(html);
  const description = pageDescription(html, title);
  const suffix = routeSuffix(pageName);
  const canonicalBase = safeAbsoluteUrl(siteUrl);
  const shareBase = safeAbsoluteUrl(shareBaseUrl) || canonicalBase;
  const canonicalUrl = isCanonical && canonicalBase ? `${canonicalBase}${suffix}` : '';
  const shareUrl = canonicalUrl || (shareBase ? `${shareBase}${suffix}` : '');
  const imageUrl = shareBase ? `${shareBase}${SOCIAL_IMAGE_PATH}` : SOCIAL_IMAGE_PATH;
  const robots = canonicalUrl ? 'index,follow' : 'noindex,nofollow';
  const lines = [
    `  ${SEO_MARKER_START}`,
    `  <meta name="robots" content="${robots}">`,
    ...(canonicalUrl ? [`  <link rel="canonical" href="${canonicalUrl}">`] : []),
    `  <meta name="theme-color" content="${SEO_THEME_COLOR}">`,
    '  <meta name="mobile-web-app-capable" content="yes">',
    `  <meta name="apple-mobile-web-app-title" content="${SITE_NAME}">`,
    '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '  <link rel="icon" href="/assets/favicon-32.png" sizes="32x32" type="image/png">',
    '  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">',
    '  <link rel="manifest" href="/manifest.webmanifest">',
    '  <meta property="og:type" content="website">',
    `  <meta property="og:site_name" content="${SITE_NAME}">`,
    `  <meta property="og:locale" content="${LOCALE}">`,
    `  <meta property="og:title" content="${escapeAttribute(title)}">`,
    `  <meta property="og:description" content="${escapeAttribute(description)}">`,
    ...(shareUrl ? [`  <meta property="og:url" content="${shareUrl}">`] : []),
    `  <meta property="og:image" content="${imageUrl}">`,
    '  <meta property="og:image:width" content="1200">',
    '  <meta property="og:image:height" content="630">',
    `  <meta property="og:image:alt" content="${escapeAttribute(SOCIAL_IMAGE_ALT)}">`,
    '  <meta name="twitter:card" content="summary_large_image">',
    `  <meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `  <meta name="twitter:description" content="${escapeAttribute(description)}">`,
    `  <meta name="twitter:image" content="${imageUrl}">`,
    ...(pageName === 'index.html' && canonicalUrl
      ? [`  <script type="application/ld+json">${structuredData(canonicalBase)}</script>`]
      : []),
    `  ${SEO_MARKER_END}`
  ];
  if (!findTag(html, /<meta[^>]+name=["']description["'][^>]*>/i)) {
    lines.splice(2, 0, `  <meta name="description" content="${escapeAttribute(description)}">`);
  }
  return lines.join('\n');
}

export function renderSeoHead(html, options) {
  const cleaned = stripManagedTags(html);
  const block = buildSeoBlock({ ...options, html: cleaned });
  if (/<\/head>/i.test(cleaned)) {
    const normalized = cleaned.replace(/\s*<\/head>/i, '\n</head>');
    return normalized.replace(/<\/head>/i, `${block}\n</head>`);
  }
  return `${block}\n${cleaned}`;
}
