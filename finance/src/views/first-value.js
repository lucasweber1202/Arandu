// Primeiros passos por objetivo (lib/finance/first-value.mjs), carregado sob demanda pelo Início.
import { el, icon } from '../core.js';
import { linkButton } from '../ui.js';
import { FIRST_VALUE_GOALS, firstValueSteps, firstValueProgress, suggestedGoal } from '../../../lib/finance/first-value.mjs';

const GOAL_KEY = 'arandu:primeiro-valor:objetivo';
const STEP_STATE = { done: ['Concluído', 'check'], todo: ['A fazer', 'arrowRight'], unknown: ['Não verificado', 'info'], guide: ['Caminho', 'arrowRight'] };

// Primeiro valor por objetivo: os passos são do fluxo que já existe e o estado
// vem do que o servidor devolveu (lib/finance/first-value.mjs). A escolha do
// objetivo é só preferência deste navegador; nada é marcado como feito por ela.
export function firstValuePanel(ctx) {
  let goal = null;
  try { goal = localStorage.getItem(GOAL_KEY); } catch { /* sem storage: sugestão */ }
  if (!FIRST_VALUE_GOALS.some((item) => item.key === goal)) goal = suggestedGoal(ctx.data);
  const body = el('div', { class: 'first-value' });
  const render = () => {
    const steps = firstValueSteps(goal, ctx.data || {});
    const progress = firstValueProgress(steps);
    const chooser = el('div', { class: 'first-value-goals', role: 'radiogroup', 'aria-label': 'O que você quer conseguir primeiro?' }, FIRST_VALUE_GOALS.map((item) => {
      const active = item.key === goal;
      const option = el('button', { type: 'button', role: 'radio', 'aria-checked': String(active), tabindex: active ? '0' : '-1', class: `first-value-goal${active ? ' active' : ''}`, dataset: { goal: item.key } },
        [el('span', { class: 'first-value-goal-label', text: item.label }), el('span', { class: 'muted small', text: item.detail })]);
      option.addEventListener('click', () => choose(item.key));
      option.addEventListener('keydown', (event) => {
        const keys = FIRST_VALUE_GOALS.map((g) => g.key);
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        choose(keys[(keys.indexOf(goal) + delta + keys.length) % keys.length], true);
      });
      return option;
    }));
    const status = progress.unknown
      ? `${progress.done} de ${progress.total} passos confirmados; ${progress.unknown} não puderam ser verificados agora.`
      : progress.complete ? 'Todos os passos deste objetivo estão registrados.' : `${progress.done} de ${progress.total} passos confirmados pelo que está registrado.`;
    const next = progress.next;
    const allowed = (step) => !step.permission || ctx.can(step.permission);
    const nextAction = next && allowed(next) ? linkButton(next.state === 'unknown' ? `Conferir: ${next.title.toLowerCase()}` : next.title, ctx.href(next.path), { variant: 'primary', iconName: 'arrowRight', attrs: { 'data-first-value-next': next.key } }) : null;
    body.replaceChildren(...[
      chooser,
      el('p', { class: 'first-value-status', role: 'status', text: status }),
      el('ol', { class: 'onboarding', 'aria-label': 'Passos do objetivo' }, steps.map((step) => {
        const [label, iconName] = STEP_STATE[step.state];
        return el('li', { class: `onboarding-step${step.state === 'done' ? ' done' : ''}`, dataset: { step: step.key, state: step.state } }, [
          el('span', { class: 'onboarding-mark' }, icon(iconName, { size: 14 })),
          el('span', {}, [allowed(step) ? el('a', { href: ctx.href(step.path), text: step.title }) : el('span', { text: step.title }), el('span', { class: 'muted', text: ` — ${step.detail}` }),
            el('span', { class: `first-value-state state-${step.state}`, text: ` ${label}` })])
        ]);
      })),
      nextAction ? el('div', { class: 'first-value-next' }, [el('span', { class: 'next-step-kicker', text: 'Próximo passo' }), nextAction]) : null,
      el('p', { class: 'muted small', text: 'Nenhuma instituição precisa ter conta no Arandu para estes passos. O estado vem do que está registrado; abrir uma tela não conta como concluído.' })
    ].filter(Boolean));
  };
  const choose = (key, focus = false) => {
    goal = key;
    try { localStorage.setItem(GOAL_KEY, key); } catch { /* preferência opcional */ }
    render();
    if (focus) body.querySelector(`[data-goal="${key}"]`)?.focus();
  };
  render();
  return body;
}

