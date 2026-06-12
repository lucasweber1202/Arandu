import { createHash } from 'node:crypto';
import { dataRequest, firstRecord, hasDataConfig } from './_arandu.js';

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function hashCertificate(certificate) {
  const raw = [certificate.code, certificate.artwork_id, certificate.artist_id, certificate.issued_to, certificate.issued_at].filter(Boolean).join('|');
  return createHash('sha256').update(raw || certificate.code || 'arandu').digest('hex');
}

function documentHtml(certificate, artwork) {
  const hash = certificate.certificate_hash || hashCertificate(certificate);
  const valid = certificate.verification_status === 'valid';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Certificado ${escapeHtml(certificate.code)} — Arandu</title><style>body{margin:0;background:#efe3d1;color:#211713;font-family:Arial,sans-serif}.sheet{max-width:900px;margin:40px auto;padding:56px;background:#fff8ed;border:1px solid #ad8a62;box-shadow:0 24px 80px rgba(33,23,19,.18)}.brand{font-family:Georgia,serif;font-size:44px;color:#7b1f17;margin:0}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:#7b1f17;font-weight:800}.title{font-family:Georgia,serif;font-size:32px;margin:24px 0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:32px 0}.box{border:1px solid rgba(111,34,27,.25);padding:18px;border-radius:18px;background:#f7ead9}.status{display:inline-block;padding:8px 12px;border-radius:999px;background:${valid ? '#173f31' : '#7b1f17'};color:#fff8ed;font-weight:800}.hash{font-family:monospace;word-break:break-all;font-size:12px}.actions{margin-top:28px}.actions button{padding:12px 18px;border-radius:999px;border:0;background:#7b1f17;color:#fff8ed;font-weight:800}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;border:0}.actions{display:none}}</style></head><body><main class="sheet"><p class="eyebrow">Certificado de autenticidade</p><h1 class="brand">Arandu</h1><h2 class="title">${escapeHtml(artwork?.title || certificate.artwork_id || 'Obra certificada')}</h2><p>Este documento registra a verificação curatorial e documental da obra no acervo Arandu.</p><span class="status">${valid ? 'Certificado válido' : escapeHtml(certificate.verification_status || 'Em análise')}</span><div class="grid"><section class="box"><p class="eyebrow">Código</p><h3>${escapeHtml(certificate.code)}</h3><p><strong>Obra:</strong> ${escapeHtml(artwork?.title || certificate.artwork_id || '—')}</p><p><strong>Artista:</strong> ${escapeHtml(artwork?.artist_name || certificate.artist_id || '—')}</p><p><strong>Técnica:</strong> ${escapeHtml(artwork?.technique || '—')}</p><p><strong>Dimensões:</strong> ${escapeHtml(artwork?.dimensions || '—')}</p></section><section class="box"><p class="eyebrow">Emissão</p><p><strong>Emitido para:</strong> ${escapeHtml(certificate.issued_to || 'Registro curatorial')}</p><p><strong>Data:</strong> ${certificate.issued_at ? escapeHtml(new Date(certificate.issued_at).toLocaleDateString('pt-BR')) : '—'}</p><p><strong>Status:</strong> ${escapeHtml(certificate.verification_status)}</p><p><strong>Hash:</strong></p><p class="hash">${escapeHtml(hash)}</p></section></div><section class="box"><p class="eyebrow">Notas</p><p>${escapeHtml(certificate.certificate_notes || 'Certificado vinculado à obra, ao artista e à verificação pública por código.')}</p></section><div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div></main></body></html>`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return html(res, 405, '<h1>Método não permitido.</h1>');
    const url = new URL(req.url, 'http://localhost');
    const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
    if (!code) return html(res, 400, '<h1>Código obrigatório.</h1>');
    if (!hasDataConfig()) return html(res, 202, `<h1>Certificado ${escapeHtml(code)}</h1><p>Banco ainda não configurado.</p>`);

    const certificate = firstRecord(await dataRequest(`certificates?code=eq.${encodeURIComponent(code)}&select=*&limit=1`, { method: 'GET', headers: { Prefer: '' } }));
    if (!certificate) return html(res, 404, '<h1>Certificado não encontrado.</h1>');
    const artwork = certificate.artwork_id ? firstRecord(await dataRequest(`v_artworks_full?id=eq.${encodeURIComponent(certificate.artwork_id)}&select=*&limit=1`, { method: 'GET', headers: { Prefer: '' } })) : null;
    return html(res, 200, documentHtml(certificate, artwork));
  } catch (error) {
    return html(res, 500, `<h1>Erro ao gerar certificado</h1><p>${escapeHtml(error.message)}</p>`);
  }
}
