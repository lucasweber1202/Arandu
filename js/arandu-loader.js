/* ARANDU — loader seguro: mantém compatibilidade sem injetar camadas legadas */
(function(){
  window.aranduLoader={version:'20260709-safe-loader',started:true,minimal:true,layers:[],loaded:[],failed:[],disabledLegacyLayers:true};
  function forceVisible(){
    document.documentElement.style.opacity='1';
    document.documentElement.style.visibility='visible';
    if(document.body){document.body.style.opacity='1';document.body.style.visibility='visible';document.body.classList.add('arandu-loader-ready','arandu-safe-visible');}
    const main=document.querySelector('main');
    if(main){main.style.opacity='1';main.style.visibility='visible';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',forceVisible);else forceVisible();
  setTimeout(forceVisible,500);
})();
