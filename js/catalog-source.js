/* Fonte pública única do catálogo. Dados locais são apenas fixtures de desenvolvimento. */
(function () {
  class CatalogSourceError extends Error {
    constructor(message, code, status) {
      super(message);
      this.name = 'CatalogSourceError';
      this.code = code || 'catalog_unavailable';
      this.status = status || 0;
    }
  }

  async function request(path) {
    let response;
    try {
      response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
    } catch {
      throw new CatalogSourceError('O acervo está temporariamente indisponível. Tente novamente em instantes.', 'network_error');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new CatalogSourceError(
        payload?.error || 'O acervo está temporariamente indisponível.',
        payload?.code || 'catalog_unavailable',
        response.status
      );
    }
    if (payload?.verifiedReady !== true) {
      throw new CatalogSourceError('O catálogo real ainda está em validação.', 'catalog_not_verified', response.status);
    }
    if (!Array.isArray(payload.items)) {
      throw new CatalogSourceError('A resposta do catálogo é inválida.', 'invalid_catalog_response', response.status);
    }
    return payload.items;
  }

  function message(error, subject = 'acervo') {
    if (error?.code === 'catalog_not_verified' || error?.code === 'catalog_migration_pending') {
      return `O ${subject} está em validação curatorial e será exibido somente após a conferência dos dados e autorizações.`;
    }
    return error?.message || `Não foi possível carregar o ${subject} agora.`;
  }

  window.AranduCatalogSource = Object.freeze({
    CatalogSourceError,
    catalog: () => request('/api/catalog'),
    artists: () => request('/api/artists'),
    message
  });
})();
