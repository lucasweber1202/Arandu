// Tenant-scoped navigation index. Call only with the current organization's API response.
// Keep financial terms out of analytics, persistent storage and URLs.
const fold = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function commandItems(data = {}) {
  const items = [
    { kind: 'Ação', title: 'Criar solicitação', href: '/finance/rfqs.html#rfq-form' },
    { kind: 'Ação', title: 'Cadastrar provedor', href: '/finance/providers.html' },
    { kind: 'Ação', title: 'Ver contratos', href: '/finance/contracts.html' }
  ];
  for (const rfq of data.rfqs || []) {
    if (!rfq.id) continue;
    const href = '/finance/rfq.html?id=' + encodeURIComponent(rfq.id);
    items.push({ kind: 'Solicitação', title: rfq.title || 'Solicitação', detail: rfq.status || '', href });
    for (const proposal of rfq.proposals || []) {
      items.push({
        kind: 'Proposta', title: proposal.provider_name || 'Proposta',
        detail: rfq.title || '', href
      });
    }
  }
  for (const provider of data.providers || []) {
    if (provider.name) items.push({ kind: 'Provedor', title: provider.name, detail: provider.region || '', href: '/finance/providers.html' });
  }
  for (const contract of data.contracts || []) {
    items.push({
      kind: 'Contrato', title: contract.provider_name || 'Contrato',
      detail: contract.ends_on || '', href: '/finance/contracts.html'
    });
  }
  for (const task of data.tasks || []) {
    if (task.title) items.push({ kind: 'Tarefa', title: task.title, detail: task.due_on || '', href: '/finance/dashboard.html' });
  }
  return items;
}

export function searchCommandItems(items, query, limit = 12) {
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.filter((item) => item.kind === 'Ação').slice(0, limit);
  return items
    .map((item, index) => {
      const title = fold(item.title);
      const haystack = fold([item.kind, item.title, item.detail].join(' '));
      if (!terms.every((term) => haystack.includes(term))) return null;
      return { item, index, rank: terms.every((term) => title.includes(term)) ? 0 : 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item);
}
