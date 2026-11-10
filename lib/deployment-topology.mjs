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
  demo: Object.freeze({ vercelProject: 'arandu-demo', sourceRef: 'offgpyysgdhfemjlchod', sourceKind: 'pilot', status: 'SCHEMA_ALIGNED_PENDING_DEMO_RELEASE' }),
  production: Object.freeze({ vercelProject: 'arandu', sourceRef: 'igacnfjeuqhxcmfyepgj', sourceKind: 'legacy', status: 'SCHEMA_ALIGNED_PENDING_PRODUCTION_RELEASE' })
});
export const DECOMMISSION_TARGETS = Object.freeze(['arandu-pilot', 'pilot']);

// Prepara transição em memória, SEM mudar a atribuição operacional da Demo.
export function proposedDemoCutoverAssignments(assignments = ACTIVE_SUPABASE_ASSIGNMENTS) {
  const demoRef = CONSOLIDATION_TARGETS.demo.sourceRef;
  return { ...assignments, demo: [demoRef], pilot: (assignments.pilot || []).filter(ref => ref !== demoRef) };
}

// Nunca aceitar que um mesmo projeto pertença a dois ambientes.
export function supabaseAssignmentCollisionProblem(assignments = ACTIVE_SUPABASE_ASSIGNMENTS) {
  const seen = new Map();
  for (const [slot, refs] of Object.entries(assignments)) {
    if (!Array.isArray(refs)) return 'atribuição Supabase inválida em ' + slot;
    for (const ref of refs) {
      if (typeof ref !== 'string' || !/^[a-z0-9]{20}$/.test(ref)) return 'identidade Supabase inválida em ' + slot;
      if (seen.has(ref)) return 'Supabase ' + ref + ' atribuído simultaneamente a ' + seen.get(ref) + ' e ' + slot;
      seen.set(ref, slot);
    }
  }
  return null;
}


// Destino planejado e ref desconhecido nunca comprovam uma conversão.
// O argumento de atribuições permite testar o estado pós-cutover sem alterar
// a política ativa nem introduzir uma variável de bypass no ambiente.
export function permanentSupabaseAssignmentProblem(environment, ref, assignments = ACTIVE_SUPABASE_ASSIGNMENTS) {
  if (!PERMANENT_HOSTED_ENVIRONMENTS.includes(environment)) return null;
  const collision = supabaseAssignmentCollisionProblem(assignments);
  if (collision) return collision;
  if (!ref) return 'identidade Supabase não verificável para o ambiente permanente';
  if (!assignments[environment]?.includes(ref)) return `projeto Supabase sem atribuição ativa aprovada para ${environment}; concluir recuperação e cutover antes do deploy`;
  return null;
}
