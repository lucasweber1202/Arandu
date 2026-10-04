// Máquina de estados explícita do procurement financeiro.
//
// Transições nunca são strings livres vindas do cliente: a API só aceita um par
// (estado atual, estado alvo) presente nas tabelas abaixo, e o banco repete a
// checagem nas funções SECURITY DEFINER.

export const RFQ_STATES = /* @__PURE__ */ Object.freeze(['draft', 'open', 'collecting', 'comparing', 'decided', 'contracted', 'closed', 'cancelled']);

const RFQ_TRANSITIONS = /* @__PURE__ */ Object.freeze({
  draft: ['open', 'cancelled'],
  open: ['collecting', 'cancelled'],
  collecting: ['comparing', 'cancelled'],
  comparing: ['decided', 'collecting', 'cancelled'],
  decided: ['contracted', 'closed'],
  contracted: ['closed'],
  closed: [],
  cancelled: []
});

export const PROPOSAL_STATES = /* @__PURE__ */ Object.freeze(['draft', 'submitted', 'revised', 'withdrawn']);

const PROPOSAL_TRANSITIONS = /* @__PURE__ */ Object.freeze({
  draft: ['submitted', 'withdrawn'],
  submitted: ['revised', 'withdrawn'],
  revised: ['revised', 'withdrawn'],
  withdrawn: []
});

export const CONTRACT_STATES = /* @__PURE__ */ Object.freeze(['active', 'renewing', 'expired', 'terminated']);

const CONTRACT_TRANSITIONS = /* @__PURE__ */ Object.freeze({
  active: ['renewing', 'expired', 'terminated'],
  renewing: ['active', 'expired', 'terminated'],
  expired: [],
  terminated: []
});

const MACHINES = /* @__PURE__ */ Object.freeze({
  rfq: { states: RFQ_STATES, transitions: RFQ_TRANSITIONS },
  proposal: { states: PROPOSAL_STATES, transitions: PROPOSAL_TRANSITIONS },
  contract: { states: CONTRACT_STATES, transitions: CONTRACT_TRANSITIONS }
});

export function machineKinds() { return Object.keys(MACHINES); }

export function statesOf(kind) { return MACHINES[kind]?.states ?? []; }

export function canTransition(kind, from, to) {
  const machine = MACHINES[kind];
  if (!machine) return false;
  if (!machine.states.includes(from) || !machine.states.includes(to)) return false;
  return machine.transitions[from].includes(to);
}

export function nextStates(kind, from) {
  const machine = MACHINES[kind];
  if (!machine || !machine.states.includes(from)) return [];
  return [...machine.transitions[from]];
}

/** Estados em que a RFQ ainda aceita propostas de provedores convidados. */
export const RFQ_RECEIVING_STATES = /* @__PURE__ */ Object.freeze(['open', 'collecting']);

/** Momento a partir do qual a empresa pode registrar decisão. */
export const RFQ_DECIDABLE_STATES = /* @__PURE__ */ Object.freeze(['comparing']);
