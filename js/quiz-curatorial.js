const QUIZ_KEY = 'arandu.quiz.v1';
const QUIZ_SELECTION_KEY = 'arandu.selection.v1';

const FALLBACK_QUIZ_WORKS = [
  { id: 'sertao-silencioso', title: 'Sertão Silencioso', artist: 'Camila Rebouças', priceLabel: 'R$ 2.100', url: 'obra-sertao-silencioso.html', type: 'Fotografia', tags: ['fotografia', 'primeira-obra', 'memória'], moods: ['memória', 'acolhimento'], summary: 'Boa primeira compra para quem busca memória, silêncio e linguagem documental.' },
  { id: 'estudo-de-solo-04', title: 'Estudo de Solo Nº 04', artist: 'Marina Silveira', priceLabel: 'R$ 4.200', url: 'obra-estudo-de-solo-04.html', type: 'Pintura', tags: ['pintura', 'matéria', 'memória'], moods: ['acolhimento', 'reflexão'], summary: 'Pintura com presença de matéria, terra e contemplação.' },
  { id: 'equilibrio-suspenso', title: 'Equilíbrio Suspenso', artist: "Arthur D'Avila", priceLabel: 'R$ 8.900', url: 'obra-equilibrio-suspenso.html', type: 'Escultura', tags: ['escultura', 'volume', 'reflexão'], moods: ['presença'], summary: 'Escultura de tensão formal, indicada para quem busca presença material.' }
];

let QUIZ_ARTWORKS = FALLBACK_QUIZ_WORKS;

function escapeQuizHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function loadQuizArtworks() {
  try {
    const response = await fetch('data/artworks.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('artworks');
    const data = await response.json();
    QUIZ_ARTWORKS = Array.isArray(data) && data.length ? data : FALLBACK_QUIZ_WORKS;
  } catch {
    QUIZ_ARTWORKS = FALLBACK_QUIZ_WORKS;
  }
}

function readQuiz() { try { return JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}'); } catch { return {}; } }
function writeQuiz(state) { localStorage.setItem(QUIZ_KEY, JSON.stringify(state)); }
function setQuizChoice(group, value) { const state = { ...readQuiz(), [group]: value }; writeQuiz(state); renderQuiz(state); }
function resetQuiz() { localStorage.removeItem(QUIZ_KEY); renderQuiz({}); }
function readSelectionForQuiz() { try { return JSON.parse(localStorage.getItem(QUIZ_SELECTION_KEY) || '[]'); } catch { return []; } }
function writeSelectionForQuiz(items) { localStorage.setItem(QUIZ_SELECTION_KEY, JSON.stringify(items)); document.querySelectorAll('[data-selection-count]').forEach((node) => { node.textContent = String(items.length); }); }

function preferredLanguage(state) {
  if (state.linguagem) return state.linguagem;
  if (state.orcamento === 'entrada') return 'fotografia';
  if (state.sensacao === 'movimento') return 'escultura';
  return 'pintura';
}

function profileText(state) {
  const labels = { casa: 'casa', apartamento: 'apartamento', empresa: 'empresa', hospitalidade: 'hospitalidade', acolhimento: 'acolhimento', movimento: 'movimento', reflexão: 'reflexão', brasilidade: 'brasilidade', entrada: 'até R$ 3.000', intermediário: 'R$ 3.000 a R$ 7.000', 'maior presença': 'acima de R$ 7.000' };
  const parts = [];
  if (state.ambiente) parts.push(`ambiente: ${labels[state.ambiente] || state.ambiente}`);
  if (state.sensacao) parts.push(`sensação: ${labels[state.sensacao] || state.sensacao}`);
  if (state.orcamento) parts.push(`orçamento: ${labels[state.orcamento] || state.orcamento}`);
  if (state.linguagem) parts.push(`linguagem: ${state.linguagem}`);
  return parts.length ? parts.join(' · ') : 'comece selecionando uma opção';
}

function nextStep(state) {
  if (!state.ambiente) return 'Escolha onde a obra vai viver.';
  if (!state.sensacao) return 'Agora escolha a sensação desejada.';
  if (!state.orcamento) return 'Defina uma faixa confortável de orçamento.';
  if (!state.linguagem) return 'Escolha a linguagem que mais atrai primeiro.';
  return 'A direção inicial está pronta. Compare as sugestões e salve o que fizer sentido.';
}

function artworkText(artwork) {
  return `${artwork.type || ''} ${(artwork.tags || []).join(' ')} ${(artwork.moods || []).join(' ')} ${(artwork.spaces || []).join(' ')} ${(artwork.recommendedFor || []).join(' ')} ${artwork.search || ''}`.toLowerCase();
}

function scoreArtworkForQuiz(artwork, state) {
  const text = artworkText(artwork);
  let score = 40;
  if (state.linguagem && text.includes(state.linguagem)) score += 30;
  if (state.sensacao && text.includes(state.sensacao.replace('reflexão', 'reflex'))) score += 18;
  if (state.ambiente && text.includes(state.ambiente)) score += 14;
  if (state.orcamento === 'entrada' && Number(artwork.price || 0) <= 3000) score += 18;
  if (state.orcamento === 'intermediário' && Number(artwork.price || 0) > 3000 && Number(artwork.price || 0) <= 7000) score += 18;
  if (state.orcamento === 'maior presença' && Number(artwork.price || 0) > 7000) score += 18;
  if (state.sensacao === 'movimento' && text.includes('movimento')) score += 12;
  if (state.sensacao === 'acolhimento' && (text.includes('acolhimento') || text.includes('silencio'))) score += 12;
  if (state.sensacao === 'brasilidade' && (text.includes('territorio') || text.includes('memoria') || text.includes('terra'))) score += 12;
  return score;
}

function recommendedWorks(state) {
  return [...QUIZ_ARTWORKS]
    .map((artwork) => ({ ...artwork, quizScore: scoreArtworkForQuiz(artwork, state) }))
    .sort((a, b) => b.quizScore - a.quizScore || Number(a.price || 0) - Number(b.price || 0))
    .slice(0, 3);
}

function profileName(state) {
  if (state.ambiente === 'empresa' || state.ambiente === 'hospitalidade') return 'Perfil projeto / espaço público';
  if (state.orcamento === 'entrada') return 'Perfil primeira aquisição';
  if (state.sensacao === 'movimento') return 'Perfil presença e energia';
  return 'Perfil contemplativo e material';
}

function curatorialAdvice(state, language) {
  if (state.ambiente === 'empresa') return 'Priorize escala, circulação e o que a obra comunica para equipe e visitantes.';
  if (state.orcamento === 'entrada') return 'Comece por obras com escala flexível, documentação clara e leitura visual direta.';
  if (language === 'escultura') return 'Verifique base de apoio, altura, circulação e incidência de luz antes da reserva.';
  if (language === 'fotografia') return 'Observe edição, papel, moldura e como a imagem dialoga com memória e ambiente.';
  return 'Compare matéria, dimensão e luz do espaço; pinturas mudam bastante conforme distância de observação.';
}

function saveQuizSuggestion(id) {
  const artwork = QUIZ_ARTWORKS.find((item) => item.id === id);
  if (!artwork) return;
  const current = readSelectionForQuiz();
  if (current.some((item) => item.id === artwork.id)) return;
  const item = {
    id: artwork.id,
    title: artwork.title,
    artist: artwork.artist,
    context: (artwork.tags || []).slice(0, 3).join(' · ') || 'Sugestão do quiz curatorial',
    url: artwork.url || 'obras.html',
    note: 'Sugestão gerada pelo quiz curatorial.'
  };
  writeSelectionForQuiz([...current, item]);
}

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
  const works = recommendedWorks(state);
  const ready = chosen >= 3;
  const match = Math.min(98, Math.max(58, works[0]?.quizScore || 62));

  result.innerHTML = `
    <p class="eyebrow">Resultado curatorial</p>
    <h2>${ready ? 'Sua direção inicial está clara.' : 'Sua curadoria está sendo formada.'}</h2>
    <div class="quiz-progress"><span style="width:${Math.min(100, chosen * 25)}%"></span></div>
    <div class="quiz-path"><span>${chosen}/4 escolhas</span><span>${match}% de aderência</span><span>${escapeQuizHtml(profileName(state))}</span></div>
    <p><strong>Perfil:</strong> ${escapeQuizHtml(profileText(state))}</p>
    <div class="quiz-next"><strong>Próximo passo:</strong> ${escapeQuizHtml(nextStep(state))}</div>
    <div class="grid grid-2">
      ${works.map((work) => `
        <article class="card art-mark">
          <span class="tag">${escapeQuizHtml(work.type || 'Obra')}</span>
          <h3>${escapeQuizHtml(work.title)}</h3>
          <p>${escapeQuizHtml(work.artist)} · ${escapeQuizHtml(work.priceLabel || '')}</p>
          <p>${escapeQuizHtml(work.curatorialReading || work.summary || '')}</p>
          <div class="page-actions"><a class="cta secondary" href="${escapeQuizHtml(work.url || 'obras.html')}">Ver obra</a><button class="cta secondary" type="button" data-quiz-save="${escapeQuizHtml(work.id)}">Salvar sugestão</button></div>
        </article>`).join('')}
    </div>
    <article class="card art-mark">
      <h3>Leitura da curadoria</h3>
      <p>${escapeQuizHtml(curatorialAdvice(state, language))}</p>
      <a class="cta secondary" href="contato.html">Pedir leitura humana da curadoria</a>
    </article>
    <div class="page-actions"><a class="cta" href="obras.html">Ver acervo</a><a class="cta secondary" href="minha-selecao.html">Montar seleção</a><button class="button secondary" type="button" data-quiz-reset>Refazer quiz</button></div>
  `;
}

document.addEventListener('click', (event) => {
  const option = event.target.closest('[data-quiz-option]');
  if (option) { event.preventDefault(); setQuizChoice(option.dataset.quizGroup, option.dataset.quizOption); }
  const save = event.target.closest('[data-quiz-save]');
  if (save) { event.preventDefault(); saveQuizSuggestion(save.dataset.quizSave); save.textContent = 'Salvo na seleção'; }
  if (event.target.closest('[data-quiz-reset]')) { event.preventDefault(); resetQuiz(); }
});

document.addEventListener('DOMContentLoaded', async () => { await loadQuizArtworks(); renderQuiz(); });
