const QUIZ_KEY = 'arandu.quiz.v1';

const QUIZ_RECOMMENDATIONS = {
  fotografia: [
    { title: 'Sertão Silencioso', artist: 'Camila Rebouças', price: 'R$ 2.100', url: 'obra-sertao-silencioso.html', reason: 'Boa primeira compra para quem busca memória, silêncio e linguagem documental.' },
    { title: 'Botânica Efêmera', artist: 'Camila Rebouças', price: 'R$ 1.800', url: 'obras.html', reason: 'Obra de entrada com delicadeza, escala flexível e boa narrativa afetiva.' }
  ],
  pintura: [
    { title: 'Estudo de Solo Nº 04', artist: 'Marina Silveira', price: 'R$ 4.200', url: 'obra-estudo-de-solo-04.html', reason: 'Pintura com presença de matéria, terra e contemplação.' },
    { title: 'Memória de Outono', artist: 'Marina Silveira', price: 'R$ 6.700', url: 'obras.html', reason: 'Obra de maior presença para quem quer densidade visual.' }
  ],
  escultura: [
    { title: 'Equilíbrio Suspenso', artist: "Arthur D'Avila", price: 'R$ 8.900', url: 'obra-equilibrio-suspenso.html', reason: 'Escultura de tensão formal, indicada para quem busca presença material.' },
    { title: 'Estrutura Urbana', artist: 'Lucas Mendes', price: 'R$ 3.400', url: 'obras.html', reason: 'Objeto de entrada com ritmo urbano e movimento.' }
  ]
};

function readQuiz() {
  try { return JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}'); } catch { return {}; }
}

function writeQuiz(state) {
  localStorage.setItem(QUIZ_KEY, JSON.stringify(state));
}

function setQuizChoice(group, value) {
  const state = { ...readQuiz(), [group]: value };
  writeQuiz(state);
  renderQuiz(state);
}

function preferredLanguage(state) {
  if (state.linguagem) return state.linguagem;
  if (state.orcamento === 'entrada') return 'fotografia';
  if (state.sensacao === 'movimento') return 'escultura';
  return 'pintura';
}

function profileText(state) {
  const parts = [];
  if (state.ambiente) parts.push(`ambiente ${state.ambiente}`);
  if (state.sensacao) parts.push(`sensação de ${state.sensacao}`);
  if (state.orcamento) parts.push(`orçamento ${state.orcamento}`);
  if (state.linguagem) parts.push(`interesse em ${state.linguagem}`);
  return parts.length ? parts.join(' · ') : 'comece selecionando uma opção';
}

function renderQuiz(state = readQuiz()) {
  document.querySelectorAll('[data-quiz-option]').forEach((button) => {
    const active = state[button.dataset.quizGroup] === button.dataset.quizOption;
    button.classList.toggle('is-selected', active);
  });

  const result = document.querySelector('[data-quiz-result]');
  if (!result) return;

  const chosen = Object.values(state).filter(Boolean).length;
  const language = preferredLanguage(state);
  const works = QUIZ_RECOMMENDATIONS[language] || QUIZ_RECOMMENDATIONS.fotografia;
  const ready = chosen >= 3;

  result.innerHTML = `
    <p class="eyebrow">Resultado curatorial</p>
    <h2>${ready ? 'Sua direção inicial está clara.' : 'Sua curadoria está sendo formada.'}</h2>
    <p><strong>Perfil:</strong> ${profileText(state)}</p>
    <div class="grid grid-2">
      ${works.map((work) => `
        <article class="card">
          <h3>${work.title}</h3>
          <p>${work.artist} · ${work.price}</p>
          <p>${work.reason}</p>
          <div class="page-actions"><a class="cta secondary" href="${work.url}">Ver obra</a><a class="cta secondary" href="minha-selecao.html">Salvar depois</a></div>
        </article>`).join('')}
    </div>
    <article class="card">
      <h3>Artista recomendado</h3>
      <p>${language === 'fotografia' ? 'Camila Rebouças' : language === 'escultura' ? "Arthur D'Avila" : 'Marina Silveira'} aparece como uma boa entrada para esse perfil.</p>
      <a class="cta secondary" href="artistas.html">Conhecer trajetórias</a>
    </article>
    <div class="page-actions"><a class="cta" href="obras.html">Ver acervo</a><a class="cta secondary" href="contato.html">Pedir leitura da curadoria</a></div>
  `;
}

document.addEventListener('click', (event) => {
  const option = event.target.closest('[data-quiz-option]');
  if (!option) return;
  event.preventDefault();
  setQuizChoice(option.dataset.quizGroup, option.dataset.quizOption);
});

document.addEventListener('DOMContentLoaded', () => renderQuiz());
