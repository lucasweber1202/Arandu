/* ARANDU — loader centralizado de camadas */
(function(){
  const version='20260609-4';
  const layers=[
    {id:'arandu-experience-js',src:`js/arandu-experience.js?v=${version}`,kind:'script',critical:true},
    {id:'arandu-advanced-js',src:`js/arandu-advanced.js?v=${version}`,kind:'script'},
    {id:'arandu-curation-lab-js',src:`js/arandu-curation-lab.js?v=${version}`,kind:'script'},
    {id:'arandu-final-300-js',src:`js/arandu-final-300.js?v=${version}`,kind:'script'},
    {id:'arandu-visual-governor-js',src:`js/arandu-visual-governor.js?v=${version}`,kind:'script'},
    {id:'arandu-public-mode-js',src:`js/arandu-public-mode.js?v=${version}`,kind:'script'},
    {id:'arandu-legal-footer-js',src:`js/arandu-legal-footer.js?v=${version}`,kind:'script'},
    {id:'arandu-experience-css',src:`css/arandu-experience.css?v=${version}`,kind:'css',critical:true},
    {id:'arandu-advanced-css',src:`css/arandu-advanced.css?v=${version}`,kind:'css'},
    {id:'arandu-curation-lab-css',src:`css/arandu-curation-lab.css?v=${version}`,kind:'css'},
    {id:'arandu-final-300-css',src:`css/arandu-final-300.css?v=${version}`,kind:'css'},
    {id:'arandu-visual-governor-css',src:`css/arandu-visual-governor.css?v=${version}`,kind:'css'},
    {id:'arandu-public-mode-css',src:`css/arandu-public-mode.css?v=${version}`,kind:'css'},
    {id:'arandu-legal-css',src:`css/arandu-legal.css?v=${version}`,kind:'css'}
  ];
  const loaded=[];
  const failed=[];
  function log(status,layer){const event={status,id:layer.id,src:layer.src,time:Date.now()};const list=JSON.parse(localStorage.getItem('arandu.loader.events')||'[]');list.push(event);localStorage.setItem('arandu.loader.events',JSON.stringify(list.slice(-180)))}
  function addLayer(layer){if(document.getElementById(layer.id)){loaded.push(layer.id);log('already-present',layer);return}if(layer.kind==='css'){const el=document.createElement('link');el.id=layer.id;el.rel='stylesheet';el.href=layer.src;el.onload=()=>{loaded.push(layer.id);log('loaded',layer)};el.onerror=()=>{failed.push(layer.id);log('failed',layer)};document.head.appendChild(el);return}const el=document.createElement('script');el.id=layer.id;el.src=layer.src;el.defer=true;el.onload=()=>{loaded.push(layer.id);log('loaded',layer)};el.onerror=()=>{failed.push(layer.id);log('failed',layer)};document.body.appendChild(el)}
  function run(){if(window.aranduLoader?.started)return;window.aranduLoader={version,layers,loaded,failed,started:true};document.body.classList.add('arandu-loader-ready');layers.forEach(addLayer);setTimeout(()=>{document.body.dataset.aranduLayersLoaded=String(loaded.length);document.body.dataset.aranduLayersFailed=String(failed.length)},1600)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
