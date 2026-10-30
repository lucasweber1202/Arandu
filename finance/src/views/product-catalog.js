// Catálogo de produtos financeiros: taxonomia de navegação ligada às
// capacidades REAIS do Arandu. O nível de suporte de cada modalidade é
// derivado das fontes canônicas (produtos negociáveis, categorias de contrato
// com termos tipados e motores de estimativa) — nunca declarado à mão.
import { el, icon } from '../core.js';
import { drawer, tag } from '../ui.js';
import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { CONTRACT_CATEGORIES, SOURCING_CATEGORIES, contractTermFields } from '../../../lib/finance/contract-terms.mjs';

// Modalidade → categoria canônica de contrato (o que o Arandu sabe registrar).
export const FAMILIES = Object.freeze([
  { key: 'credit', label: 'Crédito e financiamento', items: [['Capital de giro', 'credit'], ['Conta garantida / rotativo', 'credit'], ['Financiamento de investimento', 'credit'], ['Leasing', 'credit'],
    ['Desconto de duplicatas e recebíveis', 'credit'], ['ACC / ACE', 'credit'], ['FINIMP', 'credit']] },
  { key: 'guarantee', label: 'Garantias', items: [['Fiança bancária', 'guarantee'], ['Carta de crédito', 'guarantee'], ['Standby letter of credit', 'guarantee'], ['Seguro garantia', 'guarantee']] },
  { key: 'payments', label: 'Pagamentos e recebíveis', items: [['Adquirência (cartões)', 'acquiring'], ['PIX para recebimento', 'acquiring'], ['Gateway de pagamento', 'acquiring'],
    ['Antecipação de recebíveis de cartão', 'acquiring'], ['Boletos e cobrança', 'cash_management']] },
  { key: 'treasury', label: 'Tesouraria e câmbio', items: [['Câmbio spot', 'fx'], ['Termo / NDF', 'fx'], ['Swap', 'fx'], ['Outros instrumentos de hedge', 'fx']] },
  { key: 'cash', label: 'Cash management', items: [['Serviços de conta e pacote de tarifas', 'cash_management'], ['Pagamentos corporativos (folha, fornecedores)', 'cash_management'],
    ['Gestão de liquidez e concentração de caixa', 'cash_management']] },
  { key: 'investments', label: 'Investimentos corporativos', items: [['CDB', 'other'], ['Operações compromissadas', 'other'], ['Fundos de investimento', 'other']] },
  { key: 'insurance', label: 'Seguros empresariais', items: [['Seguro empresarial', 'insurance']] }
]);

/** Níveis de suporte comprovados pelo código, do mais básico ao mais completo. */
export function supportFor(category) {
  const levels = [];
  if (CONTRACT_CATEGORIES[category]) levels.push({ key: 'contract', label: 'Contrato existente com termos estruturados', tone: 'neutral', ok: contractTermFields(category).length > 0 });
  if (SOURCING_CATEGORIES.includes(category) && PRODUCTS[category]) levels.push({ key: 'negotiate', label: 'Negociação com formulário próprio', tone: 'accent', ok: true });
  if (category === 'credit') levels.push({ key: 'compare', label: 'Comparação de custo total estimado das propostas', tone: 'success', ok: true });
  if (category === 'acquiring') levels.push({ key: 'compare', label: 'Estimativa de custo de processamento (MDR, PIX, fixos)', tone: 'success', ok: true });
  return levels.filter((level) => level.ok);
}

export function catalogEntries() {
  return FAMILIES.flatMap((family) => family.items.map(([label, category]) => ({ family: family.key, familyLabel: family.label, label, category, support: supportFor(category) })));
}

const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function openProductCatalog(ctx) {
  const entries = catalogEntries();
  const search = el('input', { type: 'search', placeholder: 'Buscar produto (ex.: fiança, PIX, capital de giro)', 'aria-label': 'Buscar produto financeiro' });
  const family = el('select', { 'aria-label': 'Família' }, [el('option', { value: '', text: 'Todas as famílias' }), ...FAMILIES.map((f) => el('option', { value: f.key, text: f.label }))]);
  const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const list = el('ul', { class: 'catalog-list', 'aria-label': 'Produtos financeiros' });
  const manage = ctx.can('create_rfq');
  const draw = () => {
    const term = normalize(search.value.trim());
    const visible = entries.filter((e) => (!family.value || e.family === family.value) && (!term || normalize(`${e.label} ${e.familyLabel}`).includes(term)));
    status.textContent = visible.length ? `${visible.length} ${visible.length === 1 ? 'modalidade' : 'modalidades'}.` : 'Nenhuma modalidade encontrada. Produtos fora do catálogo podem ser registrados como "Outro produto financeiro".';
    list.replaceChildren(...visible.map((e) => {
      const negotiable = e.support.some((s) => s.key === 'negotiate');
      return el('li', { class: 'catalog-item', dataset: { category: e.category, negotiable: String(negotiable) } }, [
        el('div', { class: 'stack-xs' }, [el('p', { class: 'muted small', text: e.familyLabel }), el('h3', { class: 'catalog-title', text: e.label }),
          el('p', { class: 'small', text: `Registrado como: ${CONTRACT_CATEGORIES[e.category]}.` }),
          el('div', { class: 'tag-row' }, e.support.map((s) => tag(s.label, s.tone))),
          !negotiable ? el('p', { class: 'muted small', text: 'Negociação no Arandu ainda não disponível para esta modalidade: registre o contrato existente para acompanhar prazos, condições e renovação. Sem cálculo econômico.' }) : null]),
        manage ? el('div', { class: 'row-actions' }, [
          negotiable ? el('a', { class: 'btn btn-primary btn-sm', href: ctx.href(`/finance/new-rfq.html?product=${e.category}`) }, [el('span', { class: 'btn-label', text: 'Iniciar negociação' }), icon('arrowRight', { size: 14 })]) : null,
          el('a', { class: 'btn btn-secondary btn-sm', href: ctx.href('/finance/contracts.html?acao=registrar-contrato') }, [el('span', { class: 'btn-label', text: 'Registrar contrato existente' })])
        ].filter(Boolean)) : null
      ].filter(Boolean));
    }));
  };
  search.addEventListener('input', draw);
  family.addEventListener('change', draw);
  draw();
  drawer({ title: 'Catálogo de produtos financeiros', subtitle: 'O que o Arandu já sabe registrar, negociar e comparar em cada modalidade. Estar no catálogo não significa ter cálculo econômico.',
    className: 'catalog-drawer', body: el('div', { class: 'stack' }, [el('div', { class: 'rel-filters' }, [search, family]), status, list]) });
  queueMicrotask(() => search.focus());
}
