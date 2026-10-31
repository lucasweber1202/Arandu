// Catálogo de produtos financeiros: renderiza o registro canônico
// (GET /api/finance/product-registry, lib/finance/product-registry.mjs).
// Nomes, famílias, categorias e suporte vêm do servidor; o navegador não
// mantém taxonomia própria nem calcula nada.
import { el, icon } from '../core.js';
import { drawer, tag, button } from '../ui.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';

export const EXPECTED_REGISTRY = 'financial-product-registry-1';
// Linguagem de produto para os estados técnicos do registro.
export const SUPPORT_TEXT = Object.freeze({
  STRUCTURED: { label: 'Registrar contrato com condições estruturadas', tone: 'neutral' },
  RFQ_ENABLED: { label: 'Negociar no Arandu', tone: 'accent' },
  ECONOMICS_ENABLED: { label: 'Comparação econômica disponível', tone: 'success' },
  INTEGRATION_SUPPORTED: { label: 'Integração disponível', tone: 'info' }
});

const normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Valida o formato mínimo; resposta inesperada vira erro, nunca catálogo parcial silencioso. */
export function readRegistry(out) {
  if (!out || !Array.isArray(out.families) || !Array.isArray(out.modalities)) throw new Error('invalid_registry');
  return { version: out.version, families: out.families, modalities: out.modalities.filter((m) => m && m.code && m.name && Array.isArray(m.support)), notice: out.notice || '' };
}

export function openProductCatalog(ctx, { family: presetFamily = '' } = {}) {
  const body = el('div', { class: 'stack' }, el('p', { class: 'muted small', role: 'status', text: 'Carregando o catálogo…' }));
  drawer({ title: 'Catálogo de produtos financeiros', subtitle: 'O que o Arandu já sabe registrar, negociar e comparar em cada modalidade. Estar no catálogo não significa ter cálculo econômico.', className: 'catalog-drawer', body });
  const load = () => ctx.api('product-registry').then((out) => body.replaceChildren(...catalogBody(ctx, readRegistry(out), presetFamily))).catch(() => {
    body.replaceChildren(el('p', { class: 'callout callout-danger compact', role: 'alert', text: 'Não foi possível carregar o catálogo agora. Nenhuma modalidade foi presumida.' }),
      button('Tentar de novo', { size: 'sm', onClick: () => { body.replaceChildren(el('p', { class: 'muted small', role: 'status', text: 'Carregando o catálogo…' })); load(); } }));
  });
  load();
}

function catalogBody(ctx, registry, presetFamily) {
  const families = new Map(registry.families.map((f) => [f.code, f]));
  const search = el('input', { type: 'search', placeholder: 'Buscar produto (ex.: fiança, PIX, capital de giro)', 'aria-label': 'Buscar produto financeiro' });
  const family = el('select', { 'aria-label': 'Família' }, [el('option', { value: '', text: 'Todas as famílias' }), ...registry.families.map((f) => el('option', { value: f.code, text: f.name }))]);
  family.value = families.has(presetFamily) ? presetFamily : '';
  const status = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const list = el('ul', { class: 'catalog-list', 'aria-label': 'Produtos financeiros' });
  const manage = ctx.can('create_rfq');
  const draw = () => {
    const term = normalize(search.value.trim());
    const visible = registry.modalities.filter((m) => (!family.value || m.family === family.value) && (!term || normalize(`${m.name} ${families.get(m.family)?.name}`).includes(term)));
    status.textContent = visible.length ? `${visible.length} de ${registry.modalities.length} ${registry.modalities.length === 1 ? 'modalidade' : 'modalidades'}.` : 'Nenhuma modalidade encontrada. Produtos fora do catálogo podem ser registrados como "Outro produto financeiro".';
    list.replaceChildren(...visible.map((m) => {
      const negotiable = m.support.includes('RFQ_ENABLED') && m.rfq_product;
      const structured = m.support.includes('STRUCTURED');
      return el('li', { class: 'catalog-item', dataset: { code: m.code, negotiable: String(Boolean(negotiable)) } }, [
        el('div', { class: 'stack-xs' }, [el('p', { class: 'muted small', text: families.get(m.family)?.name || 'Família não informada' }), el('h3', { class: 'catalog-title', text: m.name }),
          structured ? el('p', { class: 'small', text: `Registrado como: ${CONTRACT_CATEGORIES[m.contract_category] || 'Outro produto financeiro'}.` }) : null,
          el('div', { class: 'tag-row' }, m.support.filter((s) => SUPPORT_TEXT[s]).map((s) => tag(SUPPORT_TEXT[s].label, SUPPORT_TEXT[s].tone))),
          m.economics?.note ? el('p', { class: 'muted small', text: `Como a comparação funciona: ${m.economics.note}` }) : null,
          !negotiable ? el('p', { class: 'muted small', text: structured ? 'Negociação no Arandu ainda não disponível para esta modalidade: registre o contrato existente para acompanhar prazos, condições e renovação. Sem cálculo econômico.' : 'Apenas descrita no catálogo: ainda sem condições estruturadas.' }) : null
        ].filter(Boolean)),
        manage ? el('div', { class: 'row-actions' }, [
          negotiable ? el('a', { class: 'btn btn-primary btn-sm', href: ctx.href(`/finance/new-rfq.html?product=${encodeURIComponent(m.rfq_product)}`) }, [el('span', { class: 'btn-label', text: 'Iniciar negociação' }), icon('arrowRight', { size: 14 })]) : null,
          structured ? el('a', { class: 'btn btn-secondary btn-sm', href: ctx.href('/finance/contracts.html?acao=registrar-contrato') }, [el('span', { class: 'btn-label', text: 'Registrar contrato existente' })]) : null
        ].filter(Boolean)) : null
      ].filter(Boolean));
    }));
  };
  search.addEventListener('input', draw);
  family.addEventListener('change', draw);
  draw();
  queueMicrotask(() => search.focus());
  return [
    registry.version !== EXPECTED_REGISTRY ? el('p', { class: 'callout callout-warning compact', role: 'note', text: 'O catálogo do servidor está numa versão que esta tela ainda não conhece. Os dados aparecem como recebidos; confira o suporte antes de agir.' }) : null,
    el('div', { class: 'rel-filters' }, [search, family]), status, list,
    registry.notice ? el('p', { class: 'muted small', text: registry.notice }) : null
  ].filter(Boolean);
}
