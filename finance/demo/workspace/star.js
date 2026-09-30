// Estrela de favorito (solicitação, contrato, provedor): usada em várias telas,
// separada da tela de solicitação para que ela possa carregar sob demanda.

import { el, icon } from '../../src/core.js';
import { toast } from '../../src/ui.js';
import * as prefs from './preferences.js';

export function starButton(type, id, title, { compact = true, announce = () => {} } = {}) {
  const on = prefs.isFavorite(type, id);
  const node = el('button', { type: 'button', class: `${compact ? 'row-star' : 'icon-btn page-star'}${on ? ' is-on' : ''}`, 'aria-pressed': String(on), 'aria-label': `Favoritar ${title}`, title: on ? 'Remover dos favoritos' : 'Favoritar' }, icon('star', { size: compact ? 15 : 18 }));
  node.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = prefs.toggleFavorite(type, id, title);
    node.setAttribute('aria-pressed', String(next));
    node.classList.toggle('is-on', next);
    node.title = next ? 'Remover dos favoritos' : 'Favoritar';
    toast(next ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.', 'info');
    announce(next ? `${title} adicionado aos favoritos.` : `${title} removido dos favoritos.`);
  });
  return node;
}
