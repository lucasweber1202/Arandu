export function createAccountsDomain(dependencies) {
  const { ACCOUNT_CAPABILITIES, artistPortalArtist, artistPortalArtwork, companyPortalBrief, declaredProfileType, requireCapability, resolveCapabilities, ARTIST_PORTAL_ARTWORK_FIELDS, COMPANY_PORTAL_BRIEF_FIELDS, clean, json, readBody, accountReservation, accountSelection, userSupabaseRequest, adminSupabaseRpc, requireAdminPermission, requireDataConfig, dataRequest, firstRecord, requireUser, adminGuard, writeAudit } = dependencies;

async function handleAccount(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const session = await requireUser(req);
  requireDataConfig();

  const userId = encodeURIComponent(session.user.id);
  const [selectionRows, reservationRows] = await Promise.all([
    userSupabaseRequest(session.accessToken, `saved_selections?user_id=eq.${userId}&select=id,public_token,status,items,briefing,created_at,updated_at&order=updated_at.desc&limit=20`, { method: 'GET', prefer: '' }),
    userSupabaseRequest(session.accessToken, `reservations?user_id=eq.${userId}&select=id,artwork_id,status,deadline,notes,expires_at,created_at,updated_at&order=created_at.desc&limit=20`, { method: 'GET', prefer: '' })
  ]);
  const selections = Array.isArray(selectionRows) ? selectionRows.map(accountSelection).filter(Boolean) : [];
  const reservations = Array.isArray(reservationRows) ? reservationRows.map(accountReservation).filter(Boolean) : [];
  const access = await resolveAccountAccess(session);
  return json(res, 200, {
    ok: true,
    mode: 'supabase',
    user: session.user,
    declaredProfileType: access.declaredProfileType,
    capabilities: access.capabilities,
    metrics: { selections: selections.length, reservations: reservations.length },
    selections,
    reservations
  }, session.headers);
}

// Capacidades da conta a partir de fatos do banco. `profile_type` do
// user_metadata é declaração da própria pessoa e nunca entra nesta decisão.
async function resolveAccountAccess(session) {
  const userId = encodeURIComponent(session.user.id);
  const [linkRows, briefRows] = await Promise.all([
    userSupabaseRequest(
      session.accessToken,
      `artist_accounts?user_id=eq.${userId}&status=eq.active&select=artist_id,status,linked_at&limit=1`,
      { method: 'GET', prefer: '' }
    ).catch(() => []),
    userSupabaseRequest(
      session.accessToken,
      `company_briefs?user_id=eq.${userId}&select=id&limit=1`,
      { method: 'GET', prefer: '' }
    ).catch(() => [])
  ]);
  const resolved = resolveCapabilities({
    artistLink: firstRecord(linkRows),
    companyBriefCount: Array.isArray(briefRows) ? briefRows.length : 0
  });
  return {
    ...resolved,
    declaredProfileType: declaredProfileType(session.user)
  };
}

async function handlePortal(req, res, area) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const session = await requireUser(req);
  requireDataConfig();
  const access = await resolveAccountAccess(session);

  if (area === 'artist') {
    requireCapability(access, ACCOUNT_CAPABILITIES.ARTIST_PORTAL);
    const artistId = access.artistId;
    // A propriedade já foi verificada no vínculo; a leitura usa service role
    // porque obras não são legíveis por RLS de comprador.
    const [artistRows, artworkRows, trailRows] = await Promise.all([
      dataRequest(`artists?id=eq.${encodeURIComponent(artistId)}&select=*&limit=1`, { method: 'GET', headers: { Prefer: '' } }),
      dataRequest(
        `artworks?artist_id=eq.${encodeURIComponent(artistId)}&select=${ARTIST_PORTAL_ARTWORK_FIELDS.join(',')}&order=updated_at.desc&limit=100`,
        { method: 'GET', headers: { Prefer: '' } }
      ),
      dataRequest(
        `operational_status_history?entity_type=eq.artist&entity_id=eq.${encodeURIComponent(artistId)}&select=from_status,to_status,created_at&order=created_at.desc&limit=20`,
        { method: 'GET', headers: { Prefer: '' } }
      ).catch(() => [])
    ]);
    const artist = artistPortalArtist(firstRecord(artistRows));
    if (!artist) return json(res, 404, { ok: false, error: 'Artista vinculado não encontrado.' }, session.headers);
    const artworks = (Array.isArray(artworkRows) ? artworkRows : []).map(artistPortalArtwork).filter(Boolean);
    return json(res, 200, {
      ok: true,
      mode: 'supabase',
      capabilities: access.capabilities,
      artist,
      artworks,
      statusTrail: Array.isArray(trailRows) ? trailRows : [],
      metrics: {
        artworks: artworks.length,
        published: artworks.filter((artwork) => artwork.status === 'available').length
      }
    }, session.headers);
  }

  if (area === 'company') {
    requireCapability(access, ACCOUNT_CAPABILITIES.COMPANY_PORTAL);
    const userId = encodeURIComponent(session.user.id);
    const briefRows = await userSupabaseRequest(
      session.accessToken,
      `company_briefs?user_id=eq.${userId}&select=${COMPANY_PORTAL_BRIEF_FIELDS.join(',')}&order=created_at.desc&limit=50`,
      { method: 'GET', prefer: '' }
    );
    const briefs = (Array.isArray(briefRows) ? briefRows : []).map(companyPortalBrief).filter(Boolean);
    return json(res, 200, {
      ok: true,
      mode: 'supabase',
      capabilities: access.capabilities,
      briefs,
      metrics: { briefs: briefs.length }
    }, session.headers);
  }

  return json(res, 404, { ok: false, error: 'Área de portal não encontrada.' }, session.headers);
}

