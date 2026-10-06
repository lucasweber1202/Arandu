import { el } from '../core.js';
import { loading } from '../ui.js';
import { ledgerPage } from './ledger.js';

// Bank Fee Intelligence: textos, rótulos e formulários compostos no servidor
// (lib/api/domains/finance-fees.mjs), com linguagem segura testada em Node.
export const fees = (ctx) => ledgerPage(ctx, {
  resource: 'fees', title: 'Tarifas bancárias',
  subtitle: 'Tarifa contratada × cobrança observada, com fonte, comparabilidade e revisão humana. Diferença não é acusação nem economia.',
  filters: [['start', 'Período inicial', 'start'], ['end', 'Período final', 'end'], ['legal_entity_id', 'Entidade', 'entities'], ['provider_id', 'Provedor', 'providers'],
    ['category', 'Serviço/categoria'], ['contract_id', 'Contrato', 'contracts'], ['currency', 'Moeda'], ['review_status', 'Estado da revisão']]
});

/** Bloco factual para o painel do provedor: contagens e cobertura, sem score. */
export async function providerFeeFacts(ctx, providerId) {
  const box = el('section', { class: 'cc-section' }, [el('h3', { text: 'Tarifas: contratado × observado' }), loading()]);
  try {
    const data = await ctx.api(`fees/summary?${new URLSearchParams({ organization_id: ctx.organization.id, provider_id: providerId })}`);
    box.replaceChildren(box.firstChild, ...data.lines.map((text) => el('p', { class: 'small', text })), el('a', { href: `/finance/fees.html?provider_id=${encodeURIComponent(providerId)}`, text: 'Abrir tarifas deste provedor' }));
  } catch (error) { box.replaceChildren(box.firstChild, el('p', { class: 'muted', text: `Tarifas indisponíveis: ${error.message}` })); }
  return box;
}
