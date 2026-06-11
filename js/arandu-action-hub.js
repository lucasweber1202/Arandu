/* Arandu — hub único de ações flutuantes */
(function(){
  const SKIP=/^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const ACTIONS=[
    {id:'guided',label:'Curadoria guiada',selector:'.arandu-guided-button'},
    {id:'journey',label:'Jornada',selector:'.arandu-journey-button'},
    {id:'help',label:'Ajuda',selector:'.arandu-help-button'},
    {id:'test',label:'Modo teste',selector:'.arandu-test-button'},
    {id:'top',label:'Topo',selector:'.arandu-top-button'}
  ];
  function page(){return location.pathname.split('/').pop()||'index.html'}
  function allowed(){return !SKIP.test(page())&&!document.querySelector('[data-action-hub]')}
  function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el}
  function ensureStyle(){if(document.getElementById('arandu-action-hub-style'))return;const style=document.createElement('style');style.id='arandu-action-hub-style';style.textContent='.arandu-action-hub{position:fixed;right:18px;bottom:18px;z-index:10003;display:grid;gap:10px;justify-items:end}.arandu-action-hub-toggle{border:1px solid rgba(127,47,40,.2);border-radius:999px;background:#7f2f28;color:#fff8ec;font-weight:900;box-shadow:0 20px 64px rgba(49,31,22,.18);padding:.82rem 1.05rem}.arandu-action-hub-panel{display:grid;gap:8px;width:min(230px,calc(100vw - 32px));padding:10px;border:1px solid rgba(127,47,40,.18);border-radius:20px;background:rgba(255,248,236,.98);box-shadow:0 24px 80px rgba(49,31,22,.18)}.arandu-action-hub-panel[hidden]{display:none}.arandu-action-hub-panel button{width:100%;border:1px solid rgba(127,47,40,.14);border-radius:14px;background:#fffaf0;color:#7f2f28;font-weight:900;text-align:left;padding:.72rem .8rem}body[data-action-hub-ready="true"] .arandu-help-button,body[data-action-hub-ready="true"] .arandu-journey-button,body[data-action-hub-ready="true"] .arandu-guided-button,body[data-action-hub-ready="true"] .arandu-top-button,body[data-action-hub-ready="true"] .arandu-test-button{opacity:0;pointer-events:none}@media(max-width:720px){.arandu-action-hub{right:12px;bottom:12px}}';document.head.appendChild(style)}
  function availableActions(){return ACTIONS.filter(function(action){return document.querySelector(action.selector)})}
  function trigger(action){const target=document.querySelector(action.selector);if(!target)return;if(action.id==='top'){window.scrollTo({top:0,behavior:'smooth'});return}target.click()}
  function render(){if(!allowed())return;const actions=availableActions();if(actions.length<2)return;ensureStyle();document.body.dataset.actionHubReady='true';const wrap=make('div','arandu-action-hub');wrap.dataset.actionHub='true';const panel=make('div','arandu-action-hub-panel');panel.hidden=true;actions.forEach(function(action){const btn=make('button',null,action.label);btn.type='button';btn.dataset.hubAction=action.id;btn.addEventListener('click',function(){panel.hidden=true;trigger(action)});panel.appendChild(btn)});const toggle=make('button','arandu-action-hub-toggle','Ações');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.addEventListener('click',function(){panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden))});wrap.append(panel,toggle);document.body.appendChild(wrap)}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(render,2300)});
  document.addEventListener('click',function(event){const hub=document.querySelector('[data-action-hub]');if(!hub)return;if(!event.target.closest('[data-action-hub]')){const panel=hub.querySelector('.arandu-action-hub-panel');const toggle=hub.querySelector('.arandu-action-hub-toggle');if(panel){panel.hidden=true}if(toggle){toggle.setAttribute('aria-expanded','false')}}});
})();
