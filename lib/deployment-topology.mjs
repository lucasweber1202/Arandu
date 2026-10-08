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

// Destino planejado e ref desconhecido nunca comprovam uma conversão.
// O argumento de atribuições permite testar o estado pós-cutover sem alterar
// a política ativa nem introduzir uma variável de bypass no ambiente.
export function permanentSupabaseAssignmentProblem(environment, ref, assignments = ACTIVE_SUPABASE_ASSIGNMENTS) {
  if (!PERMANENT_HOSTED_ENVIRONMENTS.includes(environment)) return null;
  if (!ref) return 'identidade Supabase não verificável para o ambiente permanente';
  if (!assignments[environment]?.includes(ref)) return `projeto Supabase sem atribuição ativa aprovada para ${environment}; concluir recuperação e cutover antes do deploy`;
  return null;
}
