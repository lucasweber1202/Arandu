// Primeiro valor por objetivo (Guideline v3.3 §35.10, v3.7 buyer-first).
//
// A pessoa escolhe o que quer conseguir — registrar um contrato vigente,
// acompanhar um relacionamento financeiro ou iniciar uma solicitação de
// propostas — e vê os passos desse objetivo com o estado que o SERVIDOR
// comprova. Regras:
//  - "concluído" só quando a lista carregada do servidor prova o fato;
//  - lista ausente/ilegível => "não verificado", nunca "concluído" nem "pendente";
//  - nenhum passo depende de uma instituição ter conta no Arandu;
//  - o próximo passo é o primeiro não comprovado, com o caminho do fluxo que já
//    existe (nada é duplicado) e só é oferecido como ação a quem tem permissão.
// Função pura: testada em scripts/test-finance-first-value.mjs.

export const FIRST_VALUE_GOALS = Object.freeze([
  { key: 'contract', label: 'Acompanhar um contrato vigente', detail: 'Vencimento, aviso prévio e próxima ação de um contrato que a empresa já tem.' },
  { key: 'relationship', label: 'Organizar o relacionamento com uma instituição', detail: 'Contratos, contatos e pendências de um banco ou adquirente num só lugar.' },
  { key: 'rfq', label: 'Pedir propostas comparáveis', detail: 'Uma solicitação de crédito ou adquirência, com convites e respostas no mesmo formato.' }
]);

const LIVE = new Set(['active', 'renewing']);
const list = (value) => (Array.isArray(value) ? value : null);

/** Estado comprovado por uma lista: done/todo, ou unknown quando a lista não veio. */
function proven(value, predicate) {
  const rows = list(value);
  if (!rows) return 'unknown';
  return rows.some(predicate) ? 'done' : 'todo';
}

/**
 * facts: { organization, providers, contracts, rfqs, tasks } como vieram do
 * servidor (qualquer um pode faltar). Devolve os passos do objetivo.
 */
export function firstValueSteps(goal, facts = {}) {
  const { organization, providers, contracts, rfqs, tasks } = facts;
  const institution = { key: 'institution', title: 'Cadastre a instituição', detail: 'Banco, fintech ou adquirente com quem a empresa trabalha. A instituição não precisa ter conta no Arandu.',
    path: '/finance/providers.html?acao=cadastrar-instituicao', permission: 'create_rfq', state: proven(providers, () => true) };
  if (goal === 'contract') {
    const liveContracts = list(contracts)?.filter((row) => LIVE.has(row.status)) ?? null;
    const dated = (row) => Boolean(row.ends_on);
    const contractIds = new Set((liveContracts || []).map((row) => row.id));
    return [
      institution,
      { key: 'contract', title: 'Registre o contrato vigente', detail: 'Instituição, produto, vigência e condições principais, com o documento de suporte se houver.',
        path: '/finance/contracts.html?acao=registrar-contrato', permission: 'create_rfq', state: liveContracts === null ? 'unknown' : liveContracts.length ? 'done' : 'todo' },
      { key: 'dates', title: 'Informe o vencimento', detail: 'Com a data de término, o Arandu calcula aviso prévio e abre a janela de renovação no prazo.',
        path: '/finance/contracts.html', permission: 'create_rfq', state: liveContracts === null ? 'unknown' : liveContracts.some(dated) ? 'done' : 'todo' },
      { key: 'owner', title: 'Defina quem cuida da próxima ação', detail: 'Uma tarefa ligada ao contrato, com responsável e prazo.',
        path: '/finance/tasks.html', permission: 'create_rfq',
        state: liveContracts === null || !list(tasks) ? 'unknown' : tasks.some((task) => task.related_type === 'contract' && contractIds.has(task.related_id) && task.assignee_id) ? 'done' : 'todo' }
    ];
  }
  if (goal === 'relationship') {
    const providerIds = new Set((list(providers) || []).map((row) => row.id));
    const linked = (row) => row.provider_id && providerIds.has(row.provider_id);
    return [
      institution,
      { key: 'linked', title: 'Vincule um contrato ou uma solicitação à instituição', detail: 'O relacionamento mostra o que existe com ela: contratos vigentes, processos e propostas.',
        path: '/finance/contracts.html?acao=registrar-contrato', permission: 'create_rfq',
        state: !list(providers) || (!list(contracts) && !list(rfqs)) ? 'unknown'
          : (list(contracts) || []).some(linked) || (list(rfqs) || []).some((rfq) => (rfq.invites || []).some(linked) || (rfq.proposals || []).some(linked)) ? 'done' : 'todo' },
      // Abrir o relacionamento não é fato do servidor: fica como caminho, nunca "concluído".
      { key: 'open', title: 'Abra o relacionamento e registre o próximo contato', detail: 'Contatos, atividades, questões e prazos da instituição num só lugar.',
        path: '/finance/providers.html', permission: null, state: 'guide' }
    ];
  }
  if (goal === 'rfq') {
    const rows = list(rfqs);
    return [
      { key: 'profile', title: 'Complete os dados da empresa', detail: 'Setor e faturamento são reaproveitados em toda solicitação, com a origem de cada dado.',
        path: '/finance/passport.html', permission: 'edit_profile', state: organization ? (organization.sector ? 'done' : 'todo') : 'unknown' },
      institution,
      { key: 'rfq', title: 'Crie a solicitação', detail: 'Crédito empresarial ou adquirência, nos campos que as instituições respondem.',
        path: '/finance/new-rfq.html', permission: 'create_rfq', state: rows ? (rows.length ? 'done' : 'todo') : 'unknown' },
      { key: 'invites', title: 'Convide as instituições', detail: 'Cada uma responde pelo próprio portal ou você registra a proposta recebida fora dele, com a fonte.',
        path: '/finance/rfqs.html', permission: 'create_rfq', state: rows ? (rows.some((rfq) => (rfq.invites || []).length) ? 'done' : 'todo') : 'unknown' },
      { key: 'proposals', title: 'Receba e compare as propostas', detail: 'Condições lado a lado; os pesos e a decisão são da empresa.',
        path: '/finance/rfqs.html?status=comparing', permission: null, state: rows ? (rows.some((rfq) => (rfq.proposals || []).length) ? 'done' : 'todo') : 'unknown' }
    ];
  }
  throw new Error(`objetivo desconhecido: ${goal}`);
}

/** Resumo: quantos passos o servidor comprova, o próximo e se tudo foi verificável. */
export function firstValueProgress(steps) {
  const counted = steps.filter((step) => step.state !== 'guide');
  const done = counted.filter((step) => step.state === 'done').length;
  const unknown = counted.filter((step) => step.state === 'unknown').length;
  const next = steps.find((step) => step.state !== 'done') || null;
  return { done, total: counted.length, unknown, complete: done === counted.length, next };
}

/** Objetivo sugerido quando a pessoa ainda não escolheu: o que já está em andamento. */
export function suggestedGoal(facts = {}) {
  if ((list(facts.rfqs) || []).length) return 'rfq';
  if ((list(facts.contracts) || []).length) return 'contract';
  return 'contract';
}

/** O painel aparece até a primeira solicitação (lista ausente = mostrar; não esconde por suposição). */
export function showFirstValue(facts = {}) {
  const rfqs = list(facts.rfqs);
  return !rfqs || !rfqs.length;
}
