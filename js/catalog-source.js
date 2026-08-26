/* Fonte pública única do catálogo. Dados locais são apenas fixtures de desenvolvimento. */
(function () {
  class CatalogSourceError extends Error {
    // `ownMessage` separa o texto que a Arandu escreveu do texto que veio do
    // servidor. Só o nosso pode chegar ao visitante: a resposta de erro da API
    // fala de migration, de configuração e de Supabase, vocabulário interno que
    // não explica nada a quem veio comprar uma obra.
    constructor(message, code, status, ownMessage = true) {
      super(message);
      this.name = 'CatalogSourceError';
      this.code = code || 'catalog_unavailable';
      this.status = status || 0;
      this.ownMessage = ownMessage === true;
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
        response.status,
        !payload?.error
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

  function presentationEnabled() {
    return window.AranduPresentation?.enabled === true
      || document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true';
  }

  async function presentationRequest(path) {
    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new CatalogSourceError('Não foi possível carregar o acervo demonstrativo.', 'presentation_dataset_unavailable', response.status);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new CatalogSourceError('Dataset demonstrativo inválido.', 'invalid_presentation_dataset', response.status);
    return payload.map((item) => ({ ...item, dataset_kind: 'demonstration', presentation_only: true }));
  }

  const EM_VALIDACAO = new Set(['catalog_not_verified', 'catalog_migration_pending']);

  function message(error, subject = 'acervo') {
    if (EM_VALIDACAO.has(error?.code)) {
      return `O ${subject} está em validação curatorial e será exibido somente após a conferência dos dados e autorizações.`;
    }
    if (error?.status === 429) {
      return `Muitas consultas em pouco tempo. Espere um instante e recarregue a página.`;
    }
    if (error?.ownMessage && error?.message) return error.message;
    return `Não foi possível carregar o ${subject} agora. Recarregue a página em instantes ou fale com a curadoria.`;
  }

  // Um estado vazio honesto ainda precisa de saída. Enquanto o catálogo real não
  // é liberado, quem chega pela home ou por um link externo encontrava só
  // "Ver estado do serviço" — uma página de diagnóstico interno. Estas ações
  // existem de verdade hoje: submissão de portfólio e contato com a curadoria.
  function rescueActions(context = 'acervo') {
    const artist = context === 'artistas'
      ? '<a href="para-artistas.html#submissao">Sou artista: enviar portfólio</a>'
      : '<a href="para-artistas.html#submissao">Enviar portfólio</a>';
    return '<div class="arandu-rescue-actions"><a href="contato.html">Falar com a curadoria</a>'
      + artist + '</div>';
  }

  window.AranduCatalogSource = Object.freeze({
    CatalogSourceError,
    presentationEnabled,
    catalog: () => presentationEnabled() ? presentationRequest('/data/artworks.json') : request('/api/catalog'),
    artists: () => presentationEnabled() ? presentationRequest('/data/artists.json') : request('/api/artists'),
    message,
    rescueActions
  });
})();
