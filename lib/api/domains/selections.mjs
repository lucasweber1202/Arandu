export function createSelectionsDomain(dependencies) {
  const { HttpError, json, limited, readBody, validEmail, accountSelection, normalizeSelection, publicSelection, requireDataConfig, enforceRateLimit, dataRequest, firstRecord, optionalUser, requireUser } = dependencies;

async function handleSelections(req, res) {
  requireDataConfig();
  if (req.method === 'GET') {
    await enforceRateLimit(req, 'selection-read', 120, 10 * 60 * 1000);
    const url = new URL(req.url, 'http://localhost');
    const token = limited(url.searchParams.get('token') || url.searchParams.get('id'), 128);
    if (!/^[A-Za-z0-9_-]{12,128}$/.test(token)) throw new HttpError(400, 'Token de seleção inválido.');
    const rows = await dataRequest(`saved_selections?public_token=eq.${encodeURIComponent(token)}&status=in.(open,sent,reviewed)&select=public_token,status,items,briefing,created_at,updated_at&limit=1`, { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, { ok: true, mode: 'stored', selection: publicSelection(firstRecord(rows)) });
  }

  if (req.method === 'POST') {
    await enforceRateLimit(req, 'selection-write', 40, 10 * 60 * 1000);
    const body = await readBody(req);
    const record = normalizeSelection(body);
    if (!record.items.length) throw new HttpError(400, 'Seleção sem obras.');
    if (record.email && !validEmail(record.email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const { session, user } = await optionalUser(req);
    if (user) {
      record.user_id = user.id;
      record.name = record.name || user.full_name;
      record.email = record.email || user.email;
      record.status = 'open';
    } else {
      record.status = 'sent';
    }


    let saved = null;
    if (user) {
      const existing = firstRecord(await dataRequest(`saved_selections?user_id=eq.${encodeURIComponent(user.id)}&status=eq.open&select=id,public_token&order=updated_at.desc&limit=1`, { method: 'GET', headers: { Prefer: '' } }));
      if (existing?.id) {
        saved = firstRecord(await dataRequest(`saved_selections?id=eq.${encodeURIComponent(existing.id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...record, updated_at: new Date().toISOString() })
        }));
      }
    }
    if (!saved) saved = firstRecord(await dataRequest('saved_selections', { method: 'POST', body: JSON.stringify(record) }));

    return json(res, 201, {
      ok: true,
      mode: 'stored',
      stored: true,
      selection: user ? accountSelection(saved) : publicSelection(saved)
    }, session.headers);
  }

  if (req.method === 'DELETE') {
    await enforceRateLimit(req, 'selection-delete', 20, 10 * 60 * 1000);
    const session = await requireUser(req);
    const rows = await dataRequest(`saved_selections?user_id=eq.${encodeURIComponent(session.user.id)}&status=eq.open`, {
      method: 'DELETE'
    });
    return json(res, 200, {
      ok: true,
      mode: 'stored',
      deleted: Array.isArray(rows) ? rows.length : 0
    }, session.headers);
  }

  return json(res, 405, { ok: false, error: 'Método não permitido.' });
}


  return { handleSelections };
}
