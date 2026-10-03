// Financial Relationship & Portfolio: visões factuais sobre dados que a pessoa
// já pode ler (o RLS filtrou antes de chegar aqui).
//
// Regras deste módulo:
//   * nunca soma valores de moedas diferentes — toda visão é por moeda;
//   * saldo/uso são as fotografias mais recentes declaradas/importadas, com a
//     data; ausência de dado aparece como ausência, não como zero;
//   * nada aqui é nota, risco, recomendação ou ranking; "participação" é a
//     parcela factual de valores registrados, com definição explícita;
//   * o Arandu não calcula juros, saldo devedor nem amortização: o cronograma
//     é o declarado.

export const FACILITY_KINDS = Object.freeze({
  term_loan: 'Empréstimo a prazo', revolving_credit: 'Crédito rotativo / conta garantida', overdraft: 'Cheque especial',
  guarantee_line: 'Linha de garantias / fianças', trade_finance: 'Comércio exterior', leasing: 'Leasing', debenture: 'Debênture',
  receivables_line: 'Linha de recebíveis', other: 'Outra'
});
export const GUARANTEE_KINDS = Object.freeze({
  receivables: 'Recebíveis', real_estate: 'Imóvel', equipment: 'Equipamento', cash_collateral: 'Caução em dinheiro',
  investment_pledge: 'Penhor de aplicação', bank_guarantee: 'Fiança bancária', surety: 'Seguro-garantia', aval: 'Aval',
  fiduciary_assignment: 'Cessão/alienação fiduciária', other: 'Outra'
});

export const PORTFOLIO_DEFINITIONS = Object.freeze({
  approved_limit: 'Soma dos limites aprovados registrados nas facilities ativas, por moeda.',
  used_limit: 'Soma do uso de limite da fotografia mais recente de cada facility, por moeda. Facility sem fotografia não entra e é contada à parte.',
  available_limit: 'Limite aprovado menos uso, só para facilities com os dois dados.',
  outstanding: 'Saldo devedor da fotografia mais recente (declarado, extrato, importação ou integração). O Arandu não calcula saldo.',
  maturity_wall: 'Principal a vencer por ano, pelo cronograma declarado; sem cronograma, o saldo mais recente no vencimento final.',
  indexer_mix: 'Participação de cada indexador no saldo devedor conhecido, por moeda.',
  provider_concentration: 'Participação de cada provedor no saldo devedor conhecido e no limite aprovado, por moeda. É fato registrado, não avaliação.',
  refinancing_window: 'Facilities ativas com vencimento final dentro do horizonte escolhido.',
  committed_guarantees: 'Valor comprometido em garantias ativas, por moeda e tipo.',
  review_due: 'Facility cujo dado não foi confirmado dentro do período de revisão declarado.'
});

const round = (value) => Math.round(value * 100) / 100;
const iso = (value) => (value ? String(value).slice(0, 10) : null);
function addMonths(day, months) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Fotografia mais recente por facility (maior as_of; empate, maior recorded_at). */
export function latestBalances(balances = []) {
  const latest = new Map();
  for (const row of balances) {
    const current = latest.get(row.facility_id);
    if (!current || row.as_of > current.as_of || (row.as_of === current.as_of && String(row.recorded_at) > String(current.recorded_at))) latest.set(row.facility_id, row);
  }
  return latest;
}

/** Cronograma vigente: só a versão corrente de cada facility. */
export function currentSchedule(repayments = [], facilities = []) {
  const version = new Map(facilities.map((row) => [row.id, row.schedule_version || 0]));
  return repayments.filter((row) => row.schedule_version === version.get(row.facility_id));
}

function bucket(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}
function shares(map) {
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, amount: round(value), share_pct: total ? round(value / total * 100) : null }));
}

/**
 * Visões do portfólio, por moeda.
 * @param {{facilities:object[], balances:object[], repayments:object[], guarantees:object[], providers?:object[], today?:string, horizonMonths?:number}} input
 */
