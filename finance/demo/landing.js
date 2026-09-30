// Entrada da demonstração: entrar no produto primeiro, escolher o papel quando quiser.
/* global __ARANDU_DEMO__ */
import { resetWorkspace } from './workspace/preferences.js';
import { ROUTE, writeRoute } from './workspace/route.js';

const enabled = typeof __ARANDU_DEMO__ !== 'undefined' && __ARANDU_DEMO__ === true;

async function start() {
  const main = document.querySelector('#main');
  if (!enabled) {
    main.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Demonstração indisponível neste ambiente.' }));
    return;
  }
  const { createDemoEngine } = await import('./engine.js');
  const engine = createDemoEngine();
  // Explorar livremente (ou por papel) encerra o roteiro; "Ver processo completo" começa no passo 1.
  document.querySelector('#start-route')?.addEventListener('click', (event) => {
    event.preventDefault();
    engine.setPersona(ROUTE[0].persona);
    writeRoute(0);
    location.assign(`/demo${ROUTE[0].path}`);
  });
  for (const link of document.querySelectorAll('[data-persona]')) {
    link.addEventListener('click', (event) => {
      // Ctrl/⌘/Shift abrem em outra aba com a persona já escolhida.
      engine.setPersona(link.dataset.persona);
      writeRoute(null);
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      location.assign(link.getAttribute('href'));
    });
  }
  const reset = document.querySelector('#landing-reset');
  reset.hidden = false;
  reset.addEventListener('click', () => {
    if (!window.confirm('Restaurar os dados da demonstração? Tudo o que você criou nela será apagado deste navegador. Aparência e painel continuam.')) return;
    engine.reset();
    reset.textContent = 'Dados restaurados';
    reset.disabled = true;
  });
  const prefs = document.querySelector('#landing-reset-prefs');
  prefs.hidden = false;
  prefs.addEventListener('click', () => {
    resetWorkspace();
    prefs.textContent = 'Aparência restaurada';
    prefs.disabled = true;
  });
}
start();
