import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { sendJson } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

async function safeCount(path) {
  try {
    const data = await supabaseRequest(`${path}?select=id`, { method: 'GET', headers: { Prefer: '' } });
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });

  if (!hasSupabaseConfig()) {
    return sendJson(res, 202, { ok: true, mode: 'demo', issues: [], metrics: {}, message: 'Supabase não configurado. Auditoria pronta.' });
  }

  try {
    let issues = [];
    try {
      issues = await supabaseRequest('v_quality_issues?select=*&order=issue_type.asc', { method: 'GET', headers: { Prefer: '' } });
    } catch {
      issues = [];
    }

    const [artworks, publishedArtworks, artists, leads, proposals, reservations, openTasks, overdueTasks] = await Promise.all([
      safeCount('artworks'),
      safeCount('artworks?published=eq.true'),
      safeCount('artists'),
      safeCount('leads'),
      safeCount('proposals'),
      safeCount('reservations'),
      safeCount('tasks?status=in.(open,doing)'),
      safeCount('tasks?status=in.(open,doing)&due_at=lt.now()')
    ]);

    const grouped = (issues || []).reduce((acc, issue) => {
      acc[issue.issue_type] = (acc[issue.issue_type] || 0) + 1;
      return acc;
    }, {});

    return sendJson(res, 200, {
      ok: true,
      mode: 'supabase',
      score: Math.max(0, 100 - (issues || []).length * 5),
      metrics: { artworks, publishedArtworks, artists, leads, proposals, reservations, openTasks, overdueTasks },
      grouped,
      issues: issues || []
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro na auditoria.' });
  }
}
