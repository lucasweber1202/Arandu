const PLACEHOLDER = /(?:^|\.)(?:example\.com|example|localhost)$/i;

export function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const match = url.hostname.match(/^([a-z0-9]{8,})\.supabase\.co$/i);
    return url.protocol === 'https:' ? match?.[1]?.toLowerCase() || null : null;
  } catch { return null; }
}

export function databaseHost(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return null; }
}

export function inspectStagingEnvironment(env = process.env) {
  const problems = [];
  let site = null;
  try { site = new URL(String(env.ARANDU_STAGING_SITE_URL || '')); } catch {}
  if (!site || site.protocol !== 'https:' || PLACEHOLDER.test(site.hostname)) {
    problems.push('ARANDU_STAGING_SITE_URL deve ser uma origem HTTPS real, sem placeholder.');
  }

  const expectedRef = String(env.ARANDU_STAGING_PROJECT_REF || '').trim().toLowerCase();
  const productionRef = String(env.ARANDU_PRODUCTION_PROJECT_REF || '').trim().toLowerCase();
  const publicRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);
  const dbHost = databaseHost(env.ARANDU_STAGING_DATABASE_URL);
  if (!/^[a-z0-9]{8,}$/.test(expectedRef)) problems.push('ARANDU_STAGING_PROJECT_REF inválido ou ausente.');
  if (productionRef && productionRef === expectedRef) problems.push('Projeto de staging coincide com o projeto de produção.');
  if (!publicRef || publicRef !== expectedRef) problems.push('SUPABASE_URL não corresponde ao projeto de staging declarado.');
  if (!dbHost || !dbHost.includes(expectedRef)) problems.push('ARANDU_STAGING_DATABASE_URL não corresponde ao projeto de staging declarado.');
  if (!String(env.ARANDU_STAGING_DATABASE_URL || '').startsWith('postgres')) problems.push('ARANDU_STAGING_DATABASE_URL inválida.');
  if (!String(env.ARANDU_WRITE_TEST_URL || '').startsWith(`${site?.origin || 'invalid'}/`)) {
    problems.push('ARANDU_WRITE_TEST_URL deve pertencer à origem de staging.');
  }
  return {
    ok: problems.length === 0,
    problems,
    summary: { siteHttps: site?.protocol === 'https:', projectRefMatched: Boolean(publicRef && publicRef === expectedRef), databaseMatched: Boolean(dbHost && expectedRef && dbHost.includes(expectedRef)), productionSeparated: !productionRef || productionRef !== expectedRef }
  };
}
