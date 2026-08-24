export function createPublicContentDomain(dependencies) {
  const { CONSENT_VERSION, HttpError, clean, cleanEmail, cleanPhone, escapeHtml, html, json, trueFlag, validEmail, consentVersionConfigured, validUrl, enforceRateLimit, publicDataRequest, firstRecord, pilotEnabled, createHash, hasPublicDataConfig } = dependencies;

function hashCertificate(certificate) { const raw = [certificate.code, certificate.artwork_id, certificate.artist_id, certificate.issued_to, certificate.issued_at].filter(Boolean).join('|'); return createHash('sha256').update(raw || certificate.code || 'arandu').digest('hex'); }

function certificateDocumentHtml(certificate, artwork) {
  const hash = certificate.certificate_hash || hashCertificate(certificate);
  const valid = certificate.verification_status === 'valid';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Certificado ${escapeHtml(certificate.code)} — Arandu</title><style>body{margin:0;background:#efe3d1;color:#211713;font-family:Arial,sans-serif}.sheet{max-width:900px;margin:40px auto;padding:56px;background:#fff8ed;border:1px solid #ad8a62;box-shadow:0 24px 80px rgba(33,23,19,.18)}.brand{font-family:Georgia,serif;font-size:44px;color:#7b1f17;margin:0}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:#7b1f17;font-weight:800}.title{font-family:Georgia,serif;font-size:32px;margin:24px 0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:32px 0}.box{border:1px solid rgba(111,34,27,.25);padding:18px;border-radius:18px;background:#f7ead9}.status{display:inline-block;padding:8px 12px;border-radius:999px;background:${valid ? '#173f31' : '#7b1f17'};color:#fff8ed;font-weight:800}.hash{font-family:monospace;word-break:break-all;font-size:12px}.actions{margin-top:28px}.actions button{padding:12px 18px;border-radius:999px;border:0;background:#7b1f17;color:#fff8ed;font-weight:800}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;border:0}.actions{display:none}}</style></head><body><main class="sheet"><p class="eyebrow">Certificado de autenticidade</p><h1 class="brand">Arandu</h1><h2 class="title">${escapeHtml(artwork?.title || certificate.artwork_id || 'Obra certificada')}</h2><p>Este documento registra a verificação curatorial e documental da obra no acervo Arandu.</p><span class="status">${valid ? 'Certificado válido' : escapeHtml(certificate.verification_status || 'Em análise')}</span><div class="grid"><section class="box"><p class="eyebrow">Código</p><h3>${escapeHtml(certificate.code)}</h3><p><strong>Obra:</strong> ${escapeHtml(artwork?.title || certificate.artwork_id || '—')}</p><p><strong>Artista:</strong> ${escapeHtml(artwork?.artist_name || certificate.artist_id || '—')}</p><p><strong>Técnica:</strong> ${escapeHtml(artwork?.technique || '—')}</p><p><strong>Dimensões:</strong> ${escapeHtml(artwork?.dimensions || '—')}</p></section><section class="box"><p class="eyebrow">Emissão</p><p><strong>Emitido para:</strong> ${escapeHtml(certificate.issued_to || 'Registro curatorial')}</p><p><strong>Data:</strong> ${certificate.issued_at ? escapeHtml(new Date(certificate.issued_at).toLocaleDateString('pt-BR')) : '—'}</p><p><strong>Status:</strong> ${escapeHtml(certificate.verification_status)}</p><p><strong>Hash:</strong></p><p class="hash">${escapeHtml(hash)}</p></section></div><section class="box"><p class="eyebrow">Notas</p><p>${escapeHtml(certificate.certificate_notes || 'Certificado vinculado à obra, ao artista e à verificação pública por código.')}</p></section><div class="actions"><button type="button" data-print-certificate>Imprimir / salvar PDF</button></div></main><script src="/js/certificate-print.js" defer></script></body></html>`;
}

const PUBLIC_CATALOG_SELECT = [
  'id','slug','title','artist_id','artist_name','artist_city','artist_region','artist_languages',
  'language','type','technique','support','year','dimensions','price','price_label','status',
  'edition','edition_size','certificate','thumb','main_image_url','detail_image_url','room_image_url',
  'recommended_for','tags','moods','spaces','search','summary','curatorial_reading','first_artwork',
  'logistics','created_at','updated_at'
].join(',');
const PUBLIC_ARTIST_SELECT = [
  'id','name','slug','city','state','region','languages','curatorial_axes','profile','trajectory',
  'statement','status','artist_level','image_url','studio_image_url','created_at','updated_at'
].join(',');

async function catalogReadiness() {
  if (!hasPublicDataConfig()) throw new HttpError(503, 'A leitura pública segura do Supabase ainda não foi configurada.', 'public_database_unconfigured');
  let row;
  try {
    row = firstRecord(await publicDataRequest('v_catalog_readiness?select=*&id=eq.production&limit=1'));
  } catch (error) {
    throw new HttpError(503, 'A migration de prontidão do catálogo ainda não foi aplicada.', 'catalog_migration_pending');
  }
  if (!row?.verified_ready) {
    throw new HttpError(503, 'O catálogo real ainda está em validação e não foi liberado para publicação.', 'catalog_not_verified');
  }
  return row;
}


async function handleCertificates(req, res) { if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' }); const url = new URL(req.url, 'http://localhost'); const code = clean(url.searchParams.get('code') || url.searchParams.get('id')).toUpperCase(); if (!code) return json(res, 400, { ok: false, error: 'Código obrigatório.' }); if (!/^[A-Z0-9-]{4,80}$/.test(code)) return json(res, 400, { ok: false, error: 'Código inválido.' }); await enforceRateLimit(req, 'certificate-read', 60, 10 * 60 * 1000); const rows = await publicDataRequest(`certificates?code=eq.${encodeURIComponent(code)}&verification_status=eq.valid&select=code,verification_status,artwork_id,artist_id,issued_at,certificate_hash,certificate_notes&limit=1`); return json(res, 200, { ok: true, mode: 'stored', certificate: firstRecord(rows) }); }
async function handleCertificateDocument(req, res) { if (req.method !== 'GET') return html(res, 405, '<h1>Método não permitido.</h1>'); const url = new URL(req.url, 'http://localhost'); const code = clean(url.searchParams.get('code')).toUpperCase(); if (!code) return html(res, 400, '<h1>Código obrigatório.</h1>'); if (!/^[A-Z0-9-]{4,80}$/.test(code)) return html(res, 400, '<h1>Código inválido.</h1>'); await enforceRateLimit(req, 'certificate-document', 30, 10 * 60 * 1000); const certificate = firstRecord(await publicDataRequest(`certificates?code=eq.${encodeURIComponent(code)}&verification_status=eq.valid&select=code,verification_status,artwork_id,artist_id,issued_to,issued_at,certificate_hash,certificate_notes&limit=1`)); if (!certificate) return html(res, 404, '<h1>Certificado não encontrado.</h1>'); const artwork = certificate.artwork_id ? firstRecord(await publicDataRequest(`v_public_catalog?id=eq.${encodeURIComponent(certificate.artwork_id)}&select=id,title,artist_name,technique,dimensions&limit=1`)) : null; return html(res, 200, certificateDocumentHtml(certificate, artwork)); }
async function handleCatalog(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const readiness = await catalogReadiness();
  const rows = await publicDataRequest(`v_public_catalog?select=${PUBLIC_CATALOG_SELECT}&order=created_at.desc`);
  return json(res, 200, { ok: true, mode: 'supabase', verifiedReady: true, release: readiness.dataset_version, items: rows || [] });
}
async function handleArtists(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const readiness = await catalogReadiness();
  const rows = await publicDataRequest(`v_public_artists?select=${PUBLIC_ARTIST_SELECT}&order=name.asc`);
  return json(res, 200, { ok: true, mode: 'supabase', verifiedReady: true, release: readiness.dataset_version, items: rows || [] });
}
// Um host sem ponto (`https://sua-url-da-vercel`, o placeholder do .env.example)
// atravessava a validação: `configured.domain` respondia true, o canonical e o
// redirect de recuperação de senha saíam apontando para um domínio inexistente.
// Domínio público de verdade tem rótulo e TLD alfabético.
function publicHostname(hostname) {
  return /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(String(hostname || ''));
}

function publicSiteUrl() {
  const candidate = clean(process.env.ARANDU_SITE_URL).replace(/\/$/, '');
  if (!validUrl(candidate)) return null;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || parsed.hostname.endsWith('.vercel.app') || parsed.hostname === 'localhost') return null;
  if (!publicHostname(parsed.hostname)) return null;
  return candidate;
}
async function handlePublicConfig(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const email = cleanEmail(process.env.ARANDU_CONTACT_EMAIL);
  const whatsappNumber = cleanPhone(process.env.ARANDU_WHATSAPP_NUMBER);
  const siteUrl = publicSiteUrl();
  const brandReady = trueFlag(process.env.ARANDU_BRAND_READY);
  const commercialReady = trueFlag(process.env.ARANDU_COMMERCIAL_READY);
  const isPilotEnabled = pilotEnabled();
  return json(res, 200, {
    ok: true,
    brand: { name: 'Arandu', ready: brandReady },
    pilot: { enabled: isPilotEnabled },
    consent: {
      configured: consentVersionConfigured(),
      version: consentVersionConfigured() ? CONSENT_VERSION : null
    },
    siteUrl,
    contact: {
      email: validEmail(email) ? email : null,
      whatsappNumber: whatsappNumber.length >= 12 ? whatsappNumber : null
    },
    configured: {
      domain: Boolean(siteUrl),
      contact: Boolean(validEmail(email) || whatsappNumber.length >= 12),
      brand: brandReady,
      commercial: commercialReady
    }
  });
}
async function handleSecurityText(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }
  const contact = clean(process.env.ARANDU_SECURITY_CONTACT);
  const expires = clean(process.env.ARANDU_SECURITY_EXPIRES);
  const expiresAt = Date.parse(expires);
  const mailto = contact.startsWith('mailto:') && validEmail(contact.slice(7));
  const https = contact.startsWith('https://') && validUrl(contact);
  if ((!mailto && !https) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }
  const canonical = publicSiteUrl();
  const body = [
    `Contact: ${contact}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    ...(canonical ? [`Canonical: ${canonical}/.well-known/security.txt`] : []),
    'Preferred-Languages: pt-BR, en',
    ''
  ].join('\n');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  return res.end(req.method === 'HEAD' ? undefined : body);
}

  return { handleSecurityText, handleCertificates, handleCertificateDocument, handleCatalog, handleArtists, handlePublicConfig, publicSiteUrl };
}
