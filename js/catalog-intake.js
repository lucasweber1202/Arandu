(function(){
  const core=globalThis.AranduCatalogIntakeCore;
  const textarea=document.querySelector('[data-catalog-csv]');
  const preview=document.querySelector('[data-catalog-preview]');
  if(!core||!textarea||!preview)return;
  const tokenInput=document.querySelector('[data-admin-token]');
  const fileInput=document.querySelector('[data-catalog-file]');
  let validated=[];
  const esc=(value)=>String(value??'').replace(/[&<>'"]/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const image=(data)=>{const src=data.main_image_url||data.image_url;return src?'<img class="op-import-thumb" src="'+esc(src)+'" alt="Prévia do registro">':'';};
  function render(list){
    validated=list;
    preview.innerHTML=list.length?list.map((entry)=>{
      const messages=[...entry.errors.map((message)=>({kind:'Erro',message})),...entry.warnings.map((message)=>({kind:'Pendência',message}))];
      return '<div class="op-import-row '+(entry.errors.length?'is-error':entry.warnings.length?'is-warning':'')+'">'+image(entry.item.data)+'<strong>Linha '+entry.index+' · '+esc(entry.item.panel)+'</strong><p>'+esc(entry.item.data.title||entry.item.data.name||'Sem título')+'</p>'+(messages.length?'<ul>'+messages.map((item)=>'<li><strong>'+item.kind+':</strong> '+esc(item.message)+'</li>').join('')+'</ul>':'<span>Elegível para revisão final</span>')+'</div>';
    }).join(''):'<div class="op-empty"><strong>Nenhum registro</strong><span>Confirme cabeçalhos e linhas do CSV.</span></div>';
  }
  function build(){return core.buildEntries(textarea.value);}
  async function send(){
    if(!validated.length)render(build());
    const token=tokenInput?.value.trim();if(!token){alert('Informe ARANDU_ADMIN_TOKEN para enviar.');return;}
    const valid=validated.filter((entry)=>!entry.errors.length);let ok=0,fail=0;
    for(const entry of valid){
      try{const response=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json','x-arandu-admin-token':token},body:JSON.stringify({panel:entry.item.panel,data:entry.item.data})});if(response.ok)ok++;else fail++;}catch{fail++;}
    }
    alert(`Envio concluído: ${ok} ok, ${fail} falhas. Registros com pendências continuam sujeitos à revisão editorial.`);
  }
  fileInput?.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;textarea.value=await file.text();render(build());});
  document.querySelector('[data-validate-catalog]')?.addEventListener('click',()=>render(build()));
  document.querySelector('[data-send-catalog]')?.addEventListener('click',send);
})();
