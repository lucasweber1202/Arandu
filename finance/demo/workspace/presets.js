// Presets de workspace: pontos de partida coerentes, não temas.
//
// Cada preset ajusta densidade, barra lateral, quanto detalhe secundário
// aparece e quais módulos do painel cada persona vê. Depois de aplicar, a
// pessoa pode mudar qualquer coisa; mexer à mão vira "Personalizado".

import { update, applyAppearance, readState } from './preferences.js';
import { DEFAULT_DASHBOARDS } from './personas.js';

const layout = (order, hidden, sizes = {}) => ({ order, hidden, sizes });
const ALL = ['attention', 'inflight', 'summary', 'pipeline', 'recent-rfqs', 'approvals', 'renewals', 'tasks', 'contracts', 'activity', 'providers', 'favorites', 'shortcuts', 'governance'];
const only = (visible, sizes = {}) => layout([...visible, ...ALL.filter((id) => !visible.includes(id))], ALL.filter((id) => !visible.includes(id)), sizes);

export const PRESETS = Object.freeze({
  balanced: { label: 'Equilibrado', text: 'O padrão: fila de trabalho, resumo e andamento.', appearance: { density: 'auto', sidebar: 'auto', detail: 'full' }, dashboards: null },
  compact: { label: 'Compacto', text: 'Alta densidade para quem opera o dia inteiro.', appearance: { density: 'compact', sidebar: 'compact', detail: 'full' }, dashboards: null },
  executive: { label: 'Executivo', text: 'Menos elementos: decisões pendentes e números que importam.', appearance: { density: 'comfortable', sidebar: 'compact', detail: 'essential' },
    dashboards: { buyer: only(['attention', 'inflight', 'renewals'], { inflight: 'full', renewals: 'full' }), approver: only(['attention', 'approvals', 'summary'], { approvals: 'full', summary: 'full' }), admin: only(['attention', 'governance', 'summary'], { governance: 'full', summary: 'full' }) } },
  operational: { label: 'Operacional', text: 'Prazos, processos, tarefas e filas, com todos os detalhes.', appearance: { density: 'compact', sidebar: 'expanded', detail: 'full' },
    dashboards: { buyer: only(['attention', 'inflight', 'pipeline', 'tasks', 'recent-rfqs', 'renewals', 'activity'], { inflight: 'full', pipeline: 'full' }), approver: only(['attention', 'approvals', 'inflight', 'pipeline', 'activity'], { approvals: 'full', inflight: 'full' }), admin: only(['attention', 'governance', 'tasks', 'providers', 'activity'], { governance: 'full' }) } }
});
export const PRESET_ORDER = ['balanced', 'compact', 'executive', 'operational'];

export function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return readState();
  const next = update((draft) => {
    Object.assign(draft.appearance, preset.appearance, { preset: key });
    draft.dashboard = preset.dashboards ? structuredClone(preset.dashboards) : {};
  });
  applyAppearance(next);
  return next;
}
export { DEFAULT_DASHBOARDS };
