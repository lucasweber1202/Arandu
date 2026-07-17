import { randomUUID } from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = String(process.env.ARANDU_WRITE_TEST_URL || process.env.ARANDU_SITE_URL || '').replace(/\/$/, '');
const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!SITE_URL) missing.push('ARANDU_WRITE_TEST_URL ou ARANDU_SITE_URL');
if (missing.length) {
  console.error(`Variáveis ausentes: ${missing.join(', ')}`);
  process.exit(1);
}

const marker = `sprint2-${randomUUID()}`;
const email = `canary+${marker}@example.invalid`;
let leadId = null;

async function database(resource, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase ${response.status}`);
  return data;
}

async function cleanup() {
  if (!leadId) return;
  await database(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: 'DELETE', prefer: 'return=minimal' });
  leadId = null;
}

try {
  console.log(`Testando gravação ponta a ponta em ${SITE_URL}.`);
  const response = await fetch(`${SITE_URL}/api/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Arandu-Canary': marker },
    body: JSON.stringify({
      type: 'sprint2-canary',
      page: 'scripts/test-supabase-write.mjs',
      data: { nome: 'Canário técnico Arandu', email, mensagem: marker }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.stored !== true || !payload?.record?.id) {
    throw new Error(payload?.error || `A API não confirmou a gravação (${response.status}).`);
  }
  leadId = payload.record.id;

  const rows = await database(`leads?id=eq.${encodeURIComponent(leadId)}&select=id,email,message&limit=1`);
  if (!Array.isArray(rows) || rows[0]?.email !== email || rows[0]?.message !== marker) {
    throw new Error('O registro gravado não pôde ser relido com o mesmo conteúdo.');
  }

  await cleanup();
  await database('catalog_releases?id=eq.production', {
    method: 'PATCH',
    body: JSON.stringify({ write_verified_at: new Date().toISOString(), write_verified_by: 'scripts/test-supabase-write.mjs' })
  });
  console.log('Gravação, releitura e limpeza concluídas; write_verified_at atualizado.');
} catch (error) {
  try { await cleanup(); } catch (cleanupError) { console.error(`Falha também na limpeza do canário ${leadId || marker}: ${cleanupError.message}`); }
  console.error(`Teste de escrita falhou: ${error.message}`);
  process.exit(1);
}
