// References must be supplied by caller-JWT reads; never fetch privileged data here.
export function references({providers=[],contracts=[],members=[],entities=[]}={}) {
 const name=(rows,id,key,label,fallback)=>rows.find(r=>r[key]===id)?.[label]||fallback;
 return {
  provider:id=>name(providers,id,'id','name','Provedor indisponível'),
  contract:id=>name(contracts,id,'id','title','Contrato indisponível'),
  member:id=>name(members,id,'user_id','display_name','Membro indisponível'),
  entity:id=>id?name(entities,id,'id','legal_name','Entidade indisponível'):'Grupo'
 };
}
export function date(value) {
 if(!value)return 'Não informado';
 const s=String(value).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return 'Não informado';
 const d=new Date(`${s}T00:00:00Z`);
 return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s?'Não informado':d.toLocaleDateString('pt-BR',{timeZone:'UTC'});
}
export function money(value,currency) {
 if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return 'Indisponível';
 try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency,minimumFractionDigits:2}).format(Number(value));}catch{return 'Indisponível';}
}
const labels={credit:'Crédito',acquiring:'Adquirência',open:'Aberto',closed:'Encerrado',unreviewed:'Sem revisão',unverified:'Não verificado',confirmed:'Confirmado',verified:'Verificado',rejected:'Rejeitado',not_available:'Indisponível',declared:'Declarado',imported:'Importado',internal:'Fonte interna',contracted:'Contratado',observed:'Observado',estimated:'Estimado',percent:'%',days:'dias',count:'registros',ge:'≥',le:'≤',gt:'>',lt:'<',eq:'=',fin_spend_records:'Registro de spend',fin_fee_observations:'Tarifa observada',fin_fee_schedule_versions:'Tarifa contratada',fin_fee_schedules:'Tarifa contratada',fin_fee_variances:'Projeção da tarifa contratada'};
export const label=(v,fallback='Não informado')=>labels[v]||fallback;

export function sourceLine(value) {
 return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value||''))?'Registro de origem':value||'Não informada';
}
export function method(version) {
 const match=String(version||'').match(/^customer-methodology-v(\d+)$/);
 return match?`Método da empresa · versão ${match[1]}`:version==='internal-v1'?'Cálculo de fontes internas · versão 1':'Método indisponível';
}
export function facts(value={}) {
 const parts=[];
 if(value.methodology)parts.push(value.methodology);
 if(value.dimension_version)parts.push(`Versão da dimensão ${value.dimension_version}`);
 if(value.coverage_numerator!==undefined)parts.push(`Cobertura ${value.coverage_numerator}/${value.coverage_denominator??'não informada'}`);
 if(value.observed_at)parts.push(`Referência ${date(value.observed_at)}`);
 if(Array.isArray(value.source_ids))parts.push(`${value.source_ids.length} registros de origem`);
 if(value.qualification_records!==undefined)parts.push(`${value.qualification_records} registros de qualificação`);
 return parts.join(' · ')||'Evidência declarada na referência de origem';
}
