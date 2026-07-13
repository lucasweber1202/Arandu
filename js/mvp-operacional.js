(function(){
  const STORAGE_PREFIX='arandu.mvp.';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const money=(value)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  function toast(text){
    let zone=$('.mvp-toast-zone');
    if(!zone){zone=document.createElement('div');zone.className='mvp-toast-zone';document.body.appendChild(zone);}
    const item=document.createElement('div');item.className='mvp-toast';item.textContent=text;zone.appendChild(item);setTimeout(()=>item.remove(),3600);
  }
  async function postJson(url,payload){
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'Não foi possível registrar.');
    return data;
  }
  function bindForms(){
    $$('[data-mvp-form]').forEach((form)=>{
      form.addEventListener('submit',async(event)=>{
        event.preventDefault();
        const status=$('[data-mvp-status]',form);
        const submit=$('button[type="submit"]',form);
        const data=Object.fromEntries(new FormData(form).entries());
        const type=form.dataset.mvpForm||'contato';
        try{
          if(status){status.textContent='Enviando para a operação...';status.classList.remove('ok');}
          if(submit)submit.disabled=true;
          const result=await postJson('/api/forms',{type,page:'mvp-operacional',source_page:'mvp-operacional.html',data});
          if(status){status.textContent=result.stored?'Registrado no Supabase.':'Registrado em modo demonstração.';status.classList.add('ok');}
          form.reset();toast(type==='submissao-artista'?'Artista entrou no funil de curadoria.':'Entrada registrada no funil comercial.');
        }catch(error){if(status){status.textContent=error.message;status.classList.remove('ok');}toast(error.message);}finally{if(submit)submit.disabled=false;}
      });
    });
  }
  function bindReservationIntent(){
    const form=$('[data-mvp-reservation-form]');
    if(!form)return;
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const status=$('[data-mvp-status]',form);
      const data=Object.fromEntries(new FormData(form).entries());
      const artworkId=data.artwork_id||data.obra||'mvp-reserva-assistida';
      try{
        if(status)status.textContent='Solicitando reserva assistida...';
        const lead=await postJson('/api/forms',{type:'reserva-assistida',page:'mvp-operacional',source_page:'mvp-operacional.html',data});
        const reservation=await postJson('/api/reservations',{artwork_id:artworkId,name:data.nome||data.name,whatsapp:data.whatsapp,deadline:data.prazo||'48h',notes:data.mensagem||data.notes});
        if(status){status.textContent=(lead.stored||reservation.stored)?'Reserva registrada para acompanhamento.':'Reserva criada em modo demonstração.';status.classList.add('ok');}
        form.reset();toast('Reserva assistida criada.');
      }catch(error){if(status){status.textContent=error.message;status.classList.remove('ok');}toast(error.message);}
    });
  }
  function bindChecklist(){
    const buttons=$$('[data-mvp-check]');
    const progress=$('[data-mvp-progress] span')||$('.mvp-progress span');
    const label=$('[data-mvp-progress-label]');
    function key(button){return STORAGE_PREFIX+'check.'+(button.dataset.mvpCheck||button.textContent.trim()).toLowerCase().replace(/\s+/g,'-');}
    function refresh(){
      const done=buttons.filter((button)=>localStorage.getItem(key(button))==='1');
      buttons.forEach((button)=>button.classList.toggle('is-done',localStorage.getItem(key(button))==='1'));
      const pct=buttons.length?Math.round((done.length/buttons.length)*100):0;
      if(progress)progress.style.width=pct+'%';
      if(label)label.textContent=`${done.length}/${buttons.length} entregas concluídas · ${pct}%`;
    }
    buttons.forEach((button)=>button.addEventListener('click',()=>{localStorage.setItem(key(button),localStorage.getItem(key(button))==='1'?'0':'1');refresh();}));
    refresh();
  }
  function bindCalculator(){
    const calc=$('[data-mvp-calc]');
    if(!calc)return;
    const inputs=$$('[data-calc]',calc);
    const out=$('[data-calc-output]');
    function read(name){const el=inputs.find((input)=>input.dataset.calc===name);return Number(String(el?.value||0).replace(',','.'))||0;}
    function render(){
      const artists=read('artists'); const works=read('works'); const ticket=read('ticket'); const sales=read('sales'); const commission=read('commission')/100;
      const gross=ticket*sales; const arandu=gross*commission; const conversion=works?Math.min(100,(sales/works)*100):0; const worksPerArtist=artists?works/artists:0;
      if(out)out.innerHTML=`<b>${money(arandu)}</b><small>Comissão estimada Arandu no mês</small><div class="mvp-pill-row"><span class="mvp-pill">Receita bruta ${money(gross)}</span><span class="mvp-pill">Conversão ${conversion.toFixed(1).replace('.',',')}%</span><span class="mvp-pill">${worksPerArtist.toFixed(1).replace('.',',')} obras/artista</span></div>`;
    }
    inputs.forEach((input)=>input.addEventListener('input',render)); render();
  }
  function bindRoadmap(){
    $$('[data-mvp-week]').forEach((field)=>{
      const key=STORAGE_PREFIX+'week.'+field.dataset.mvpWeek;
      const saved=localStorage.getItem(key); if(saved)field.value=saved;
      field.addEventListener('input',()=>localStorage.setItem(key,field.value));
    });
  }
  function bindExport(){
    $$('[data-mvp-export]').forEach((button)=>button.addEventListener('click',()=>{
      const rows=[['tipo','chave','valor']];
      $$('[data-mvp-check]').forEach((item)=>rows.push(['checklist',item.dataset.mvpCheck||item.textContent.trim(),item.classList.contains('is-done')?'concluido':'aberto']));
      $$('[data-mvp-week]').forEach((item)=>rows.push(['roadmap','semana '+item.dataset.mvpWeek,item.value||'']));
      const csv=rows.map((row)=>row.map((cell)=>'"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='arandu-mvp-operacional.csv'; a.click(); URL.revokeObjectURL(url); toast('CSV do MVP exportado.');
    }));
  }
  function bindCopy(){
    $$('[data-copy-mvp]').forEach((button)=>button.addEventListener('click',async()=>{
      const target=$(button.dataset.copyMvp); const text=target?target.textContent:button.dataset.copyText;
      if(!text)return;
      try{await navigator.clipboard.writeText(text.trim());toast('Texto copiado.');}catch{toast('Não foi possível copiar automaticamente.');}
    }));
  }
  function renderPilotBlocks(){
    const target=$('[data-mvp-pilot-summary]'); if(!target)return;
    const blocks=[
      ['MVP fechado','10 a 15 artistas, 40 a 70 obras e reserva assistida antes do checkout completo.'],
      ['Curadoria como produto','Cada obra precisa de ficha técnica, leitura curatorial, faixa de preço e certificado.'],
      ['Venda acompanhada','A compra começa por reserva; o time confirma obra, certificado, frete e pagamento.'],
      ['Dados desde o início','Todo lead, submissão, reserva e briefing entra no Supabase ou no modo demonstração.'],
      ['Validação antes de escalar','Só automatizar checkout e catálogo aberto depois de medir interesse real.']
    ];
    target.innerHTML=blocks.map(([title,text])=>`<article class="mvp-card"><span class="mvp-kicker">MVP</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`).join('');
  }
  function init(){bindForms();bindReservationIntent();bindChecklist();bindCalculator();bindRoadmap();bindExport();bindCopy();renderPilotBlocks();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
