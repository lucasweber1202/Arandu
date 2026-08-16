// Máquina de estados operacional da Arandu.
//
// Este módulo é a fonte única das transições de status usadas pelo painel
// administrativo. O eixo editorial (draft/curatorial_review/published) continua
// em `catalog_review_history` e não é tratado aqui: este arquivo cuida do eixo
// operacional e comercial (obra disponível, artista aprovado, lead ganho...).
//
// As mesmas transições estão declaradas em
// `docs/supabase-operational-status.sql`. `scripts/test-operational-status.mjs`
// compara os dois lados e falha se divergirem.

export class OperationalStatusError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'OperationalStatusError';
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  return String(value ?? '').trim();
}

function filled(value) {
  return clean(value).length > 0;
}

const FLOWS = Object.freeze({
  artwork: {
    panel: 'obras',
    table: 'artworks',
    field: 'status',
    label: 'obra',
    transitions: {
      available: ['in_conversation', 'reserved', 'not_published', 'archived'],
      in_conversation: ['available', 'reserved', 'not_published'],
      reserved: ['available', 'in_conversation', 'sold', 'archived'],
      sold: ['archived'],
      not_published: ['available', 'archived'],
      archived: ['not_published']
    },
    guards: {
      available: (record) =>
        filled(record?.image_authorized_at)
          ? null
          : 'Registre a autorização de imagem antes de deixar a obra disponível.',
      sold: (record) =>
        Number(record?.price) > 0
          ? null
          : 'Registre o preço da obra antes de marcar como vendida.'
    }
  },
  artist: {
    panel: 'artistas',
    table: 'artists',
    field: 'status',
    label: 'artista',
    transitions: {
      prospected: ['in_review', 'archived'],
      in_review: ['approved', 'paused', 'archived'],
      approved: ['published', 'in_review', 'paused', 'archived'],
      published: ['paused', 'archived'],
      paused: ['approved', 'published', 'archived'],
      archived: ['in_review']
    },
    guards: {
      approved: (record) =>
        record?.identity_verified === true
          ? null
          : 'Verifique a identidade do artista antes de aprovar.',
      published: (record) => {
        if (record?.identity_verified !== true) {
          return 'Verifique a identidade do artista antes de publicar.';
        }
        return filled(record?.publishing_consent_at)
          ? null
          : 'Registre o consentimento de publicação antes de publicar o artista.';
      }
    }
  },
  submission: {
    panel: 'submissions',
    table: 'artist_submissions',
    field: 'status',
    label: 'submissão',
    transitions: {
      received: ['screening', 'declined', 'archived'],
      screening: ['curatorial_review', 'declined', 'archived'],
      curatorial_review: ['approved', 'declined', 'archived'],
      approved: ['archived'],
      declined: ['archived'],
      archived: []
    },
    guards: {
      approved: (record) =>
        filled(record?.email) || filled(record?.whatsapp)
          ? null
          : 'Registre e-mail ou WhatsApp antes de aprovar a submissão.'
    }
  },
  lead: {
    panel: 'leads',
    table: 'leads',
    field: 'status',
    label: 'lead',
    transitions: {
      new: ['contacted', 'lost', 'archived'],
      contacted: ['qualified', 'lost', 'archived'],
      qualified: ['proposal', 'won', 'lost', 'archived'],
      proposal: ['won', 'lost', 'archived'],
      won: ['archived'],
      lost: ['archived'],
      archived: []
    },
    guards: {}
  },
  brief: {
    panel: 'briefs',
    table: 'company_briefs',
    field: 'status',
    label: 'briefing',
    transitions: {
      received: ['qualified', 'lost', 'archived'],
      qualified: ['proposal', 'lost', 'archived'],
      proposal: ['negotiation', 'lost', 'archived'],
      negotiation: ['won', 'lost', 'archived'],
      won: ['archived'],
      lost: ['archived'],
      archived: []
    },
    guards: {}
  },
  proposal: {
    panel: 'proposals',
    table: 'proposals',
    field: 'status',
    label: 'proposta',
    transitions: {
      draft: ['sent', 'archived'],
      sent: ['approved', 'declined', 'expired', 'archived'],
      approved: ['archived'],
      declined: ['archived'],
      expired: ['sent', 'archived'],
      archived: []
    },
    guards: {}
  },
  reservation: {
    panel: 'reservations',
    table: 'reservations',
    field: 'status',
    label: 'reserva',
    transitions: {
      requested: ['confirmed', 'expired', 'cancelled'],
      confirmed: ['converted', 'expired', 'cancelled'],
      expired: ['cancelled'],
      converted: [],
      cancelled: []
    },
    guards: {}
  },
  certificate: {
    panel: 'certificados',
    table: 'certificates',
    field: 'verification_status',
    label: 'certificado',
    transitions: {
      draft: ['under_review', 'valid'],
      under_review: ['valid', 'draft', 'revoked'],
      valid: ['under_review', 'revoked'],
      revoked: []
    },
    guards: {
      valid: (record) =>
        filled(record?.artwork_id)
          ? null
          : 'Vincule o certificado a uma obra antes de validá-lo.'
    }
  },
  task: {
    panel: 'tasks',
    table: 'tasks',
    field: 'status',
    label: 'tarefa',
    transitions: {
      open: ['doing', 'cancelled'],
      doing: ['done', 'cancelled'],
      done: [],
      cancelled: ['open']
    },
    guards: {}
  }
});

