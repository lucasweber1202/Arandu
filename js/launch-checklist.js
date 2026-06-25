(() => {
  const root = document.querySelector('[data-launch-checklist]');
  if (!root) return;

  const labels = {
    technical: 'Infraestrutura',
    catalog: 'Catálogo',
    trust: 'Confiança',
    media: 'Mídia e marca'
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const flatten = (groups = {}) => Object.values(groups).flat();
  const doneCount = (items) => items.filter((item) => item.done).length;

  function renderSummary(payload) {
    const groups = payload.minimumLaunchCriteria || {};
    const items = flatten(groups);
    const done = doneCount(items);
    const total = items.length || 1;
    const percent = Math.round((done / total) * 100);

    const wrap = el('div', 'collector-guidance');
    const head = el('div');
    head.appendChild(el('p', 'eyebrow', 'Leitura de lançamento'));
    head.appendChild(el('h2', 'section-title', `${percent}% dos critérios mínimos marcados como prontos.`));
    head.appendChild(el('p', '', payload.recommendedNextAction || 'Atualize o checklist conforme as etapas forem concluídas.'));
    wrap.appendChild(head);

    const strip = el('div', 'launch-strip');
    Object.entries(groups).forEach(([key, list]) => {
      const card = el('article', doneCount(list) === list.length ? 'is-ready' : 'is-critical');
      card.appendChild(el('strong', '', `${doneCount(list)}/${list.length}`));
      card.appendChild(el('span', '', labels[key] || key));
      strip.appendChild(card);
    });
    wrap.appendChild(strip);
    root.appendChild(wrap);
  }

  function renderGroup(key, list) {
    const section = el('section', 'launch-checklist-group');
    section.appendChild(el('h3', '', labels[key] || key));
    const body = el('div', 'readiness-list');
    list.forEach((item) => {
      const row = el('p', item.done ? 'status-ok' : 'status-warn');
      row.textContent = `${item.done ? 'OK' : '!'} ${item.item}`;
      body.appendChild(row);
    });
    section.appendChild(body);
    return section;
  }

  function render(payload) {
    root.innerHTML = '';
    renderSummary(payload);
    const groups = payload.minimumLaunchCriteria || {};
    const grid = el('div', 'launch-checklist-grid');
    Object.entries(groups).forEach(([key, list]) => grid.appendChild(renderGroup(key, list)));
    root.appendChild(grid);

    if (Array.isArray(payload.implementedInRepository) && payload.implementedInRepository.length) {
      const done = el('div', 'collector-guidance');
      done.appendChild(el('p', 'eyebrow', 'Já implementado no repositório'));
      done.appendChild(el('h2', 'section-title', 'Base técnica pronta para operar o pré-lançamento.'));
      const list = el('div', 'readiness-list');
      payload.implementedInRepository.forEach((item) => list.appendChild(el('p', 'status-ok', `OK ${item}`)));
      done.appendChild(list);
      root.appendChild(done);
    }
  }

  function renderError(error) {
    root.innerHTML = '';
    const box = el('div', 'certificate-preview');
    box.appendChild(el('p', 'eyebrow', 'Checklist'));
    box.appendChild(el('h2', '', 'Não foi possível carregar o checklist.'));
    box.appendChild(el('p', '', error.message || 'Erro inesperado.'));
    root.appendChild(box);
  }

  fetch('data/launch-checklist.json', { cache: 'no-store' })
    .then((response) => response.json())
    .then(render)
    .catch(renderError);
})();
