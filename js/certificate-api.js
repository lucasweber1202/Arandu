(function(){
  function escapeCertificateApiHtml(value){return String(value||'').replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
  async function load(code){
    try{
      const response=await fetch('/api/certificates?code='+encodeURIComponent(String(code||'').trim().toUpperCase()),{cache:'no-store'});
      const data=await response.json().catch(function(){return{}});
      if(response.ok&&data&&data.certificate)return data.certificate;
    }catch(_){return null}
    return null;
  }
  function view(target,cert){
    if(!cert)return false;
    const payload=cert.payload||{};
    const artwork=cert.artworks||cert.artwork||{};
    const artist=artwork.artists||{};
    const title=artwork.title||payload.title||'Obra registrada';
    const name=artist.name||payload.artist||'Artista registrado';
    const issued=cert.issued_at?new Date(cert.issued_at).toLocaleDateString('pt-BR'):'—';
    target.innerHTML='<span class="certificate-status">'+escapeCertificateApiHtml(cert.verification_status==='valid'?'Certificado válido':cert.verification_status||'valid')+'</span><h3>'+escapeCertificateApiHtml(title)+'</h3><p class="certificate-code">'+escapeCertificateApiHtml(cert.code)+'</p><div class="certificate-grid"><p><strong>Artista</strong><br>'+escapeCertificateApiHtml(name)+'</p><p><strong>Técnica</strong><br>'+escapeCertificateApiHtml(artwork.technique||payload.technique||'—')+'</p><p><strong>Dimensões</strong><br>'+escapeCertificateApiHtml(artwork.dimensions||payload.dimensions||'—')+'</p><p><strong>Edição</strong><br>'+escapeCertificateApiHtml(artwork.edition||payload.edition||'—')+'</p><p><strong>Ano</strong><br>'+escapeCertificateApiHtml(artwork.year||payload.year||'—')+'</p><p><strong>Emissão</strong><br>'+escapeCertificateApiHtml(issued)+'</p></div><p><strong>Observação:</strong> '+escapeCertificateApiHtml(cert.certificate_notes||payload.certificate_notes||'Registro verificado na base Arandu.')+'</p><div class="page-actions"><button class="button secondary" type="button" data-print-certificate>Imprimir validação</button><a class="cta secondary" href="autenticidade.html">Entender autenticidade</a></div>';
    return true;
  }
  document.addEventListener('submit',async function(event){
    const form=event.target.closest('[data-certificate-form]');
    if(!form)return;
    const input=form.querySelector('[data-certificate-code]');
    const target=document.querySelector('[data-certificate-result]');
    const code=input&&input.value?input.value.trim().toUpperCase():'';
    if(!code||!target)return;
    const cert=await load(code);
    if(cert){event.preventDefault();event.stopImmediatePropagation();view(target,cert)}
  },true);
})();
