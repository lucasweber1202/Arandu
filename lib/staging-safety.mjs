const PLACEHOLDER = /(?:^|\.)(?:example(?:\.com)?|invalid|localhost|test)$/i;

function safeUrl(value, protocols) {
  try {
    const url = new URL(String(value || ''));
    if (!protocols.has(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

export function projectRefFromSupabaseUrl(value) {
  const url = safeUrl(value, new Set(['https:']));
  const match = url?.hostname.match(/^([a-z0-9]{8,})\.supabase\.co$/i);
  return match?.[1]?.toLowerCase() || null;
}

export function projectRefFromDatabaseUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return null; }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) return null;
  const direct = url.hostname.match(/^db\.([a-z0-9]{8,})\.supabase\.co$/i);
  if (direct) return direct[1].toLowerCase();
  if (!/(?:^|\.)pooler\.supabase\.com$/i.test(url.hostname)) return null;
  const pooled = decodeURIComponent(url.username || '').match(/^postgres\.([a-z0-9]{8,})$/i);
  return pooled?.[1]?.toLowerCase() || null;
}

export function inspectStagingEnvironment(env = process.env) {
  const problems = [];
  const site = safeUrl(env.ARANDU_STAGING_SITE_URL, new Set(['https:']));
  const productionSite = safeUrl(env.ARANDU_PRODUCTION_SITE_URL, new Set(['https:']));
  if (!site || PLACEHOLDER.test(site.hostname)) {
    problems.push('ARANDU_STAGING_SITE_URL deve ser uma origem HTTPS real, sem placeholder.');
  }
  if (!productionSite || PLACEHOLDER.test(productionSite.hostname)) {
    problems.push('ARANDU_PRODUCTION_SITE_URL deve declarar a origem HTTPS real de produção.');
  } else if (site?.origin === productionSite.origin) {
    problems.push('Origem de staging coincide com a origem de produção.');
  }

  const expectedRef = String(env.ARANDU_STAGING_PROJECT_REF || '').trim().toLowerCase();
  const productionRef = String(env.ARANDU_PRODUCTION_PROJECT_REF || '').trim().toLowerCase();
  const publicRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);
  const databaseRef = projectRefFromDatabaseUrl(env.ARANDU_STAGING_DATABASE_URL);
  if (!/^[a-z0-9]{8,}$/.test(expectedRef)) problems.push('ARANDU_STAGING_PROJECT_REF inválido ou ausente.');
  if (!/^[a-z0-9]{8,}$/.test(productionRef)) problems.push('ARANDU_PRODUCTION_PROJECT_REF inválido ou ausente.');
  if (productionRef && productionRef === expectedRef) problems.push('Projeto de staging coincide com o projeto de produção.');
  if (!publicRef || publicRef !== expectedRef) problems.push('SUPABASE_URL não corresponde ao projeto de staging declarado.');
  if (!databaseRef || databaseRef !== expectedRef) problems.push('ARANDU_STAGING_DATABASE_URL não corresponde exatamente ao projeto de staging declarado.');
  const writeUrl = safeUrl(env.ARANDU_WRITE_TEST_URL, new Set(['https:']));
  if (!writeUrl || writeUrl.origin !== site?.origin || !writeUrl.pathname.startsWith('/api/')) {
    problems.push('ARANDU_WRITE_TEST_URL deve pertencer à origem de staging.');
  }
  return {
    ok: problems.length === 0,
    problems,
    summary: {
      siteHttps: site?.protocol === 'https:',
      siteSeparated: Boolean(site && productionSite && site.origin !== productionSite.origin),
      projectRefMatched: Boolean(publicRef && publicRef === expectedRef),
      databaseMatched: Boolean(databaseRef && databaseRef === expectedRef),
      productionSeparated: Boolean(productionRef && productionRef !== expectedRef),
      writeCanaryScoped: Boolean(writeUrl && site && writeUrl.origin === site.origin && writeUrl.pathname.startsWith('/api/'))
    }
  };
}
