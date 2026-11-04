// Configurações da organização, preferências e acessos avançados.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, icon, money, percent, formatDateTime, CONTRACT_STATUS, PROPOSAL_STATUS, ROLE_LABELS } from '../../core.js';
import { card, tag, button, linkButton, emptyState, errorState, loading, toast, field, person, avatar, onSubmit } from '../../ui.js';
import { memberName } from '../shared/people.js';
import { loadEntities, entitySettings, memberScopes } from '../entities.js';
import { mods, need } from './capabilities.js';

/* global __ARANDU_DEMO__ */
const DEMO_BUILD = typeof __ARANDU_DEMO__ !== 'undefined' && __ARANDU_DEMO__ === true;

const REVENUE_BANDS = [['ate_360k', 'Até R$ 360 mil'], ['360k_4_8m', 'R$ 360 mil a R$ 4,8 milhões'], ['4_8m_30m', 'R$ 4,8 a R$ 30 milhões'], ['30m_300m', 'R$ 30 a R$ 300 milhões'], ['acima_300m', 'Acima de R$ 300 milhões']];
const PREFERENCE_TYPES = [['approval_requested', 'Aprovação solicitada a mim'], ['approval_approved', 'Aprovação concluída'], ['approval_rejected', 'Aprovação rejeitada'],
  ['approval_changes_requested', 'Alterações pedidas'], ['proposal_received', 'Nova proposta recebida'], ['proposal_revised', 'Proposta revisada'], ['mention', 'Menções'],
  ['comment', 'Comentários de provedores'], ['renewal_due', 'Renovação de contrato'], ['task_assigned', 'Tarefa atribuída'],
  ['policy_exception_requested', 'Exceção de policy para decidir'], ['policy_exception_decided', 'Exceção de policy decidida']];

const ROLE_SCOPE = {
  admin: { can: ['Administrar equipe, papéis e a regra de aprovação', 'Criar solicitações, convidar instituições e registrar decisões e contratos', 'Aprovar quando for aprovador designado', 'Atribuir, concluir e reabrir tarefas'], cannot: [] },
  finance_manager: { can: ['Criar solicitações, convidar instituições e registrar decisões e contratos', 'Aprovar quando for aprovador designado', 'Atribuir, concluir e reabrir tarefas', 'Atualizar o perfil financeiro'], cannot: ['Equipe, papéis e regra geral de aprovação (administração)'] },
  analyst: { can: ['Comparar propostas e preparar a análise', 'Atualizar o perfil financeiro e anexar documentos', 'Concluir e reabrir tarefas', 'Aprovar quando for aprovador designado'], cannot: ['Criar solicitações e registrar decisões ou contratos (gestão financeira)', 'Atribuir responsáveis de tarefas (gestão financeira)', 'Equipe, papéis e regra de aprovação (administração)'] },
  viewer: { can: ['Acompanhar solicitações, propostas, contratos e tarefas', 'Aprovar ou pedir alterações quando for aprovador designado', 'Ler os comentários da equipe'], cannot: ['Comentar e mencionar (análise e gestão)', 'Criar solicitações e registrar decisões ou contratos (gestão financeira)', 'Concluir, criar ou atribuir tarefas (análise e gestão)', 'Alterar dados da empresa e o perfil financeiro'] }
};

