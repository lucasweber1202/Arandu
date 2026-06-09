/* ARANDU — modo público: remove sinais internos e mantém experiência premium */
(function(){
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const params=new URLSearchParams(location.search);
  const debug=params.has('debug')||localStorage.getItem('arandu.debug')==='true';
  const internalSelectors=['#governor-panel','#keyboard-hint','#session-summary','#copy-journey','#last-reserve','#exit-prompt','#section-index'];
  const optionalFloating=['#intent-score','#context-ribbon','#recent-intent-cta','#collector-mode','#quiet-mode','#compare-tray','#trust-seal'];
  function setMode(){document.body.classList.toggle('arandu-public-mode',!debug);document.body.classList.toggle('arandu-debug-mode',debug)}
  function hideInternal(){if(debug)return;internalSelectors.forEach(sel=>$$(sel).forEach(el=>{el.hidden=true;el.setAttribute('aria-hidden','true')}));const floating=optionalFloating.flatMap(sel=>$$(sel));floating.forEach((el,i)=>{if(i>2){el.classList.add('public-soft-hide');el.setAttribute('aria-hidden','true')}})}
  function labelExternalLinks(){ $$('a[href^="http"]').forEach(a=>{if(!a.rel)a.rel='noopener noreferrer';if(!a.target)a.target='_blank'}) }
  function preventEmptyButtons(){ $$('button').forEach((b,i)=>{if(!b.textContent.trim()&&!b.getAttribute('aria-label'))b.setAttribute('aria-label','Ação Arandu '+(i+1))}) }
  function stabilizeCtas(){ $$('.cta,.button,button').forEach(el=>{if(el.tagName==='BUTTON'&&!el.type)el.type='button'}) }
  function addPublicAudit(){const audit={page:location.pathname,debug,hiddenInternal:!debug,links:$$('a').length,buttons:$$('button').length,forms:$$('form').length,time:Date.now()};localStorage.setItem('arandu.public.audit',JSON.stringify(audit))}
  function observe(){const obs=new MutationObserver(()=>{clearTimeout(obs._t);obs._t=setTimeout(()=>{hideInternal();preventEmptyButtons();stabilizeCtas()},250)});obs.observe(document.body,{childList:true,subtree:true})}
  function run(){setMode();hideInternal();labelExternalLinks();preventEmptyButtons();stabilizeCtas();addPublicAudit();observe()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
