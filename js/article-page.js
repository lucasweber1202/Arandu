(function(){
  const root=document.querySelector('[data-article-page]');
  if(!root)return;
  const id=new URLSearchParams(location.search).get('id');
  function escapeHtml(value){return String(value||'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function setText(selector,value){const node=document.querySelector(selector);if(node&&value)node.textContent=value;}
  fetch('data/narrative.json',{cache:'no-store'})
    .then((res)=>res.json())
    .then((items)=>{
      const article=items.find((item)=>item.id===id)||items[0];
      if(!article)throw new Error('not found');
      document.title=article.title+' — Arandu';
      // O título do artigo assume o h1 do herói em vez de criar um segundo:
      // a página publicava dois h1, o do herói ("Leitura editorial.") e o do
      // texto, e nenhum leitor de tela sabia qual era o título da página.
      setText('[data-article-title]',article.title);
      setText('[data-article-summary]',article.summary);
      setText('[data-article-kicker]',[article.type,article.readTime].filter(Boolean).join(' · '));
      root.innerHTML='<article class="op-article-page">'
        +'<p><strong>'+escapeHtml(article.author)+'</strong></p>'
        +'<div class="op-article-body">'+(article.body||[]).map((paragraph)=>'<p>'+escapeHtml(paragraph)+'</p>').join('')+'</div>'
        +'<div class="page-actions"><a class="cta" href="narrativa.html">Voltar para Narrativa</a><a class="cta secondary" href="comprar-arte.html">Ver obras</a></div>'
        +'</article>';
    })
    .catch(()=>{
      root.innerHTML='<div class="op-empty"><strong>Artigo não encontrado</strong><span>Volte para Narrativa e escolha outro texto.</span></div>'
        +'<div class="page-actions"><a class="cta" href="narrativa.html">Ver todos os textos</a></div>';
    });
})();
