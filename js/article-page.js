(function(){
  const root=document.querySelector('[data-article-page]');
  if(!root)return;
  const id=new URLSearchParams(location.search).get('id');
  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  fetch('data/narrative.json',{cache:'no-store'}).then((res)=>res.json()).then((items)=>{const article=items.find((item)=>item.id===id)||items[0];if(!article)throw new Error('not found');document.title=article.title+' — Arandu';root.innerHTML='<article class="op-article-page"><p class="eyebrow">'+escapeHtml(article.type)+' · '+escapeHtml(article.readTime)+'</p><h1 class="title">'+escapeHtml(article.title)+'</h1><p class="lead">'+escapeHtml(article.summary)+'</p><p><strong>'+escapeHtml(article.author)+'</strong></p><div class="op-article-body">'+(article.body||[]).map((p)=>'<p>'+escapeHtml(p)+'</p>').join('')+'</div><div class="page-actions"><a class="cta" href="narrativa.html">Voltar para Narrativa</a><a class="cta secondary" href="comprar-arte.html">Ver obras</a></div></article>';}).catch(()=>{root.innerHTML='<div class="op-empty"><strong>Artigo não encontrado</strong><span>Volte para Narrativa e escolha outro texto.</span></div>';});
})();
