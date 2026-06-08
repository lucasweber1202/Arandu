/* ARANDU — comportamento global do site */
const SELECTION_KEY = 'arandu.selection.v1';

function getSelectionCount() {
  try { return JSON.parse(localStorage.getItem(SELECTION_KEY) || '[]').length; } catch { return 0; }
}

function markActiveLinks() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('a[href]').forEach((link) => {
    if (link.getAttribute('href') === page) link.classList.add('is-active');
  });
}

function addSelectionCounter() {
  const navs = document.querySelectorAll('.site-nav, .nav');
  navs.forEach((nav) => {
    if (!nav.querySelector('[data-selection-nav]')) {
      const link = document.createElement('a');
      link.href = 'minha-selecao.html';
      link.dataset.selectionNav = 'true';
      link.innerHTML = `Minha seleção (<span data-selection-count>${getSelectionCount()}</span>)`;
      nav.appendChild(link);
    }

    if (!nav.querySelector('[data-auth-nav]')) {
      const auth = document.createElement('span');
      auth.dataset.authNav = 'true';
      auth.innerHTML = '<a href="login.html">Entrar</a>';
      nav.appendChild(auth);
    }
  });
}

function setupMobileMenu() {
  const headerInner = document.querySelector('.header-inner');
  const nav = document.querySelector('.site-nav, .nav');
  if (!headerInner || !nav || document.querySelector('[data-mobile-menu-button]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-menu-button';
  button.dataset.mobileMenuButton = 'true';
  button.setAttribute('aria-expanded', 'false');
  button.textContent = 'Menu';

  const panel = document.createElement('div');
  panel.className = 'mobile-menu-panel';
  panel.hidden = true;
  panel.innerHTML = nav.innerHTML;

  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });

  headerInner.appendChild(button);
  document.querySelector('.site-header, .header')?.appendChild(panel);
}

document.addEventListener('DOMContentLoaded', () => {
  markActiveLinks();
  addSelectionCounter();
  setupMobileMenu();
});
