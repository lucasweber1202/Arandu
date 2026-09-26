// Entrada da demonstração: escolher a persona antes de abrir o produto.
/* global __ARANDU_DEMO__ */
const enabled = typeof __ARANDU_DEMO__ !== 'undefined' && __ARANDU_DEMO__ === true;

async function start() {
  const main = document.querySelector('#main');
  if (!enabled) {
    main.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Demonstração indisponível neste ambiente.' }));
    return;
  }
  const { createDemoEngine } = await import('./engine.js');
  const engine = createDemoEngine();
  for (const link of document.querySelectorAll('[data-persona]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      engine.setPersona(link.dataset.persona);
      location.assign(link.getAttribute('href'));
    });
  }
  const reset = document.querySelector('#landing-reset');
  reset.hidden = false;
  reset.addEventListener('click', () => {
    if (!window.confirm('Restaurar a demonstração? Tudo o que você criou nela será apagado deste navegador.')) return;
    engine.reset();
    reset.textContent = 'Demonstração restaurada';
    reset.disabled = true;
  });
}
start();