export function portfolioViews({ facilities = [], balances = [], repayments = [], guarantees = [], providers = [], today = new Date().toISOString().slice(0, 10), horizonMonths = 12 } = {}) {
  const names = new Map(providers.map((row) => [row.id, row.name]));
  const latest = latestBalances(balances);
  const schedule = currentSchedule(repayments, facilities);
  const active = facilities.filter((row) => row.status === 'active');
  const byCurrency = new Map();
  const horizon = addMonths(today, horizonMonths);
  const refinancing = [];
  const reviewDue = [];

  for (const facility of active) {
    const view = bucket(byCurrency, facility.currency, () => ({
      currency: facility.currency, facilities: 0,
      approved_limit: 0, used_limit: 0, available_limit: 0, limit_without_usage: 0,
      outstanding: 0, outstanding_unknown: 0,
      indexer: new Map(), providerOutstanding: new Map(), providerLimit: new Map(), maturity: new Map()
    }));
    view.facilities += 1;
    const snapshot = latest.get(facility.id) || null;
    const approved = facility.approved_limit === null || facility.approved_limit === undefined ? null : Number(facility.approved_limit);
    const used = snapshot?.used_limit_amount === null || snapshot?.used_limit_amount === undefined ? null : Number(snapshot.used_limit_amount);
    const outstanding = snapshot?.outstanding_amount === null || snapshot?.outstanding_amount === undefined ? null : Number(snapshot.outstanding_amount);
    if (approved !== null) {
      view.approved_limit += approved;
      view.providerLimit.set(facility.provider_id, (view.providerLimit.get(facility.provider_id) || 0) + approved);
      if (used !== null) { view.used_limit += used; view.available_limit += approved - used; } else view.limit_without_usage += 1;
    }
    if (outstanding !== null) {
      view.outstanding += outstanding;
      const indexer = facility.indexer || 'nao_informado';
      view.indexer.set(indexer, (view.indexer.get(indexer) || 0) + outstanding);
      view.providerOutstanding.set(facility.provider_id, (view.providerOutstanding.get(facility.provider_id) || 0) + outstanding);
    } else view.outstanding_unknown += 1;

    const items = schedule.filter((row) => row.facility_id === facility.id && iso(row.due_on) >= today);
    if (items.length) {
      for (const item of items) {
        const year = iso(item.due_on).slice(0, 4);
        const entry = bucket(view.maturity, year, () => ({ year, scheduled: 0, final_balance: 0 }));
        entry.scheduled += Number(item.principal_amount);
      }
    } else if (facility.maturity_on && outstanding !== null && iso(facility.maturity_on) >= today) {
      const year = iso(facility.maturity_on).slice(0, 4);
      const entry = bucket(view.maturity, year, () => ({ year, scheduled: 0, final_balance: 0 }));
      entry.final_balance += outstanding;
    }

    if (facility.maturity_on && iso(facility.maturity_on) >= today && iso(facility.maturity_on) <= horizon) {
      refinancing.push({ id: facility.id, name: facility.name, provider: names.get(facility.provider_id) || null, legal_entity_id: facility.legal_entity_id,
        currency: facility.currency, maturity_on: iso(facility.maturity_on), outstanding, approved_limit: approved, as_of: snapshot?.as_of || null });
    }
    const verified = iso(facility.verified_at || facility.updated_at || facility.created_at);
    if (verified && addDays(verified, Number(facility.review_after_days || 90)) < today) {
      reviewDue.push({ id: facility.id, name: facility.name, verified_at: verified, review_after_days: facility.review_after_days });
    }
  }

  const guaranteeViews = new Map();
  for (const row of guarantees.filter((item) => item.status === 'active')) {
    const view = bucket(guaranteeViews, row.currency, () => ({ currency: row.currency, total: 0, count: 0, unknown_amount: 0, kinds: new Map() }));
    view.count += 1;
    if (row.committed_amount === null || row.committed_amount === undefined) { view.unknown_amount += 1; continue; }
    view.total += Number(row.committed_amount);
    view.kinds.set(row.kind, (view.kinds.get(row.kind) || 0) + Number(row.committed_amount));
  }

  const label = (id) => names.get(id) || 'Provedor';
  return {
    as_of: today,
    horizon_months: horizonMonths,
    currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((view) => ({
      currency: view.currency,
      facilities: view.facilities,
      approved_limit: round(view.approved_limit),
      used_limit: round(view.used_limit),
      available_limit: round(view.available_limit),
      limit_without_usage: view.limit_without_usage,
      outstanding: round(view.outstanding),
      outstanding_unknown: view.outstanding_unknown,
      indexer_mix: shares(view.indexer),
      provider_concentration: {
        outstanding: shares(view.providerOutstanding).map((row) => ({ ...row, provider: label(row.key) })),
        approved_limit: shares(view.providerLimit).map((row) => ({ ...row, provider: label(row.key) }))
      },
      maturity_wall: [...view.maturity.values()].sort((a, b) => a.year.localeCompare(b.year)).map((row) => ({ ...row, scheduled: round(row.scheduled), final_balance: round(row.final_balance) }))
    })),
    guarantees: [...guaranteeViews.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((view) => ({
      currency: view.currency, count: view.count, committed: round(view.total), unknown_amount: view.unknown_amount,
      by_kind: shares(view.kinds).map((row) => ({ ...row, label: GUARANTEE_KINDS[row.key] || row.key }))
    })),
    refinancing_windows: refinancing.sort((a, b) => a.maturity_on.localeCompare(b.maturity_on)),
    review_due: reviewDue,
    definitions: PORTFOLIO_DEFINITIONS
  };
}

export const RELATIONSHIP_DEFINITIONS = Object.freeze({
  invited: 'Convites enviados a este provedor nas solicitações que você pode ler.',
  responded: 'Convites com ao menos uma proposta enviada.',
  response_rate: 'Respondidos ÷ convidados, só quando houve convite. Fato do histórico, não nota.',
  median_response_days: 'Mediana de dias entre o convite e a primeira versão da proposta.',
  active_contracts: 'Contratos ativos ou em renovação com este provedor.',
  open_issues: 'Issues abertas ou em andamento.',
  median_resolution_days: 'Mediana de dias entre abertura e resolução das issues resolvidas.',
  review: 'Avaliação conforme critérios e pesos definidos pela sua empresa. O Arandu não atribui nota própria a instituições.'
});

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}
const days = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;

