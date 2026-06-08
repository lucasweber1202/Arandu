import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { readJsonBody, sendJson } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

const TABLES = {
  leads: 'leads',
  submissions: 'artist_submissions',
  briefs: 'company_briefs',
  newsletters: 'newsletter_subscriptions',
  selections: 'saved_selections'
};

function tableFromQuery(req) {
  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type') || 'leads';
  return TABLES[type] || 'leads';
}

function normalizePatch(table, body = {}) {
  const allowed = {
    leads: ['status', 'priority', 'message', 'payload'],
    artist_submissions: ['status', 'message', 'payload'],
    company_briefs: ['status', 'message', 'payload'],
    newsletter_subscriptions: ['status', 'payload'],
    saved_selections: ['status', 'notes', 'reading']
  };
  const out = {};
  for (const key of allowed[table] || []) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

async function listTable(table) {
  const selectMap = {
    leads: 'leads?select=*&order=created_at.desc',
    artist_submissions: 'artist_submissions?select=*&order=created_at.desc',
    company_briefs: 'company_briefs?select=*&order=created_at.desc',
    newsletter_subscriptions: 'newsletter_subscriptions?select=*&order=created_at.desc',
    saved_selections: 'saved_selections?select=*&order=created_at.desc'
  };
  return supabaseRequest(selectMap[table], { method: 'GET', headers: { Prefer: '' } });
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const table = tableFromQuery(req);

  if (!hasSupabaseConfig()) {
    return sendJson(res, 202, { ok: true, mode: 'demo', table, items: [], message: 'Supabase não configurado. Rota CRM pronta.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await listTable(table);
      return sendJson(res, 200, { ok: true, table, items: data || [] });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.id) return sendJson(res, 400, { ok: false, error: 'ID é obrigatório para atualizar.' });
      const patch = normalizePatch(table, body);
      const data = await supabaseRequest(`${table}?id=eq.${encodeURIComponent(body.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      return sendJson(res, 200, { ok: true, table, item: Array.isArray(data) ? data[0] : data });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro no CRM.' });
  }
}