async function handleArtistAccounts(req, res) {
  const guard = await adminGuard(req, res);
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });

  if (req.method === 'GET') {
    requireAdminPermission(guard.actor, 'artists', 'read');
    const rows = await dataRequest(
      'artist_accounts?select=*&order=created_at.desc&limit=200',
      { method: 'GET', headers: { Prefer: '' } }
    );
    return json(res, 200, { ok: true, mode: 'stored', items: rows || [] });
  }

  if (req.method === 'POST') {
    requireAdminPermission(guard.actor, 'artists', 'review');
    const body = await readBody(req);
    const userId = clean(body.user_id || body.userId);
    const artistId = clean(body.artist_id || body.artistId);
    if (!userId || !artistId) return json(res, 400, { ok: false, error: 'Conta e artista são obrigatórios.' });
    const result = firstRecord(await adminSupabaseRpc('link_artist_account_atomic', {
      p_user_id: userId,
      p_artist_id: artistId,
      p_actor_ref: guard.actor.id,
      p_actor_role: guard.actor.role,
      p_request_id: req.aranduRequestId
    }));
    await writeAudit({
      actorType: 'admin',
      actorRef: guard.actor.id,
      action: 'artist_account.link',
      entityType: 'artist',
      entityId: artistId
    });
    return json(res, 201, result || { ok: true, stored: true });
  }

  if (req.method === 'DELETE') {
    requireAdminPermission(guard.actor, 'artists', 'review');
    const body = await readBody(req);
    const userId = clean(body.user_id || body.userId);
    if (!userId) return json(res, 400, { ok: false, error: 'Conta obrigatória.' });
    const result = firstRecord(await adminSupabaseRpc('revoke_artist_account_atomic', {
      p_user_id: userId,
      p_actor_ref: guard.actor.id,
      p_actor_role: guard.actor.role,
      p_request_id: req.aranduRequestId
    }));
    await writeAudit({
      actorType: 'admin',
      actorRef: guard.actor.id,
      action: 'artist_account.revoke',
      entityType: 'user',
      entityId: userId
    });
    return json(res, 200, result || { ok: true, stored: true });
  }

  return json(res, 405, { ok: false, error: 'Método não permitido.' });
}


  return { handleAccount, handlePortal, handleArtistAccounts };
}
