/* ARANDU — loader público mínimo */
(function(){
  const version = '20260610-minimal-1';
  const page = location.pathname.split('/').pop() || 'index.html';
  const isInternal = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i.test(page);
  const layers = [
    { id: 'arandu-public-shell-css', src: 'css/arandu-public-shell.css?v=' + version, kind: 'css' },
    { id: 'arandu-architecture-js', src: 'js/arandu-architecture.js?v=' + version, kind: 'script' }
  ];
  const loaded = [];
  const failed = [];

  function base(src){ return String(src || '').split('?')[0]; }
  function assetAlreadyPresent(src){
    const wanted = base(src);
    const scripts = Array.from(document.scripts || []).some(function(el){ return base(el.getAttribute('src')).includes(wanted); });
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(function(el){ return base(el.getAttribute('href')).includes(wanted); });
    return scripts || links;
  }
  function addLayer(layer){
    if(document.getElementById(layer.id) || assetAlreadyPresent(layer.src)){
      loaded.push(layer.id);
      return;
    }
    if(layer.kind === 'css'){
      const el = document.createElement('link');
      el.id = layer.id;
      el.rel = 'stylesheet';
      el.href = layer.src;
      el.onload = function(){ loaded.push(layer.id); };
      el.onerror = function(){ failed.push(layer.id); };
      document.head.appendChild(el);
      return;
    }
    const el = document.createElement('script');
    el.id = layer.id;
    el.src = layer.src;
    el.defer = true;
    el.onload = function(){ loaded.push(layer.id); };
    el.onerror = function(){ failed.push(layer.id); };
    document.body.appendChild(el);
  }
  function run(){
    if(window.aranduLoader && window.aranduLoader.started) return;
    window.aranduLoader = { version: version, layers: layers, loaded: loaded, failed: failed, started: true, minimal: true };
    if(isInternal){
      document.body.dataset.aranduLoader = 'internal-skipped';
      return;
    }
    document.body.classList.add('arandu-loader-ready','arandu-public-loader');
    layers.forEach(addLayer);
    setTimeout(function(){
      document.body.dataset.aranduLayersLoaded = String(loaded.length);
      document.body.dataset.aranduLayersFailed = String(failed.length);
    }, 800);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
