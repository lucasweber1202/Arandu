// Links antigos do sandbox (/demo/...) numa Demo canônica: a demonstração agora é
// o próprio produto. Só oferece a entrada por persona quando o servidor a expõe
// (ARANDU_ENV=demo); em Produção esta página continua um 404 comum.
if (location.pathname.startsWith('/demo')) {
  fetch('/api/auth/demo-personas', { credentials: 'same-origin' }).then((response) => {
    if (!response.ok) return;
    const note = document.createElement('p');
    note.id = 'demo-moved';
    note.append('A demonstração agora é o próprio produto, com empresa e instituições fictícias. ');
    const link = document.createElement('a');
    link.href = '/login.html#demonstracao';
    link.className = 'button';
    link.textContent = 'Entrar na demonstração';
    const main = document.querySelector('#main');
    main.querySelector('.button')?.classList.add('ghost');
    main.querySelector('h1')?.after(note);
    note.after(link);
  }).catch(() => {});
}
