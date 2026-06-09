/* ARANDU — loader centralizado de produção limpa */
(function(){
  const version='20260609-clean-1';
  const layers=[
    {id:'arandu-public-mode-js',src:`js/arandu-public-mode.js?v=${version}`,kind:'script'},
    {id:'arandu-legal-footer-js',src:`js/arandu-legal-footer.js?v=${version}`,kind:'script'},
    {id:'arandu-architecture-js',src:`js/arandu-architecture.js?v=${version}`,kind:'script',critical:true},
    {id:'arandu-public-mode-css',src:`css/arandu-public-mode.css?v=${version}`,kind:'css'},
    {id:'arandu-legal-css',src:`css/arandu-legal.css?v=${version}`,kind:'css'},
    {id:'arandu-architecture-css',src:`css/arandu-architecture.css?v=${version}`,kind:'css',critical:true}
  ];
  const loaded=[];
  const failed=[];
  function log(status,layer){try{const event={status,id:layer.id,src:layer.src,time:Date.now()};const list=JSON.parse(localStorage.getItem('arandu.loader.events')||'[]');list.push(event);localStorage.setItem('arandu.loader.events',JSON.stringify(list.slice(-120)))}catch(_){}}
  function addLayer(layer){if(document.getElementById(layer.id)){loaded.push(layer.id);log('already-present',layer);return}if(layer.kind==='css'){const el=document.createElement('link');el.id=layer.id;el.rel='stylesheet';el.href=layer.src;el.onload=()=>{loaded.push(layer.id);log('loaded',layer)};el.onerror=()=>{failed.push(layer.id);log('failed',layer)};document.head.appendChild(el);return}const el=document.createElement('script');el.id=layer.id;el.src=layer.src;el.defer=true;el.onload=()=>{loaded.push(layer.id);log('loaded',layer)};el.onerror=()=>{failed.push(layer.id);log('failed',layer)};document.body.appendChild(el)}
  function run(){if(window.aranduLoader?.started)return;window.aranduLoader={version,layers,loaded,failed,started:true};document.body.classList.add('arandu-loader-ready','arandu-clean-loader');layers.forEach(addLayer);setTimeout(()=>{document.body.dataset.aranduLayersLoaded=String(loaded.length);document.body.dataset.aranduLayersFailed=String(failed.length)},1000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
