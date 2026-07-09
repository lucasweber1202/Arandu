(function(){
  const form=document.querySelector('[data-artwork-admin-form]'); if(!form)return;
  const status=document.querySelector('[data-admin-artwork-status]');
  const previewTitle=document.querySelector('[data-preview-title]');
  const previewSummary=document.querySelector('[data-preview-summary]');
  const previewImage=document.querySelector('[data-preview-image]');
  function esc(v){return String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function payload(){const fd=new FormData(form);const data=Object.fromEntries(fd.entries());const token=data.token;delete data.token;if(data.price)data.price=Number(String(data.price).replace(/\./g,'').replace(',','.'))||null;if(data.tags)data.tags=data.tags.split(',').map((x)=>x.trim()).filter(Boolean);return{token,data};}
  function updatePreview(){const {data}=payload();if(previewTitle)previewTitle.textContent=data.title||'Obra sem título';if(previewSummary)previewSummary.textContent=data.summary||'Preencha o formulário para visualizar o resumo.';if(previewImage){previewImage.innerHTML=data.image_url?'<img src="'+esc(data.image_url)+'" alt="'+esc(data.title||'obra')+'">':'';}}
  form.addEventListener('input',updatePreview);
  form.addEventListener('submit',async(event)=>{event.preventDefault();const {token,data}=payload();status.textContent='Enviando...';try{const res=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json','x-arandu-admin-token':token},body:JSON.stringify({panel:'obras',data})});const json=await res.json().catch(()=>({}));if(!res.ok||json.ok===false)throw new Error(json.error||'Falha ao cadastrar obra.');status.textContent='Obra cadastrada com sucesso.';form.reset();updatePreview();}catch(error){status.textContent=error.message;}});
  updatePreview();
})();
