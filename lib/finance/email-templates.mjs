// Modelos de e-mail do procurement financeiro.
//
// Este módulo PRODUZ o conteúdo; ele não envia nada. A entrega usaria a outbox
// transacional já existente (`transactional_email_outbox`), que exige
// credencial de provedor de e-mail configurada no ambiente — ver
// docs/FINANCIAL_EMAIL_TEMPLATES.md. Enquanto essa credencial não existir, o
// convite continua sendo entregue manualmente pela empresa compradora, e o
// produto diz isso em vez de fingir que enviou.
//
// Tom: informativo. Nada de urgência fabricada, promessa de aprovação ou
// linguagem de venda — o Arandu organiza uma cotação, não vende crédito.

/**
 * O token vai no FRAGMENTO, não na query.
 *
 * O navegador nunca envia o fragmento em requisição nenhuma: ele não aparece no
 * log de acesso do host, não entra no cabeçalho `Referer` e não é lido por
 * analytics que reportam a URL da página. Com `?token=`, o segredo de uso único
 * vazaria por todos esses caminhos sem que ninguém tivesse errado nada.
 */
export function inviteLink(baseUrl, token) {
  return `${String(baseUrl).replace(/\/$/, '')}/provider/invite.html#token=${encodeURIComponent(token)}`;
}

const SIGNATURE = [
  '',
  '—',
  'Arandu — plataforma de procurement financeiro B2B.',
  'O Arandu organiza a coleta e a comparação de propostas. Ele não concede crédito,',
  'não decide crédito, não garante aprovação e não movimenta recursos.'
].join('\n');

const NOTIFICATION_SUBJECTS = Object.freeze({
  mention: 'Você foi mencionado em um processo',
  approval: 'Há uma aprovação para acompanhar',
  proposal: 'Nova atividade de proposta',
  renewal_due: 'Um contrato entrou em revisão de renovação'
});
const NOTIFICATION_LINES = Object.freeze({
  mention: 'Alguém da sua empresa mencionou você em um comentário.',
  approval: 'Uma aprovação foi solicitada ou concluída em um processo que envolve você.',
  proposal: 'Um provedor enviou ou revisou uma proposta em uma solicitação sua.',
  renewal_due: 'Um contrato sob sua responsabilidade alcançou um marco de renovação.'
});

