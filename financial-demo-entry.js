// Entrada da Demo canônica (ARANDU_ENV=demo): o visitante escolhe uma persona
// e entra no PRODUTO REAL, autenticado pelo servidor (POST /api/auth/demo-login),
// num espaço de trabalho só dele. Nada aqui autentica, guarda senha ou decide
// papel: o servidor só oferece personas quando o ambiente é de demonstração e
// o papel vem do workspace gravado pelo seed (docs/demo/VISITOR_ISOLATION.md).
//
// Este arquivo só descreve, em linguagem de gente, o que cada persona encontra
// no dataset canônico (scripts/demo/seed.mjs). Persona que o servidor oferecer
// e que não estiver aqui aparece com nome e cargo, sem promessa de jornada.

const BUYER = 'buyer';
const PROVIDER = 'provider';

/** Chave da persona (lib/finance/demo-personas.mjs) → lado, papel e o que ela faz no dataset. */
export const PERSONA_GUIDE = {
  juliana: { side: BUYER, org: 'Vitta Foods', role: 'Gestão financeira', journey: 'Conduz as contratações: solicitações, convites, comparação de propostas, pedido de aprovação, decisão e contrato.' },
  helena: { side: BUYER, org: 'Vitta Foods', role: 'Administração · aprovadora', journey: 'Tem uma aprovação esperando por ela na nova linha de crédito e administra equipe e regra de aprovação.' },
  rafael: { side: BUYER, org: 'Vitta Foods', role: 'Análise', journey: 'Compara propostas, mantém o perfil financeiro e conclui tarefas. Não registra decisão nem contrato.' },
  carlos: { side: BUYER, org: 'Vitta Foods', role: 'Leitura', journey: 'Acompanha processos, contratos e tarefas sem alterar nada: veja o que fica indisponível para quem só lê.' },
  meridian: { side: PROVIDER, org: 'Meridian Financial', role: 'Instituição convidada', journey: 'Tem uma concorrência de capital de giro em coleta: prepara o rascunho e envia a proposta.' },
  atlas: { side: PROVIDER, org: 'Atlas Bank', role: 'Instituição convidada', journey: 'Acompanha a proposta enviada em duas versões para a nova linha de crédito.' },
  lumina: { side: PROVIDER, org: 'Lumina Pay', role: 'Instituição contratada', journey: 'Vê o histórico da proposta que virou o contrato de adquirência vigente.' },
  orbe: { side: PROVIDER, org: 'Orbe Capital', role: 'Instituição convidada', journey: 'Vê só os convites e as propostas da própria instituição.' },
  nexo: { side: PROVIDER, org: 'Nexo Payments', role: 'Instituição convidada', journey: 'Vê só os convites e as propostas da própria instituição.' }
};

const DESTINATION = { [BUYER]: '/finance/dashboard.html', [PROVIDER]: '/provider/index.html' };

const node = (tag, attrs = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === 'text') element.textContent = value;
    else element.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) element.append(child);
  return element;
};

/** Mensagem para cada recusa do servidor; nunca diz que entrou sem a resposta confirmar. */
function failureText(status, result, retryAfter) {
  if (status === 429) {
    const minutes = retryAfter > 0 ? Math.ceil(retryAfter / 60) : null;
    return `Muitas entradas em pouco tempo a partir desta rede. ${minutes ? `Tente de novo em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.` : 'Aguarde alguns minutos e tente de novo.'}`;
  }
  if (result?.code === 'demo_capacity') return result.error;
  if (status === 404) return 'A demonstração não está disponível neste endereço.';
  return result?.error || 'A demonstração não respondeu. Tente de novo em instantes.';
}

/**
 * Lista de personas recusada por limite (429): a entrada não some em silêncio.
 * Diz o motivo e quanto esperar; nada é tentado automaticamente.
 */
export function demoEntryWaiting(retryAfter) {
  return node('section', { class: 'demo-entry demo-entry-waiting', id: 'demonstracao', 'aria-labelledby': 'demo-entry-title' }, [
    node('p', { class: 'eyebrow', text: 'DEMONSTRAÇÃO' }),
    node('h2', { id: 'demo-entry-title', text: 'Conheça o Arandu por dentro' }),
    node('p', { class: 'demo-entry-status', role: 'status', 'data-tone': 'error', text: `${failureText(429, null, retryAfter)} Quem já está num workspace pode seguir usando "Trocar persona" no topo.` })
  ]);
}

/**
 * Monta a escolha de persona. `personas` vem do servidor ({key, name, title});
 * `enter(key)` faz o login real e devolve {ok, status, result}. `next` (já validado
 * pela página de login) é o link que trouxe o visitante.
 */
