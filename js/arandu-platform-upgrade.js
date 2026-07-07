/* ARANDU — busca, intenção e formulários comerciais */
(function(){
  const INTERNAL=/^(painel|admin|demo|roadmap|configuracao)/i;
  const page=()=>window.location.pathname.split('/').pop()||'index.html';
  if(INTERNAL.test(page())) return;

  const works=[
    {title:'Estudo de Solo Nº 04',artist:'Marina Silveira',type:'pintura',price:'R$ 4.200',href:'obra.html?id=estudo-de-solo-04',context:'matéria, território e primeira coleção'},
    {title:'Sertão Silencioso',artist:'Camila Rebouças',type:'fotografia',price:'R$ 2.100',href:'obra.html?id=sertao-silencioso',context:'memória, sertão e faixa acessível'},
    {title:'Equilíbrio Suspenso',artist:"Arthur D'Avila",type:'escultura',price:'R$ 8.900',href:'obra.html?id=equilibrio-suspenso',context:'presença física, projeto e recepção'}
  ];
  const esc=(v)=>String(v||'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm=(v)=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  function bindCollectorSearch(){
    document.querySelectorAll('[data-collector-search]').forEach((box)=>{
      if(box.dataset.bound==='true') return;
      const input=box.querySelector('input');
      const target=document.querySelector(box.dataset.target||'[data-collector-results]');
      if(!input||!target) return;
      box.dataset.bound='true';
      const render=()=>{
        const q=norm(input.value);
        const list=(q?works.filter((w)=>norm(`${w.title} ${w.artist} ${w.type} ${w.context} ${w.price}`).includes(q)):works).slice(0,3);
        target.innerHTML=list.map((w)=>`<a class="collector-result" href="${esc(w.href)}"><small>${esc(w.type)} · ${esc(w.price)}</small><strong>${esc(w.title)}</strong><span>${esc(w.artist)} — ${esc(w.context)}</span></a>`).join('');
      };
      input.addEventListener('input',render);
      render();
    });
  }

  function bindForms(){
    document.querySelectorAll('[data-api-form]').forEach((form)=>{
      if(form.dataset.bound==='true') return;
      form.dataset.bound='true';
      form.addEventListener('submit',async(event)=>{
        event.preventDefault();
        const status=form.querySelector('[data-form-status]');
        const data=Object.fromEntries(new FormData(form).entries());
        const payload={type:form.dataset.apiForm,page:page(),data};
        if(status) status.textContent='Enviando...';
        try{
          const response=await fetch('/api/forms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
          const result=await response.json().catch(()=>({}));
          if(!response.ok) throw new Error(result.error||'Não foi possível enviar.');
          form.reset();
          if(status) status.textContent=result.mode==='demo'?'Recebido em modo demonstração. Quando o Supabase estiver configurado, este envio será salvo na base.':'Recebido. A curadoria vai analisar e retornar.';
        }catch(error){
          if(status) status.textContent=error.message||'Erro no envio.';
        }
      });
    });
  }

  function storeIntent(){
    document.addEventListener('click',(event)=>{
      const link=event.target.closest('a[href]');
      if(!link) return;
      const href=link.getAttribute('href')||'';
      if(/comprar-arte|obras|obra\.html|empresas|para-artistas|portal-artista|perfil/.test(href)){
        const events=JSON.parse(localStorage.getItem('arandu.intent.v1')||'[]');
        events.unshift({href,text:link.textContent.trim().slice(0,80),at:new Date().toISOString()});
        localStorage.setItem('arandu.intent.v1',JSON.stringify(events.slice(0,30)));
      }
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    bindCollectorSearch();
    bindForms();
    storeIntent();
  });
})();
