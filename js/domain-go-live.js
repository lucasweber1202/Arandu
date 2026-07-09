(function(){
  const input=document.querySelector('[data-domain-input]');
  const dns=document.querySelector('[data-dns-plan]');
  const env=document.querySelector('[data-domain-env]');
  const checks=document.querySelector('[data-domain-checks]');
  const key='arandu.launch.domain';
  if(!input||!checks)return;
  input.value=localStorage.getItem(key)||'';
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function cleanDomain(){return String(input.value||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();}
  function origin(){const d=cleanDomain();return d?'https://'+d:location.origin;}
  function toast(text){const zone=document.querySelector('[data-toast-zone]'); if(!zone)return; const item=document.createElement('div');item.className='admin-toast';item.textContent=text;zone.appendChild(item);setTimeout(()=>item.remove(),3500);}
  function renderPlan(){const d=cleanDomain();localStorage.setItem(key,d);const root=d.replace(/^www\./,'');dns.innerHTML=d?'<p><strong>Domínio raiz:</strong> '+esc(root)+'</p><p><strong>www:</strong> www.'+esc(root)+'</p><p>No provedor de domínio, a Vercel normalmente indicará um registro A para o domínio raiz e CNAME para www. Siga exatamente o painel da Vercel.</p><p>Depois, em Vercel → Domains, defina o domínio principal e aguarde HTTPS.</p>':'<p>Informe o domínio para gerar instruções.</p>';env.textContent='ARANDU_SITE_URL='+origin()+'\nARANDU_CONTACT_EMAIL=contato@'+(root||'seudominio.com')+'\nARANDU_WHATSAPP_NUMBER=55DDNUMERO\n\nDepois de trocar domínio, atualize sitemap.xml e robots.txt com '+origin()+' se quiser SEO final imediato.';}
  function row(label,ok,text,url){return '<article class="op-quality-card"><strong>'+esc(ok?'OK':'!')+'</strong><h3>'+esc(label)+'</h3><p>'+esc(text)+'</p>'+(url?'<a class="tag" href="'+esc(url)+'" target="_blank" rel="noopener">Abrir</a>':'')+'</article>';}
  async function probe(label,path,expectText){const url=origin()+path;try{const res=await fetch(url,{cache:'no-store'});const text=await res.text();const ok=res.ok && (!expectText||text.includes(expectText));return {label,ok,text:ok?'Respondendo corretamente.':'Respondeu, mas não encontrou o conteúdo esperado.',url};}catch(e){return {label,ok:false,text:e.message||'Falha ao acessar.',url};}}
  async function run(){renderPlan();checks.innerHTML='<div class="op-empty"><strong>Validando</strong><span>Testando páginas e endpoints...</span></div>';const tasks=[probe('Home','/','Arandu'),probe('Comprar','/comprar-arte.html','Comprar'),probe('Artistas','/artistas.html','Artistas'),probe('Narrativa','/narrativa.html','Narrativa'),probe('Confiança','/confianca.html','Confiança'),probe('Sitemap','/sitemap.xml','urlset'),probe('Robots','/robots.txt','Sitemap'),probe('Health','/api/health','checks')];const results=await Promise.all(tasks);checks.innerHTML=results.map(r=>row(r.label,r.ok,r.text,r.url)).join('');toast('Checklist de domínio atualizado.');}
  document.querySelector('[data-save-domain]')?.addEventListener('click',()=>{renderPlan();toast('Domínio salvo localmente.');});
  document.querySelector('[data-run-domain-check]')?.addEventListener('click',()=>run());
  input.addEventListener('input',renderPlan);renderPlan();
})();
