const state = { ambiente: '', momento: '', orcamento: '', sensacao: '' };

const suggestions = {
  ambiente: {
    casa: 'Ótimo. Agora escolha o momento: primeira obra, nova casa ou começar coleção?',
    apartamento: 'Perfeito. Para apartamento, vamos equilibrar escala, presença e orçamento. Escolha o momento da compra.',
    corporativo: 'Excelente. Para empresas, a próxima escolha é o objetivo: acolher, impactar, motivar ou representar a marca.',
    hospitalidade: 'Hospitalidade pede atmosfera. Agora escolha a sensação que o ambiente deve provocar.',
    presente: 'Presente autoral pede narrativa. Agora escolha uma faixa de orçamento confortável.'
  },
  momento: {
    primeira: 'A curadoria Primeira Obra vai sugerir opções de entrada em fotografia, pintura e escultura.',
    colecao: 'Vamos sugerir obras com maturidade, presença e continuidade de trajetória.',
    projeto: 'Vamos montar uma seleção pensada como proposta: ambiente, escala, prazo e orçamento.',
    inauguracao: 'Vamos priorizar obras marcantes, com história e boa presença visual.'
  },
  orcamento: {
    entrada: 'Nesta faixa, a curadoria prioriza fotografia, obras menores e primeiras pinturas com boa narrativa.',
    medio: 'Nesta faixa, já entram pinturas, fotografias de maior escala e esculturas de entrada.',
    alto: 'Nesta faixa, podemos priorizar presença, obra única, escala e artista em maturação.'
  },
  sensacao: {
    acolhimento: 'Buscaremos obras com matéria, silêncio e permanência.',
    movimento: 'Buscaremos obras com ritmo, gesto, cidade e energia visual.',
    reflexao: 'Buscaremos obras mais contemplativas, com camadas de leitura.',
    brasilidade: 'Buscaremos obras que dialogam com território, memória e linguagem brasileira contemporânea.'
  }
};

function updateRecommendation() {
  const target = document.querySelector('[data-context-result]');
  if (!target) return;

  const filled = Object.values(state).filter(Boolean).length;
  const next = filled < 4
    ? 'Continue escolhendo os cartões acima. A Arandu vai aproximando ambiente, intenção, orçamento e sensação.'
    : 'Sua curadoria inicial está pronta: veja obras sugeridas, salve uma seleção e fale com a curadoria.';

  const perfil = [state.ambiente, state.momento, state.orcamento, state.sensacao].filter(Boolean).join(' · ');
  target.innerHTML = `
    <p class="eyebrow">Próximo passo sugerido</p>
    <h2>${filled ? next : 'Comece escolhendo um ambiente.'}</h2>
    <p>${perfil ? `Perfil selecionado: ${perfil}.` : 'A escolha inicial muda as recomendações seguintes.'}</p>
    <div class="page-actions">
      <a class="cta" href="obras.html">Ver obras sugeridas</a>
      <a class="cta secondary" href="contato.html">Falar com a curadoria</a>
    </div>
  `;
}

document.addEventListener('click', (event) => {
  const option = event.target.closest('[data-context-option]');
  if (!option) return;
  const group = option.dataset.contextGroup;
  const value = option.dataset.contextOption;
  if (!group || !value) return;

  state[group] = value;
  document.querySelectorAll(`[data-context-group="${group}"]`).forEach((el) => el.classList.remove('is-selected'));
  option.classList.add('is-selected');

  const helper = document.querySelector('[data-context-helper]');
  const message = suggestions[group]?.[value];
  if (helper && message) helper.textContent = message;
  updateRecommendation();
});

document.addEventListener('DOMContentLoaded', updateRecommendation);
