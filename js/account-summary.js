(function(){
  if((location.pathname.split('/').pop()||'')!=='minha-conta.html') return;
  function list(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
  function run(){
    var root=document.querySelector('[data-account-extra]');
    if(!root) return;
    var obras=list('arandu.selection.v1').length;
    var reservas=list('arandu.reservations.v1').length;
    var contatos=list('arandu.leads.v1').length;
    root.innerHTML='<div class="grid grid-3"><article class="card"><h3>'+obras+'</h3><p>Obras salvas neste navegador</p></article><article class="card"><h3>'+reservas+'</h3><p>Interesses em obras</p></article><article class="card"><h3>'+contatos+'</h3><p>Formulários enviados</p></article></div><article class="card"><h3>Próximo passo</h3><p>Continue por compradores, artistas ou pela seleção de obras.</p><div class="page-actions"><a class="cta" href="para-compradores.html">Sou comprador</a><a class="cta secondary" href="para-artistas.html#submissao">Sou artista</a><a class="cta secondary" href="minha-selecao.html">Minha seleção</a></div></article>';
  }
  document.addEventListener('DOMContentLoaded',run);
})();
