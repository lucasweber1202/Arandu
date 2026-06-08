const QUIZ_KEY = 'arandu.quiz.v1';

const QUIZ_RECOMMENDATIONS = {
  fotografia: [
    { title: 'Sertão Silencioso', artist: 'Camila Rebouças', price: 'R$ 2.100', url: 'obra-sertao-silencioso.html', reason: 'Boa primeira compra para quem busca memória, silêncio e linguagem documental.', tag: 'Primeira obra' },
    { title: 'Botânica Efêmera', artist: 'Camila Rebouças', price: 'R$ 1.800', url: 'obras.html', reason: 'Obra de entrada com delicadeza, escala flexível e narrativa afetiva.', tag: 'Escala leve' }
  ],
  pintura: [
    { title: 'Estudo de Solo Nº 04', artist: 'Marina Silveira', price: 'R$ 4.200', url: 'obra-estudo-de-solo-04.html', reason: 'Pintura com presença de matéria, terra e contemplação.', tag: 'Matéria' },
    { title: 'Memória de Outono', artist: 'Marina Silveira', price: 'R$ 6.700', url: 'obras.html', reason: 'Obra de maior presença para quem quer densidade visual.', tag: 'Presença' }
  ],
  escultura: [
    { title: 'Equilíbrio Suspenso', artist: "Arthur D'Avila", price: 'R$ 8.900', url: 'obra-equilibrio-suspenso.html', reason: 'Escultura de tensão formal, indicada para quem busca presença material.', tag: 'Volume' },
    { title: 'Estrutura Urbana', artist: 'Lucas Mendes', price: 'R$ 3.400', url: 'obras.html', reason: 'Objeto de entrada com ritmo urbano e movimento.', tag: 'Movimento' }
  ]
};

function readQuiz() { try { return JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}'); } catch { return {}; } }
function writeQuiz(state) { localStorage.setItem(QUIZ_KEY, JSON.stringify(state)); }
function setQuizChoice(group, value) { const state = { ...readQuiz(), [group]: value }; writeQuiz(state); renderQuiz(state); }
function resetQuiz() { localStorage.removeItem(QUIZ_KEY); renderQuiz({}); }
function preferredLanguage(state) { if (state.linguagem) return state.linguagem; if (state.orcamento === 'entrada') return 'fotografia'; if (state.sensacao === 'movimento') return 'escultura'; return 'pintura'; }
function profileText(state) { const labels = { casa: 'casa', apartamento: 'apartamento', empresa: 'empresa', hospitalidade: 'hospitalidade', acolhimento: 'acolhimento', movimento: 'movimento', reflexão: 'reflexão', brasilidade: 'brasilidade', entrada: 'até R$ 3.000', intermediário: 'R$ 3.000 a R$ 7.000', 'maior presença': 'acima de R$ 7.000' }; const parts = []; if (state.ambiente) parts.push(`ambiente: ${labels[state.ambiente] || state.ambiente}`); if (state.sensacao) parts.push(`sensação: ${labels[state.sensacao] || state.sensacao}`); if (state.orcamento) parts.push(`orçamento: ${labels[state.orcamento] || state.orcamento}`); if (state.linguagem) parts.push(`linguagem: ${state.linguagem}`); return parts.length ? parts.join(' · ') : 'comece selecionando uma opção'; }
function nextStep(state) { if (!state.ambiente) return 'Escolha onde a obra vai viver.'; if (!state.sensacao) return 'Agora escolha a sensação desejada.'; if (!state.orcamento) return 'Defina uma faixa confortável de orçamento.'; if (!state.linguagem) return 'Escolha a linguagem que mais atrai primeiro.'; return 'A direção inicial está pronta. Compare as sugestões e salve o que fizer sentido.'; }
function scoreMatch(state, language) { let score = 62; if (state.linguagem === language) score += 18; if (state.orcamento === 'entrada' && language === 'fotografia') score += 8; if (state.sensacao === 'movimento' && language === 'escultura') score += 8; if (state.sensacao === 'acolhimento' && language === 'pintura') score += 6; return Math.min(score, 96); }

function renderQuiz(state = readQuiz()) {
  document.querySelectorAll('[data-quiz-option]').forEach((button) => {
    const active = state[button.dataset.quizGroup] === button.dataset.quizOption;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const result = document.querySelector('[data-quiz-result]');
  const progress = document.querySelector('[data-quiz-progress]');
  const helper = document.querySelector('[data-quiz-next]');
  const chosen = Object.values(state).filter(Boolean).length;
  if (progress) progress.style.width = `${Math.min(100, chosen * 25)}%`;
  if (helper) helper.textContent = nextStep(state);
  if (!result) return;

  const language = preferredLanguage(state);
  const works = QUIZ_RECOMMENDATIONS[language] || QUIZ_RECOMMENDATIONS.fotografia;
  const ready = chosen >= 3;
  const match = scoreMatch(state, language);

  result.innerHTML = `
    <p class="eyebrow">Resultado curatorial</p>
    <h2>${ready ? 'Sua direção inicial está clara.' : 'Sua curadoria está sendo formada.'}</h2>
    <div class="quiz-progress"><span style="width:${Math.min(100, chosen * 25)}%"></span></div>
    <div class="quiz-path"><span>${chosen}/4 escolhas</span><span>${match}% de aderência</span><span>${language}</span></div>
    <p><strong>Perfil:</strong> ${profileText(state)}</p>
    <div class="quiz-next"><strong>Próximo passo:</strong> ${nextStep(state)}</div>
    <div class="grid grid-2">
      ${works.map((work) => `
        <article class="card art-mark">
          <span class="tag">${work.tag}</span>
          <h3>${work.title}</h3>
          <p>${work.artist} · ${work.price}</p>
          <p>${work.reason}</p>
          <div class="page-actions"><a class="cta secondary" href="${work.url}">Ver obra</a><a class="cta secondary" href="minha-selecao.html">Abrir seleção</a></div>
        </article>`).join('')}
    </div>
    <article class="card art-mark">
      <h3>Leitura da curadoria</h3>
      <p>${language === 'fotografia' ? 'A fotografia aparece como entrada segura: tem escala flexível, preço mais acessível e narrativa direta.' : language === 'escultura' ? 'A escultura aparece como caminho de presença: funciona quando o espaço precisa de volume, sombra e materialidade.' : 'A pintura aparece como eixo principal: boa escolha quando a intenção é matéria, permanência e força visual.'}</p>
      <a class="cta secondary" href="contato.html">Pedir leitura humana da curadoria</a>
    </article>
    <div class="page-actions"><a class="cta" href="obras.html">Ver acervo</a><a class="cta secondary" href="minha-selecao.html">Montar seleção</a><button class="button secondary" type="button" data-quiz-reset>Refazer quiz</button></div>
  `;
}

document.addEventListener('click', (event) => {
  const option = event.target.closest('[data-quiz-option]');
  if (option) { event.preventDefault(); setQuizChoice(option.dataset.quizGroup, option.dataset.quizOption); }
  if (event.target.closest('[data-quiz-reset]')) { event.preventDefault(); resetQuiz(); }
});

document.addEventListener('DOMContentLoaded', () => renderQuiz());