// Transições que representam aprovação/publicação e exigem permissão elevada
// além de `update`, ligando a máquina de estados ao RBAC administrativo.
const ELEVATED_ACTIONS = Object.freeze({
  artist: { approved: 'review', published: 'publish' },
  artwork: { available: 'publish', sold: 'review' },
  submission: { approved: 'review', declined: 'review' },
  certificate: { valid: 'issue', revoked: 'revoke' }
});

const PANEL_TO_ENTITY = Object.freeze(
  Object.fromEntries(Object.entries(FLOWS).map(([entity, flow]) => [flow.panel, entity]))
);

export const OPERATIONAL_FLOWS = FLOWS;

export function entityForPanel(panel) {
  return PANEL_TO_ENTITY[clean(panel)] || '';
}

export function flowFor(entityOrPanel) {
  const key = clean(entityOrPanel);
  return FLOWS[key] || FLOWS[PANEL_TO_ENTITY[key]] || null;
}

export function statusFieldFor(entityOrPanel) {
  return flowFor(entityOrPanel)?.field || 'status';
}

export function statusesFor(entityOrPanel) {
  const flow = flowFor(entityOrPanel);
  return flow ? Object.keys(flow.transitions) : [];
}

export function isKnownStatus(entityOrPanel, status) {
  return statusesFor(entityOrPanel).includes(clean(status));
}

export function allowedTransitions(entityOrPanel, from) {
  const flow = flowFor(entityOrPanel);
  if (!flow) return [];
  return [...(flow.transitions[clean(from)] || [])];
}

export function elevatedActionFor(entityOrPanel, status) {
  const flow = flowFor(entityOrPanel);
  if (!flow) return '';
  const entity = PANEL_TO_ENTITY[flow.panel];
  return ELEVATED_ACTIONS[entity]?.[clean(status)] || '';
}

/**
 * Valida uma transição operacional completa: vocabulário, rota e pré-condições
 * do registro. Lança `OperationalStatusError` com status HTTP adequado.
 */
export function assertTransition(entityOrPanel, from, to, record = {}) {
  const flow = flowFor(entityOrPanel);
  if (!flow) {
    throw new OperationalStatusError(400, 'Painel operacional inválido.', 'operational_panel_invalid');
  }
  const current = clean(from);
  const next = clean(to);
  if (!isKnownStatus(entityOrPanel, next)) {
    throw new OperationalStatusError(
      400,
      `Status inválido para ${flow.label}: ${next || '(vazio)'}.`,
      'operational_status_invalid'
    );
  }
  if (current && !isKnownStatus(entityOrPanel, current)) {
    throw new OperationalStatusError(
      409,
      `O status atual de ${flow.label} (${current}) não pertence à máquina de estados.`,
      'operational_status_unknown_origin'
    );
  }
  if (current === next) {
    throw new OperationalStatusError(
      409,
      `A ${flow.label} já está em ${next}.`,
      'operational_status_unchanged'
    );
  }
  if (current && !allowedTransitions(entityOrPanel, current).includes(next)) {
    throw new OperationalStatusError(
      409,
      `Transição inválida de ${flow.label}: ${current} → ${next}.`,
      'operational_transition_invalid'
    );
  }
  const guard = flow.guards[next];
  const problem = typeof guard === 'function' ? guard(record) : null;
  if (problem) {
    throw new OperationalStatusError(409, problem, 'operational_guard_failed');
  }
  return { entity: PANEL_TO_ENTITY[flow.panel], field: flow.field, from: current || null, to: next };
}

export function describeFlow(entityOrPanel) {
  const flow = flowFor(entityOrPanel);
  if (!flow) return null;
  return {
    entity: PANEL_TO_ENTITY[flow.panel],
    panel: flow.panel,
    label: flow.label,
    field: flow.field,
    statuses: Object.keys(flow.transitions),
    transitions: Object.fromEntries(
      Object.entries(flow.transitions).map(([status, next]) => [status, [...next]])
    ),
    guarded: Object.keys(flow.guards)
  };
}

export function describeAllFlows() {
  return Object.keys(FLOWS).map((entity) => describeFlow(entity));
}
