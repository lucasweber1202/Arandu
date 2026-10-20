// Visita guiada: uma etapa por vez, com link profundo (#etapa). Sem este
// script a página continua completa e navegável como documento longo.
const main = document.querySelector('#main');
const sections = [...main.querySelectorAll(':scope > section')];
const links = [...document.querySelectorAll('.tour-steps a[href^="#"]')];

function show(id, focus) {
  if (id === 'main') return; // link “Pular para o conteúdo”
  let target = sections.find((section) => section.id === id);
  const unknown = Boolean(id) && !target;
  target ||= sections[0];
  for (const section of sections) section.classList.toggle('is-current', section === target);
  for (const link of links) {
    if (link.getAttribute('href') === `#${target.id}`) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  }
  document.querySelector('.tour-missing')?.remove();
  if (unknown) {
    const note = Object.assign(document.createElement('p'), { className: 'tour-missing', role: 'status', textContent: 'Esta etapa não existe. Você está no início da visita.' });
    target.prepend(note);
  }
  if (focus) {
    const heading = target.querySelector('h1, h2');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
}

document.body.classList.add('tour-paged');
show(decodeURIComponent(location.hash.slice(1)), false);
window.addEventListener('hashchange', () => show(decodeURIComponent(location.hash.slice(1)), true));
