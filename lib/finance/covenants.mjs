export const OBLIGATION_KINDS=Object.freeze({financial_covenant:'Covenant financeiro',reporting_covenant:'Covenant de reporte',information_obligation:'Obrigação de informação',contractual_deadline:'Prazo contratual',operational_obligation:'Obrigação operacional',document_delivery:'Entrega de documento'});
export const OBLIGATION_STATES=Object.freeze({not_due:'Ainda não devido',due_soon:'Prazo próximo',awaiting_data:'Aguardando dados',under_review:'Em revisão',compliant:'Conforme após revisão',non_compliant:'Não conforme após revisão',waived:'Waiver vigente',not_applicable:'Não aplicável'});
export const OPERATORS=Object.freeze({lt:'<',le:'≤',eq:'=',ge:'≥',gt:'>'});
// PostgreSQL is authoritative. Decimal text preserves precision in presentation/tests.
function decimal(value){
 if(value===null || value===undefined || value==='')return null;
 if(typeof value==='number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)))return null;
 const m=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(value));if(!m || m[2].length>40 || (m[3]?.length || 0)>30)return null;
 const scale=m[3]?.length || 0,coefficient=BigInt(m[2]+(m[3] || ''))*(m[1]==='-'?-1n:1n);
 if(coefficient>10n**BigInt(18+scale) || coefficient<-(10n**BigInt(18+scale)))return null;
 return {coefficient,scale};
}
export function covenantComparison(value,operator,threshold){
 const v=decimal(value),t=decimal(threshold);if(!v || !t)return null;
 const scale=Math.max(v.scale,t.scale),a=v.coefficient*10n**BigInt(scale-v.scale),b=t.coefficient*10n**BigInt(scale-t.scale);
 return ({lt:()=>a<b,le:()=>a<=b,eq:()=>a===b,ge:()=>a>=b,gt:()=>a>b})[operator]?.() ?? null;
}
export function reviewChoices(facts){return [['under_review','Em revisão'],...(facts.has_data?(facts.metric?[facts.factual_result===true?['compliant','Conforme com evidência']:['non_compliant','Não conforme com evidência']]:[['compliant','Conforme com evidência'],['non_compliant','Não conforme com evidência']]):[]),['not_applicable','Não aplicável com justificativa']];}
