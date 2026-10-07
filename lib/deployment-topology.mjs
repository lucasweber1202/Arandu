// Política de topologia: dois ambientes permanentes; Pilot é validação.
// Atribuição ativa é distinta do destino planejado. Não liberar seed/reset
// apenas porque um ref foi escolhido para conversão.
export const PERMANENT_HOSTED_ENVIRONMENTS = Object.freeze(['demo', 'production']);
export const TRANSITIONAL_ENVIRONMENTS = Object.freeze(['pilot']);
export const ACTIVE_SUPABASE_ASSIGNMENTS = Object.freeze({
  demo: Object.freeze([]), production: Object.freeze([]),
  pilot: Object.freeze(['offgpyysgdhfemjlchod']),
  legacy: Object.freeze(['igacnfjeuqhxcmfyepgj'])
});
export const CONSOLIDATION_TARGETS = Object.freeze({
  demo: Object.freeze({ vercelProject: 'arandu-demo', sourceRef: 'offgpyysgdhfemjlchod', sourceKind: 'pilot', status: 'PENDING_RECOVERY' }),
  production: Object.freeze({ vercelProject: 'arandu', sourceRef: 'igacnfjeuqhxcmfyepgj', sourceKind: 'legacy', status: 'PENDING_DATA_REVIEW' })
});
export const DECOMMISSION_TARGETS = Object.freeze(['arandu-pilot', 'pilot']);