export function demoEntry(personas, { enter, next = null, navigate = (url) => location.assign(url) }) {
  const section = node('section', { class: 'demo-entry', id: 'demonstracao', 'aria-labelledby': 'demo-entry-title' });
  const status = node('p', { class: 'demo-entry-status', role: 'status', 'aria-live': 'polite' });
  // Ordem da jornada (gestão → aprovação → análise → leitura; quem responde ao vivo primeiro), não a do seed.
  const order = Object.keys(PERSONA_GUIDE);
  const known = personas.filter((persona) => PERSONA_GUIDE[persona.key]).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const other = personas.filter((persona) => !PERSONA_GUIDE[persona.key]);
  const buttons = [];
  const card = (persona) => {
    const guide = PERSONA_GUIDE[persona.key];
    const button = node('button', { type: 'button', class: 'demo-persona', 'data-persona': persona.key }, [
      node('span', { class: 'demo-persona-name', text: persona.name }),
      node('span', { class: 'demo-persona-meta', text: [persona.title, guide?.org].filter(Boolean).join(' · ') }),
      guide ? node('span', { class: 'demo-persona-role', text: guide.role }) : null,
      guide ? node('span', { class: 'demo-persona-journey', text: guide.journey }) : null
    ]);
    button.addEventListener('click', async () => {
      for (const item of buttons) item.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.dataset.tone = '';
      status.textContent = `Entrando como ${persona.name}…`;
      let outcome;
      try { outcome = await enter(persona.key); } catch { outcome = { ok: false, status: 0, result: null }; }
      if (outcome.ok) {
        status.textContent = `Sessão aberta como ${persona.name}. Carregando o workspace…`;
        // O link que trouxe o visitante vale se for do lado da persona (empresa → /finance, instituição → /provider).
        const side = guide?.side || BUYER;
        navigate(next && next.startsWith(side === PROVIDER ? '/provider/' : '/finance/') ? next : DESTINATION[side]);
        return;
      }
      status.dataset.tone = 'error';
      status.textContent = outcome.status === 0 ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.' : failureText(outcome.status, outcome.result, outcome.retryAfter);
      button.removeAttribute('aria-busy');
      for (const item of buttons) item.disabled = false;
    });
    buttons.push(button);
    return node('li', {}, button);
  };
  const group = (title, intro, list) => list.length ? node('div', { class: 'demo-entry-group' }, [
    node('h3', { text: title }), intro ? node('p', { class: 'demo-entry-intro', text: intro }) : null,
    node('ul', { class: 'demo-entry-list', role: 'list' }, list.map(card))
  ]) : null;
  section.append(...[
    node('p', { class: 'eyebrow', text: 'DEMONSTRAÇÃO' }),
    node('h2', { id: 'demo-entry-title', text: 'Conheça o Arandu por dentro' }),
    node('p', { class: 'lead', text: 'O Arandu organiza como uma empresa contrata produtos financeiros: a solicitação, as propostas das instituições, a aprovação, o contrato e as obrigações que vêm depois. Este é o produto real, com uma empresa e instituições fictícias. Escolha quem você quer ser.' }),
    node('ul', { class: 'demo-entry-facts', role: 'list' }, [
      node('li', { text: 'Dados fictícios: Vitta Foods e as instituições não existem; nenhum e-mail é enviado e nada sai do ambiente.' }),
      node('li', { text: 'Um espaço só seu: o que você criar, enviar ou aprovar fica gravado de verdade, não aparece para outros visitantes e expira automaticamente.' }),
      node('li', { text: 'Permissões reais: cada persona só vê e faz o que o papel dela permite.' }),
      node('li', { text: 'O Arandu não é banco: não concede crédito, não movimenta dinheiro e não escolhe a instituição. A decisão é sempre de quem usa.' })
    ]),
    group('Empresa compradora · Vitta Foods', 'Quem conduz, analisa, aprova e acompanha as contratações financeiras.', known.filter((persona) => PERSONA_GUIDE[persona.key].side === BUYER)),
    group('Instituições financeiras', 'Quem responde aos convites da Vitta pelo portal da instituição. Cada uma vê só o que é dela.', known.filter((persona) => PERSONA_GUIDE[persona.key].side === PROVIDER)),
    group('Outras personas', null, other),
    status,
    node('p', { class: 'fine', text: 'Para trocar de persona depois, use "Trocar persona" no topo do workspace; para sair, "Sair" no menu da sua conta. Quem já tem conta entra com e-mail e senha abaixo.' })
  ].filter(Boolean));
  return section;
}

/** Login real da persona: a sessão vem no cookie definido pelo servidor. */
export async function enterAsPersona(key) {
  const response = await fetch('/api/auth/demo-login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: key }) });
  const result = await response.json().catch(() => null);
  return { ok: response.ok && result?.authenticated === true, status: response.status, result, retryAfter: Number(response.headers.get('Retry-After')) || 0 };
}