/** Caminhos aceitos no link do aviso: só telas do portal, nunca URL externa. */
export function notificationLink(baseUrl, path) {
  const value = String(path || '');
  if (!/^\/(?:finance|provider)\/[a-z-]+\.html(?:[?#][A-Za-z0-9=&#?._-]*)?$/.test(value)) throw new Error('invalid_notification_path');
  return `${String(baseUrl).replace(/\/$/, '')}${value}`;
}

export const TEMPLATES = Object.freeze({
  member_invite: {
    event_type: 'finance_member_invite',
    entity_type: 'organization',
    subject: ({ organization }) => `Convite para acessar ${organization} no Arandu`,
    body: ({ organization, role, link }) => [
      `Você foi convidado para participar de ${organization} no Arandu, com o papel de ${role}.`,
      '',
      `Para aceitar, acesse: ${link}`,
      '',
      'O convite vale uma vez e expira em 7 dias. Ele só funciona para o e-mail que o recebeu.'
    ].join('\n') + SIGNATURE
  },

  provider_invite: {
    event_type: 'finance_provider_invite',
    entity_type: 'rfq',
    subject: ({ buyer, product }) => `${buyer} convidou sua instituição para cotar ${product}`,
    body: ({ buyer, product, deadline, link }) => [
      `${buyer} está coletando propostas de ${product} pelo Arandu e convidou sua instituição a participar.`,
      '',
      deadline ? `Prazo de resposta: ${deadline}.` : 'Sem prazo de resposta definido.',
      '',
      `Para ver a necessidade e responder: ${link}`,
      '',
      'O convite vale uma vez e expira. Ele vincula a solicitação à organização',
      'provedora da qual você é membro — não é possível responder por outra instituição.',
      'Sua proposta não é visível para os demais provedores convidados.'
    ].join('\n') + SIGNATURE
  },

  rfq_opened: {
    event_type: 'finance_rfq_opened',
    entity_type: 'rfq',
    subject: ({ title }) => `Solicitação aberta: ${title}`,
    body: ({ title, product, deadline }) => [
      `A solicitação "${title}" (${product}) está aberta para receber propostas.`,
      deadline ? `Prazo de resposta: ${deadline}.` : ''
    ].filter(Boolean).join('\n') + SIGNATURE
  },

  deadline_near: {
    event_type: 'finance_deadline_near',
    entity_type: 'rfq',
    subject: ({ title }) => `Prazo de resposta se aproxima: ${title}`,
    body: ({ title, deadline, received }) => [
      `O prazo de resposta da solicitação "${title}" é ${deadline}.`,
      `Propostas recebidas até agora: ${received}.`
    ].join('\n') + SIGNATURE
  },

  proposal_received: {
    event_type: 'finance_proposal_received',
    entity_type: 'proposal',
    subject: ({ title }) => `Nova proposta recebida em ${title}`,
    body: ({ title, provider, link }) => [
      `${provider} enviou uma proposta para a solicitação "${title}".`,
      '',
      `Para comparar as condições recebidas: ${link}`,
      '',
      'As condições não são reproduzidas neste e-mail.'
    ].join('\n') + SIGNATURE
  },

  proposal_revised: {
    event_type: 'finance_proposal_revised',
    entity_type: 'proposal',
    subject: ({ title }) => `Proposta revisada em ${title}`,
    body: ({ title, provider, version, link }) => [
      `${provider} enviou a versão ${version} da proposta para "${title}".`,
      'As versões anteriores continuam registradas no histórico.',
      '',
      `Para comparar: ${link}`
    ].join('\n') + SIGNATURE
  },

  decision_recorded: {
    event_type: 'finance_decision_recorded',
    entity_type: 'rfq',
    subject: ({ title }) => `Decisão registrada em ${title}`,
    body: ({ title, decidedBy, at }) => [
      `A decisão da solicitação "${title}" foi registrada por ${decidedBy} em ${at}.`,
      '',
      'O Arandu guarda quem decidiu, quando, com quais critérios e uma fotografia',
      'de todas as propostas existentes naquele momento. A decisão é da empresa.'
    ].join('\n') + SIGNATURE
  },

  // Aviso genérico por preferência do usuário. Não carrega título, valor, taxa
  // nem nome de provedor: diz só que existe algo a ver e leva ao portal, onde
  // a sessão e a organização são verificadas.
  notification: {
    event_type: 'finance_notification',
    entity_type: 'notification',
    subject: ({ kind }) => NOTIFICATION_SUBJECTS[kind] || 'Há uma atualização no Arandu',
    body: ({ kind, link }) => [
      NOTIFICATION_LINES[kind] || 'Há uma atualização em um processo da sua organização.',
      '',
      `Para ver os detalhes, entre no Arandu: ${link}`,
      '',
      'Por segurança, este e-mail não reproduz condições, valores nem nomes de instituições.',
      'Você recebe este aviso porque ativou e-mails para este tipo de atualização nas suas preferências.'
    ].join('\n') + SIGNATURE
  },

  renewal_due: {
    event_type: 'finance_renewal_due',
    entity_type: 'contract',
    subject: ({ provider }) => `Janela de renovação aberta: contrato com ${provider}`,
    body: ({ provider, endsOn, reviewFrom, link }) => [
      `O contrato com ${provider} termina em ${endsOn}.`,
      `A janela de revisão abriu em ${reviewFrom}, considerando o aviso prévio registrado.`,
      '',
      `Para revisar ou abrir uma nova cotação: ${link}`
    ].join('\n') + SIGNATURE
  }
});

export const TEMPLATE_NAMES = Object.freeze(Object.keys(TEMPLATES));

/**
 * Monta a linha que seria inserida na outbox transacional existente.
 *
 * `idempotency_key` é determinística: reprocessar o mesmo evento não gera um
 * segundo e-mail. Nenhum termo financeiro entra no `payload` — o e-mail avisa
 * que algo mudou e leva ao portal, onde a autorização é verificada.
 */
export function buildOutboxRow(templateName, { entityId, recipient, requestId, baseUrl, data = {} }) {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error(`Modelo de e-mail desconhecido: ${templateName}`);
  const link = data.token ? inviteLink(baseUrl, data.token) : `${String(baseUrl).replace(/\/$/, '')}${data.path || '/finance/dashboard.html'}`;
  const context = { ...data, link };
  return {
    event_type: template.event_type,
    entity_type: template.entity_type,
    entity_id: String(entityId),
    template: templateName,
    recipient_address: recipient,
    payload: {
      subject: template.subject(context),
      body: template.body(context),
      link
    },
    request_id: requestId,
    idempotency_key: `${templateName}:${entityId}:${data.version ?? 'v1'}`
  };
}
