(function(){
  async function fromApi(code){
    try{
      const response=await fetch('/api/certificates?code='+encodeURIComponent(String(code||'').trim().toUpperCase()),{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data&&data.certificate)return data.certificate;
    }catch(_){/* fallback */}
    return null;
  }
  const previous=window.verifyCertificate;
  window.verifyCertificate=async function(code){
    return await fromApi(code) || (typeof previous==='function'?await previous(code):null);
  };
})();
