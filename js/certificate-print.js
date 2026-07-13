(function(){
  const sheet=document.querySelector('[data-certificate-sheet]'); if(!sheet)return;
  const codeInput=document.querySelector('[data-certificate-code]');
  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  async function sha(text){try{const data=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map((b)=>b.toString(16).padStart(2,'0')).join('');}catch{return btoa(unescape(encodeURIComponent(text))).slice(0,44);}}
  async function localCertificate(code){try{const res=await fetch('data/certificates.json',{cache:'no-store'});const items=await res.json();return items.find((item)=>String(item.code||'').toUpperCase()===String(code||'').toUpperCase())||null;}catch{return null;}}
  async function remoteCertificate(code){try{const res=await fetch('/api/certificates?code='+encodeURIComponent(code),{cache:'no-store'});const json=await res.json().catch(()=>({}));return res.ok?(json.certificate||json.item||null):null;}catch{return null;}}
  function field(label,value){return '<div><span>'+esc(label)+'</span><strong>'+esc(value||'A confirmar')+'</strong></div>';}
  function qrText(url){return '<div class="certificate-preview"><p class="eyebrow">QR textual de verificação</p><div style="font-family:monospace;border:1px dashed rgba(90,31,26,.35);border-radius:18px;padding:16px;word-break:break-all;background:#fff7ec">'+esc(url)+'</div><p>Use este link para gerar um QR final em ferramenta externa ou validar diretamente no navegador.</p></div>';}
  async function render(cert={}){
    const payload=cert.payload||{};
    const code=(cert.code||codeInput?.value||'ARD-2026-0001').toUpperCase().trim();
    const verify=location.origin+'/verificar-certificado.html?code='+encodeURIComponent(code);
    const title=payload.title||cert.artwork_title||cert.artwork_id||'Obra certificada';
    const artist=payload.artist||cert.artist_name||cert.artist_id||'Artista vinculado';
    const status=cert.verification_status||cert.status||'draft';
    const issueDate=cert.issued_at?new Date(cert.issued_at).toLocaleDateString('pt-BR'):'A emitir';
    const hash=cert.certificate_hash||await sha([code,title,artist,payload.technique,payload.dimensions,payload.year,cert.issued_to].filter(Boolean).join('|'));
    sheet.innerHTML='<div class="certificate-preview"><p class="eyebrow">Certificado de autenticidade</p><h1>Arandu</h1><p>Arte brasileira contemporânea com curadoria, território e procedência.</p></div><section class="admin-proposal-sheet"><p class="eyebrow">Código do certificado</p><h1>'+esc(code)+'</h1><h2>'+esc(title)+'</h2><p>Este certificado registra autoria declarada, ficha técnica, estado de emissão e vínculo público de verificação. A venda só deve avançar após conferência final de disponibilidade, imagem, condição e logística.</p><div class="op-quality-grid">'+[
      field('Artista',artist),field('Técnica',payload.technique||cert.technique),field('Dimensões',payload.dimensions||cert.dimensions),field('Ano',payload.year||cert.year),field('Edição',payload.edition||cert.edition||'Obra única / a confirmar'),field('Status',status),field('Emitido para',cert.issued_to||'Registro curatorial'),field('Data de emissão',issueDate)
    ].join('')+'</div><div class="admin-proposal-items"><article class="admin-proposal-item"><div class="admin-proposal-thumb"></div><div><p class="eyebrow">Notas curatoriais</p><p>'+esc(payload.certificate_notes||cert.certificate_notes||'Registro mínimo de procedência, autoria e ficha técnica para validação curatorial.')+'</p><p><strong>Hash:</strong></p><p style="font-family:monospace;word-break:break-all">'+esc(hash)+'</p></div></article></div>'+qrText(verify)+'<footer class="certificate-preview"><p>Assinatura curatorial: Arandu · Verificação pública: '+esc(verify)+'</p></footer></section>';
  }
  async function load(){const code=(codeInput?.value||'').trim(); if(!code){await render({code:'ARD-2026-0001'});return;} const cert=await remoteCertificate(code)||await localCertificate(code)||{code}; await render(cert);}
  document.querySelector('[data-load-certificate]')?.addEventListener('click',()=>load());
  document.querySelector('[data-print-certificate]')?.addEventListener('click',()=>window.print());
  codeInput?.addEventListener('input',()=>render({code:codeInput.value}));
  const queryCode=new URLSearchParams(location.search).get('code'); if(queryCode&&codeInput)codeInput.value=queryCode;
  load();
})();
