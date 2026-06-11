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
  function availableActions(){return ACTIONS.filter(function(action){return document.querySelector(action.selector)})}
  function trigger(action){const target=document.querySelector(action.selector);if(!target)return;if(action.id==='top'){window.scrollTo({top:0,behavior:'smooth'});return}target.click()}
  function render(){if(!allowed())return;const actions=availableActions();if(actions.length<2)return;document.body.dataset.actionHubReady='true';const wrap=make('div','arandu-action-hub');wrap.dataset.actionHub='true';const panel=make('div','arandu-action-hub-panel');panel.hidden=true;actions.forEach(function(action){const btn=make('button',null,action.label);btn.type='button';btn.dataset.hubAction=action.id;btn.addEventListener('click',function(){panel.hidden=true;trigger(action)});panel.appendChild(btn)});const toggle=make('button','arandu-action-hub-toggle','Ações');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.addEventListener('click',function(){panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden))});wrap.append(panel,toggle);document.body.appendChild(wrap)}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(render,2300)});
  document.addEventListener('click',function(event){const hub=document.querySelector('[data-action-hub]');if(!hub)return;if(!event.target.closest('[data-action-hub]')){const panel=hub.querySelector('.arandu-action-hub-panel');const toggle=hub.querySelector('.arandu-action-hub-toggle');if(panel){panel.hidden=true}if(toggle){toggle.setAttribute('aria-expanded','false')}}});
})();
