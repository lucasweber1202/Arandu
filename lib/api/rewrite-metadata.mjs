// vercel.json reescreve `/api/:aranduScope/:aranduRest+` para a função única e a
// Vercel ACRESCENTA as capturas à query original. Elas são transporte, não
// filtro de negócio: validadores estritos (CRM, Public API v1) as recusavam
// (400 invalid_crm no seed hospedado, run 44441567622; o mesmo valia para
// /api/v1/*, que respondia 400 invalid_query). Os nomes são reservados: quem
// os enviar por conta própria também os perde, e todo o resto continua sujeito
// às listas fechadas de cada domínio.
export const REWRITE_PARAMS = Object.freeze(['aranduScope', 'aranduRest']);

/** Remove só as capturas reservadas de um URLSearchParams (in place) e o devolve. */
export function withoutRewriteMetadata(params) {
  for (const name of REWRITE_PARAMS) params.delete(name);
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
