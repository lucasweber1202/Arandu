export function createDashboardDomain(dependencies) {
  const { json, adminGuard, hasDataConfig, dataRequest, adminSupabaseCount, requireAdminPermission } = dependencies;

async function handleDashboard(req, res) {
  const guard = await adminGuard(req, res, 'dashboard', 'read');
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const metrics = { artworks: 0, artists: 0, leads: 0, certificates: 0, reservations: 0, proposals: 0, submissions: 0, briefs: 0, tasks: 0 };
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', metrics, pipeline: [] });
  const resources = {
    artworks: 'artworks?select=id',
    artists: 'artists?select=id',
    leads: 'leads?select=id',
    certificates: 'certificates?select=id',
    reservations: 'reservations?select=id',
    proposals: 'proposals?select=id',
    submissions: 'artist_submissions?select=id',
    briefs: 'company_briefs?select=id',
    tasks: 'tasks?select=id'
  };
  // PostgREST calcula os totais no servidor via Content-Range. O dashboard não
  // transfere mais todos os IDs só para executar Array.length no runtime.
  const entries = await Promise.all(
    Object.entries(resources).map(async ([key, resource]) => [key, await adminSupabaseCount(resource)])
  );
  let pipeline = [];
  try { pipeline = await dataRequest('v_sales_pipeline?select=source,id,name,status,created_at&order=created_at.desc&limit=8', { method: 'GET', headers: { Prefer: '' } }); } catch {}
  return json(res, 200, { ok: true, mode: 'supabase', metrics: Object.fromEntries(entries), pipeline: Array.isArray(pipeline) ? pipeline : [] });
}


/**
 * Auditoria operacional: o que impede uma obra, um artista ou um certificado
 * de ir ao ar, e o que passou do prazo.
 *
 * `painel-qualidade.html` chamava `/api/admin/quality`, uma rota que nunca
 * existiu — o painel respondia 404 e ficava vazio para sempre. As verificações
 * abaixo usam apenas colunas já existentes, filtradas no PostgREST: nenhuma
 * migration nova.
 */
const QUALITY_CHECKS = [
  {
    id: 'obra_sem_imagem',
    label: 'Obra publicada sem imagem principal',
    description: 'A obra aparece no acervo, mas não tem `main_image_url`.',
    resource: 'artworks?select=id,title&published=is.true&main_image_url=is.null&limit=50',
    name: (row) => row.title
  },
  {
    id: 'obra_sem_preco',
    label: 'Obra publicada sem preço',
    description: 'Nem `price` nem `price_label` preenchidos.',
    resource: 'artworks?select=id,title&published=is.true&price=is.null&price_label=is.null&limit=50',
    name: (row) => row.title
  },
  {
    id: 'obra_sem_artista',
    label: 'Obra sem artista vinculado',
    description: 'Sem `artist_id` a obra não tem autoria nem procedência.',
    resource: 'artworks?select=id,title&artist_id=is.null&limit=50',
    name: (row) => row.title
  },
  {
    id: 'obra_sem_autorizacao',
    label: 'Obra publicada sem autorização de imagem',
    description: 'Falta `image_authorized_at`: publicar sem isso é risco jurídico.',
    resource: 'artworks?select=id,title&published=is.true&image_authorized_at=is.null&limit=50',
    name: (row) => row.title
  },
  {
    id: 'artista_sem_perfil',
    label: 'Artista publicado sem perfil',
    description: 'Sem texto de perfil a página do artista fica vazia.',
    resource: 'artists?select=id,name&status=eq.published&profile=is.null&limit=50',
    name: (row) => row.name
  },
  {
    id: 'artista_sem_consentimento',
    label: 'Artista publicado sem consentimento registrado',
    description: 'Falta `publishing_consent_at`.',
    resource: 'artists?select=id,name&status=eq.published&publishing_consent_at=is.null&limit=50',
    name: (row) => row.name
  },
  {
    id: 'certificado_sem_obra',
    label: 'Certificado válido sem obra',
    description: 'Certificado marcado como válido e sem `artwork_id`.',
    resource: 'certificates?select=id,code&verification_status=eq.valid&artwork_id=is.null&limit=50',
    name: (row) => row.code
  },
  {
    id: 'submissao_parada',
    label: 'Submissão de artista sem resposta',
    description: 'Ainda em `received`: o artista está esperando retorno.',
    resource: 'artist_submissions?select=id,artist_name,name&status=eq.received&limit=50',
    name: (row) => row.artist_name || row.name
  },
  {
    id: 'lead_sem_contato',
    label: 'Lead sem contato',
    description: 'Ainda em `new`.',
    resource: 'leads?select=id,name&status=eq.new&limit=50',
    name: (row) => row.name
  }
];

async function handleQuality(req, res) {
  const guard = await adminGuard(req, res, 'diagnostics', 'read');
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  requireAdminPermission(guard.actor, 'diagnostics', 'read');
  if (!hasDataConfig()) {
    return json(res, 503, {
      ok: false,
      code: 'quality_unavailable',
      error: 'A auditoria depende do banco configurado. Sem Supabase, nada é verificado — e nada é inventado.'
    });
  }

  const now = new Date().toISOString();
  const issues = [];
  const failed = [];
  await Promise.all(QUALITY_CHECKS.map(async (check) => {
    try {
      const rows = await dataRequest(check.resource, { method: 'GET', headers: { Prefer: '' } });
      for (const row of Array.isArray(rows) ? rows : []) {
        issues.push({
          issue_type: check.id,
          label: check.name(row) || row.id,
          entity_id: row.id,
          description: check.description
        });
      }
    } catch {
      // Uma verificação que não roda é reportada como tal; ela não pode virar
      // silêncio e ser lida como "está tudo certo".
      failed.push(check.label);
    }
  }));

  let openTasks = 0;
  let overdueTasks = 0;
  try {
    openTasks = await adminSupabaseCount('tasks?select=id&status=in.(open,doing)');
    overdueTasks = await adminSupabaseCount(`tasks?select=id&status=in.(open,doing)&due_at=lt.${encodeURIComponent(now)}`);
  } catch {
    failed.push('Tarefas abertas e vencidas');
  }

  const checked = QUALITY_CHECKS.length - failed.length;
  // 100 quando não há pendência; cada pendência custa um ponto, com piso em 0.
  const score = Math.max(0, 100 - issues.length - overdueTasks * 2);
  return json(res, 200, {
    ok: true,
    mode: 'supabase',
    score,
    checkedAt: now,
    checks: { total: QUALITY_CHECKS.length, ran: checked, failed },
    metrics: { openTasks, overdueTasks },
    issues
  });
}

  return { handleDashboard, handleQuality };
}
