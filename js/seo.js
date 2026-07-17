/* ARANDU — SEO técnico e dados estruturados */
(function setupAranduSeo() {
  const hostname = window.location.hostname;
  const isCustomProductionHost = window.location.protocol === 'https:'
    && hostname !== 'localhost'
    && hostname !== '127.0.0.1'
    && !hostname.endsWith('.vercel.app');
  const siteUrl = isCustomProductionHost ? window.location.origin : '';
  const pagePath = window.location.pathname.split('/').pop() || 'index.html';
  const canonicalPath = pagePath === 'index.html' ? '/' : `/${pagePath}`;
  const title = document.title || 'Arandu — Arte brasileira contemporânea';
  const description = document.querySelector('meta[name="description"]')?.content || 'Curadoria de arte brasileira contemporânea com contexto, trajetória e procedência.';

  function ensureMeta(name, content, attr = 'name') {
    if (!content) return;
    let tag = document.querySelector(`meta[${attr}="${name}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attr, name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  }

  function ensureLink(rel, href) {
    if (!href || document.querySelector(`link[rel="${rel}"]`)) return;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  }

  function addJsonLd(id, payload) {
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    script.textContent = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  if (siteUrl) ensureLink('canonical', `${siteUrl}${canonicalPath}`);
  ensureMeta('og:title', title, 'property');
  ensureMeta('og:description', description, 'property');
  ensureMeta('og:type', pagePath === 'index.html' ? 'website' : 'article', 'property');
  if (siteUrl) ensureMeta('og:url', `${siteUrl}${canonicalPath}`, 'property');
  ensureMeta('twitter:card', 'summary_large_image');
  ensureMeta('theme-color', '#5a1f1a');

  if (!siteUrl) return;

  addJsonLd('arandu-organization-jsonld', {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Arandu',
    url: siteUrl,
    description,
    brand: { '@type': 'Brand', name: 'Arandu' },
    sameAs: []
  });

  addJsonLd('arandu-website-jsonld', {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Arandu',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/pesquisa.html?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  });

  const breadcrumbItems = [{ '@type': 'ListItem', position: 1, name: 'Início', item: siteUrl }];
  if (pagePath !== 'index.html') {
    const pageName = document.querySelector('h1')?.textContent?.trim() || title.replace('— Arandu', '').trim();
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: pageName, item: `${siteUrl}${canonicalPath}` });
  }
  addJsonLd('arandu-breadcrumb-jsonld', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems
  });
})();
