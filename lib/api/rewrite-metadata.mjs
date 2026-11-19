// vercel.json reescreve `/api/:aranduScope/:aranduRest+` para a função única e a
// Vercel ACRESCENTA as capturas à query original. Elas são transporte, não
// filtro de negócio: validadores estritos (CRM, Public API v1) as recusavam
// (400 invalid_crm no seed hospedado, run 44441567622; o mesmo valia para
// /api/v1/*, que respondia 400 invalid_query). Os nomes são reservados: quem
// os enviar por conta própria também os perde, e todo o resto continua sujeito
// às listas fechadas de cada domínio.
//
// Há uma terceira chave: depois do rewrite para /api/dispatch, a rota que a Vercel
// gera para o catch-all api/[...path].js (`^/api/([^/]+)$ -> /api/[...path]?...path=$1`,
// conferida com `vercel build`) acrescenta `...path=dispatch`. Faltava ela: o seed
// hospedado seguiu com 400 invalid_crm (run 44537446675). `path` sem reticências
// continua sendo um parâmetro desconhecido e recusado.
export const REWRITE_PARAMS = Object.freeze(['aranduScope', 'aranduRest']);
export const CATCH_ALL_PARAMS = Object.freeze(['...path']);
export const TRANSPORT_PARAMS = Object.freeze([...REWRITE_PARAMS, ...CATCH_ALL_PARAMS]);

/** Remove só as capturas reservadas de um URLSearchParams (in place) e o devolve. */
export function withoutRewriteMetadata(params) {
  for (const name of TRANSPORT_PARAMS) params.delete(name);
  return params;
}

/** Devolve req.url sem as capturas reservadas; caminho e demais parâmetros intactos. */
export function stripRewriteQuery(url) {
  const raw = String(url || '/');
  const at = raw.indexOf('?');
  if (at < 0) return raw;
  const params = withoutRewriteMetadata(new URLSearchParams(raw.slice(at + 1)));
  const rest = params.toString();
  return rest ? `${raw.slice(0, at)}?${rest}` : raw.slice(0, at);
}