export async function settings(ctx) {
  ctx.header({ title: 'Configurações', subtitle: 'Empresa, perfil financeiro, política de aprovação, notificações e equipe.' });
  // Seções avançadas (policy, integrações, SSO) só existem para quem as vê.
  const advanced = !(__ARANDU_DEMO__ && ctx.mode === 'demo');
  const admin = ctx.viewer?.role === 'admin';
  await need('passport', 'relationship', ...(advanced ? ['policy'] : []), ...(advanced && admin ? ['integrations', 'sso'] : []));
  const organization = ctx.data.organization || ctx.organization;
  const sections = [];
  const nav = el('nav', { class: 'settings-nav', 'aria-label': 'Seções de configuração' });
  const add = (id, title, subtitle, body) => {
    nav.append(el('a', { href: `#${id}`, text: title }));
    sections.push(card({ id, title, subtitle, body }));
  };

  // Empresa.
  const orgForm = el('form', { class: 'field-grid', id: 'organization-form', novalidate: true });
  const trade = el('input', { name: 'trade_name', value: organization.trade_name || '' });
  const cnpj = el('input', { name: 'tax_identifier', inputmode: 'numeric', value: organization.tax_identifier ? String(organization.tax_identifier).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '', placeholder: '00.000.000/0000-00' });
  const sector = el('input', { name: 'sector', value: organization.sector || '' });
  const band = el('select', { name: 'revenue_band' });
  band.add(new Option('Selecione…', ''));
  for (const [value, label] of REVENUE_BANDS) band.add(new Option(label, value));
  band.value = organization.revenue_band || '';
  const canEdit = ctx.can('create_rfq');
  // DOM append(null) imprime "null": quem só lê não recebe o botão, nem texto no lugar dele.
  orgForm.append(...[field({ label: 'Nome fantasia', control: trade }), field({ label: 'CNPJ', control: cnpj, hint: (__ARANDU_DEMO__ && ctx.mode === 'demo') ? 'CNPJ fictício da demonstração.' : 'Conferimos formato e dígitos; não consultamos base oficial.' }),
    field({ label: 'Setor', control: sector }), field({ label: 'Faixa de faturamento', control: band }),
    canEdit ? el('div', { class: 'form-actions span-2' }, button('Salvar dados da empresa', { variant: 'primary', type: 'submit' })) : null].filter(Boolean));
  if (!canEdit) for (const control of orgForm.querySelectorAll('input,select')) control.disabled = true;
  onSubmit(orgForm, async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(orgForm));
    for (const [key, value] of Object.entries(body)) if (value === '') delete body[key];
    try { await ctx.send('organizations', { organization_id: ctx.organization.id, ...body }, 'PATCH'); toast('Dados da empresa atualizados.'); }
    catch (error) { toast(error.message, 'error'); }
  });
  add('empresa', 'Empresa', organization.legal_name, orgForm);

  // Seu acesso (usuário convidado): organização, papel e o que ele permite, em
  // linguagem de tarefa. Espelha UI_PERMISSION_ROLES/TASK_EDITORS; o servidor continua a autoridade.
  const role = ctx.viewer?.role;
  const scope = ROLE_SCOPE[role];
  // O sandbox legado (/demo) não recebe capability nova (CLAUDE.md).
  if (scope && !(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    add('acesso', 'Seu acesso', `${ROLE_LABELS[role] || 'Papel'} em ${organization.legal_name}`, el('div', { class: 'access-scope', id: 'access-scope' }, [
      el('div', {}, [el('h3', { class: 'access-scope-title', text: 'Você pode' }), el('ul', { class: 'access-list' }, scope.can.map((text) => el('li', { text })))]),
      el('div', {}, [el('h3', { class: 'access-scope-title', text: 'Fica com outros papéis' }), scope.cannot.length ? el('ul', { class: 'access-list muted' }, scope.cannot.map((text) => el('li', { text }))) : el('p', { class: 'muted small', text: 'Nada: este é o papel com acesso completo à organização.' })]),
      el('p', { class: 'muted small span-2', text: role === 'admin' ? 'Papéis são definidos em "Equipe e papéis". O acesso a cada entidade do grupo segue o escopo concedido.' : 'Precisa de outro acesso? Peça a um administrador da organização. O acesso a cada entidade do grupo segue o escopo concedido.' })
    ]));
  }

  // Identidade de quem usa: aparece em aprovações, comentários, tarefas e responsáveis.
  const me = (ctx.members || []).find((member) => member.user_id === ctx.viewer?.id);
  if (me) {
    const nameInput = el('input', { name: 'display_name', maxlength: '120', value: me.display_name || '', autocomplete: 'name', required: true });
    const titleInput = el('input', { name: 'title', maxlength: '80', value: me.title || '', autocomplete: 'organization-title', placeholder: 'Ex.: Gerente Financeira' });
    const meForm = el('form', { class: 'inline-form', novalidate: true, id: 'member-profile-form' }, [
      field({ label: 'Seu nome', control: nameInput, required: true }), field({ label: 'Cargo', control: titleInput, optionalLabel: true }),
      button('Salvar', { type: 'submit', iconName: 'check' })]);
    onSubmit(meForm, async (event) => {
      event.preventDefault();
      if (nameInput.value.trim().length < 2) { toast('Informe seu nome, com pelo menos 2 caracteres.', 'error'); nameInput.focus(); return; }
      try { await ctx.send('members/me', { organization_id: ctx.organization.id, display_name: nameInput.value.trim(), title: titleInput.value.trim() }, 'PATCH'); toast('Nome e cargo atualizados.'); ctx.reload(); }
      catch (error) { toast(error.message, 'error'); }
    });
    add('voce', 'Seu nome e cargo', 'Como a equipe vê você em aprovações, comentários e tarefas. O e-mail nunca aparece nessas telas.', meForm);
  }

  // Perfil financeiro reaproveitável: mora no Financial Passport, com
  // proveniência, frescor e histórico por campo. Aqui fica só o resumo.
  const profile = ctx.data.profile || [];
  const passportSummary = mods.passport.buildPassport({ organization: ctx.organization, rows: profile });
  add('perfil', 'Perfil financeiro', 'Informado uma vez, reaproveitado em cada solicitação, com origem, responsável e revisão de cada dado.', [
    el('p', { class: 'muted', text: `${passportSummary.coverage.filled} de ${passportSummary.coverage.relevant} campos do catálogo preenchidos${passportSummary.attention.length ? ` · ${passportSummary.attention.length} pedem revisão` : ''}.` }),
    linkButton('Abrir o Financial Passport', ctx.href('/finance/passport.html'), { variant: 'secondary', iconName: 'shield' })
  ]);

  // Entidades do grupo e escopo de acesso por entidade (multi-entity).
  const entities = await loadEntities(ctx);
  if (entities.available) {
    add('entidades', 'Entidades do grupo', 'Entidades legais e unidades. Processos e contratos de uma entidade só aparecem para quem tem o grupo inteiro ou aquela entidade no escopo.', entitySettings(ctx, entities));
    add('escopos', 'Escopo de acesso por entidade', 'Tesouraria do grupo enxerga tudo; escopo restrito enxerga só as entidades concedidas. O banco aplica a regra em toda leitura e escrita.', memberScopes(ctx, entities));
  }

  if (entities.available) {
    add('scorecards', 'Scorecards de provedores', 'Critérios e pesos definidos pela sua empresa para avaliar provedores. Versionados; o Arandu não fornece nota própria.', mods.relationship.scorecardSettings(ctx));
  }

  // Política de aprovação.
  const policyBox = el('div', {}, loading());
  ctx.api(`approval-policy?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((policy) => {
    const toggle = el('input', { type: 'checkbox', role: 'switch', checked: Boolean(policy.required_for_decision), disabled: ctx.viewer?.role !== 'admin' && ctx.viewer?.role });
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await ctx.send('approval-policy', { organization_id: ctx.organization.id, required_for_decision: toggle.checked });
        toast(toggle.checked ? 'Aprovação agora é obrigatória antes de decidir.' : 'Aprovação passou a ser opcional.');
      } catch (error) { toggle.checked = !toggle.checked; toast(error.message, 'error'); } finally { toggle.disabled = false; }
    });
    policyBox.replaceChildren(el('label', { class: 'switch-row' }, [toggle, el('span', {}, [el('strong', { text: 'Exigir aprovação antes de registrar qualquer decisão' }),
      el('span', { class: 'muted small', text: policy.updated_at ? ` Atualizada em ${formatDateTime(policy.updated_at)}.` : ' Nenhuma exigência configurada.' })])]),
    ctx.viewer?.role && ctx.viewer.role !== 'admin' ? el('p', { class: 'muted small', text: `Somente administradores alteram esta regra.${(__ARANDU_DEMO__ && ctx.mode === 'demo') ? ' Troque para a persona Admin para experimentar.' : ''}` }) : el('p', { class: 'muted small', text: 'Mudanças ficam registradas na trilha da organização.' }));
  }).catch((error) => policyBox.replaceChildren(errorState({ error })));
  add('aprovacao', 'Regra geral de aprovação', 'Quando ligada, nenhuma decisão é registrada sem um pedido aprovado para a mesma proposta e versão. Policies abaixo detalham quem aprova e em que ordem.', policyBox);

  // Governança: Policy & Approval Engine v2 e delegação temporária. O
  // transporte da demonstração não tem o engine; lá vale só a regra geral.
  if (!(__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    add('governanca', 'Governança: policies de aprovação', 'Regras da sua empresa, por grupo e por entidade: quem aprova, em que ordem, sob qual versão. Versões ativadas são imutáveis.', mods.policy.policySettings(ctx, entities));
    add('delegacao', 'Delegação de aprovação', 'Substituto temporário para as suas etapas de aprovação, com trilha.', mods.policy.delegationSettings(ctx));
    // Public API v1 & Webhooks: administração da organização.
    if (ctx.viewer?.role === 'admin') {
      add('integracoes', 'Integrações: API e webhooks', 'Contas de serviço com escopo e entidades, tokens que expiram e webhooks assinados. Para ERP, TMS e plataformas de dados.', mods.integrations.integrationSettings(ctx, entities));
      add('sso', 'Segurança: SSO corporativo', 'Login pelo provedor de identidade da empresa (SAML/OIDC), com domínio verificado, exigência opcional de SSO e revogação de sessões.', mods.sso.ssoSettings(ctx));
      // Carregado sob demanda: só administradores abrem esta seção. O build de
      // demonstração não tem API (tudo responde 404) e não empacota o módulo.
      if (!DEMO_BUILD) {
        const governanceBox = el('div', {}, loading());
        import('../governance.js').then(({ governanceSettings }) => governanceBox.replaceChildren(governanceSettings(ctx)))
          .catch((error) => governanceBox.replaceChildren(errorState({ error })));
        add('dados', 'Governança de dados', 'Classificação, retenção, legal hold, export portável e offboarding da organização.', governanceBox);
      }
    }
  }

  // Preferências de notificação.
  const prefBox = el('div', {}, loading());
  ctx.api(`notification-preferences?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ rows }) => {
    const saved = new Map((rows || []).map((row) => [row.event_type, row]));
    const grid = el('table', { class: 'pref-table' });
    grid.append(el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Aviso' }), el('th', { scope: 'col', text: 'No aplicativo' }), el('th', { scope: 'col', text: 'Por e-mail' })])));
    const body = el('tbody');
    for (const [type, label] of PREFERENCE_TYPES) {
      const current = saved.get(type) || { in_app: true, email: false };
      const inApp = el('input', { type: 'checkbox', checked: current.in_app !== false, 'aria-label': `${label} no aplicativo` });
      const email = el('input', { type: 'checkbox', checked: Boolean(current.email), 'aria-label': `${label} por e-mail` });
      const persist = async (control) => {
        control.disabled = true;
        try {
          await ctx.send('notification-preferences', { organization_id: ctx.organization.id, event_type: type, in_app: inApp.checked, email: email.checked });
          toast(`${label}: preferência salva.`);
        } catch (error) { control.checked = !control.checked; toast(error.message, 'error'); } finally { control.disabled = false; }
      };
      inApp.addEventListener('change', () => persist(inApp));
      email.addEventListener('change', () => persist(email));
      body.append(el('tr', {}, [el('th', { scope: 'row', text: label }), el('td', {}, inApp), el('td', {}, email)]));
    }
    grid.append(body);
    prefBox.replaceChildren(grid, el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), el('span', { text: (__ARANDU_DEMO__ && ctx.mode === 'demo')
      ? 'Na demonstração nenhum e-mail é enviado: a preferência é guardada e o envio é apenas simulado.'
      : 'O envio por e-mail depende do provedor de e-mail configurado no ambiente. Sem ele, a preferência é guardada e nada é enviado.' })]));
  }).catch((error) => prefBox.replaceChildren(errorState({ error })));
  add('notificacoes', 'Notificações', 'Escolha o que chega até você. Os avisos nunca incluem condições financeiras no e-mail.', prefBox);

  // Equipe.
  const team = el('ul', { class: 'member-list', role: 'list' }, (ctx.members || []).map((member) => el('li', { class: 'member-row' }, [
    person(member.display_name || memberName(ctx.members, member.user_id), member.title || null), tag(ROLE_LABELS[member.role] || member.role), member.user_id === ctx.viewer?.id ? tag('você', 'accent') : null
  ])));
  add('equipe', 'Equipe e papéis', 'Quem cria solicitações, quem aprova e quem só acompanha.', (ctx.members || []).length ? team : emptyState({ title: 'Equipe indisponível', compact: true }));

  if ((__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    const fail = button('Simular falha na próxima gravação', { iconName: 'alert', onClick: () => { ctx.transport.simulateFailure(); toast('A próxima ação que grava dados vai falhar uma vez. Veja a mensagem de erro e tente de novo.', 'info'); } });
    add('demonstracao', 'Demonstração', 'Ferramentas para experimentar estados de erro. Existem só no ambiente demonstrativo.', [
      el('p', { class: 'muted small', text: `Estado salvo neste navegador (chave ${ctx.transport.storageKey}). ${ctx.transport.counts().emails} e-mail(s) simulado(s) — nenhum enviado.` }), fail,
      el('p', { class: 'muted small', text: 'O console operacional da plataforma (saúde de jobs, outbox e envios, sem dados de clientes) também tem uma versão de exemplo.' }),
      linkButton('Ver console operacional de exemplo', ctx.href('/finance/ops.html'), { iconName: 'shield', size: 'sm' })]);
    // Aparência e layout: preferências locais da camada de experiência da demo.
    ctx.demoSettings?.(add);
  }
  const layout = el('div', { class: 'settings-layout' }, [nav, el('div', { class: 'stack' }, sections)]);
  if (location.hash) queueMicrotask(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  return layout;
}

export { avatar, money, percent, PROPOSAL_STATUS, CONTRACT_STATUS };
