import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { sendJson } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

const RESOURCE_PATH = {
  artworks: 'v_artworks_full?select=*',
  artists: 'artists?select=*',
  leads: 'leads?select=*',
  submissions: 'artist_submissions?select=*',
  briefs: 'company_briefs?select=*',
  proposals: 'proposals?select=*',
  reservations: 'reservations?select=*',
  certificates: 'certificates?select=*',
  tasks: 'tasks?select=*',
  notes: 'crm_notes?select=*',
  quality: 'v_quality_issues?select=*'
};

function toCsv(rows = []) {
  if (!rows.length) return '';
  const keys = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  return [keys.join(','), ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });

  const url = new URL(req.url, 'http://localhost');
  const resource = url.searchParams.get('resource') || 'artworks';
  const format = url.searchParams.get('format') || 'json';
  const path = RESOURCE_PATH[resource];

  if (!path) return sendJson(res, 400, { ok: false, error: 'Recurso de exportação inválido.' });
  if (!hasSupabaseConfig()) return sendJson(res, 202, { ok: true, mode: 'demo', resource, rows: [] });

  try {
    const rows = await supabaseRequest(`${path}&order=created_at.desc`, { method: 'GET', headers: { Prefer: '' } });
    if (format === 'csv') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="arandu-${resource}.csv"`);
      return res.end(toCsv(rows || []));
    }
    return sendJson(res, 200, { ok: true, resource, rows: rows || [] });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro na exportação.' });
  }
}