/** Métricas factuais de relacionamento com um provedor. */
export function relationshipMetrics({ invites = [], proposals = [], firstVersions = [], contracts = [], facilities = [], issues = [], reviews = [] } = {}) {
  const first = new Map(firstVersions.map((row) => [row.proposal_id, row.submitted_at]));
  const byInvite = new Map(proposals.map((row) => [row.invite_id, row]));
  const responded = invites.filter((invite) => {
    const proposal = byInvite.get(invite.id);
    return proposal && proposal.current_version > 0;
  });
  const responseDays = responded.map((invite) => {
    const submitted = first.get(byInvite.get(invite.id).id);
    return submitted && invite.created_at ? days(invite.created_at, submitted) : null;
  });
  const resolved = issues.filter((issue) => issue.status === 'resolved' && issue.resolved_at);
  const lastReview = [...reviews].sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))[0] || null;
  return {
    invited: invites.length,
    responded: responded.length,
    response_rate: invites.length ? round(responded.length / invites.length * 100) : null,
    median_response_days: median(responseDays),
    proposals: proposals.filter((row) => row.current_version > 0).length,
    active_contracts: contracts.filter((row) => ['active', 'renewing'].includes(row.status)).length,
    active_facilities: facilities.filter((row) => row.status === 'active').length,
    open_issues: issues.filter((row) => ['open', 'in_progress'].includes(row.status)).length,
    median_resolution_days: median(resolved.map((issue) => days(`${issue.opened_on}T00:00:00Z`, issue.resolved_at))),
    last_review: lastReview ? { weighted_result: lastReview.weighted_result === null ? null : Number(lastReview.weighted_result), answered_weight: Number(lastReview.answered_weight), period_end: lastReview.period_end, label: 'Resultado conforme os critérios e pesos definidos pela sua empresa' } : null,
    definitions: RELATIONSHIP_DEFINITIONS
  };
}

/** Mapa do relacionamento por entidade × categoria: contratos, facilities, limites. */
export function relationshipMap({ contracts = [], facilities = [], balances = [], relationships = [] } = {}) {
  const latest = latestBalances(balances);
  const map = new Map();
  const cell = (entity, category) => bucket(map, `${entity || 'group'}|${category}`, () => ({ legal_entity_id: entity || null, category, contracts: 0, facilities: 0, limits: new Map(), next_end: null }));
  for (const contract of contracts.filter((row) => ['active', 'renewing'].includes(row.status))) {
    const entry = cell(contract.legal_entity_id, contract.product);
    entry.contracts += 1;
    if (!entry.next_end || contract.ends_on < entry.next_end) entry.next_end = iso(contract.ends_on);
  }
  for (const facility of facilities.filter((row) => row.status === 'active')) {
    const entry = cell(facility.legal_entity_id, 'credit');
    entry.facilities += 1;
    const limit = bucket(entry.limits, facility.currency, () => ({ currency: facility.currency, approved: 0, used: 0, used_known: true }));
    if (facility.approved_limit !== null && facility.approved_limit !== undefined) limit.approved += Number(facility.approved_limit);
    const used = latest.get(facility.id)?.used_limit_amount;
    if (used === null || used === undefined) limit.used_known = false; else limit.used += Number(used);
    if (facility.maturity_on && (!entry.next_end || iso(facility.maturity_on) < entry.next_end)) entry.next_end = iso(facility.maturity_on);
  }
  const statuses = new Map(relationships.map((row) => [row.legal_entity_id, row.status]));
  return [...map.values()].map((entry) => ({
    ...entry,
    relationship_status: statuses.get(entry.legal_entity_id) || null,
    limits: [...entry.limits.values()].map((row) => ({ ...row, approved: round(row.approved), used: row.used_known ? round(row.used) : null }))
  }));
}
