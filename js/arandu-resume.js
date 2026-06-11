/* Arandu — retomada de jornada */
(function(){
  const KEY='arandu.resume.v1';
  const SKIP=/^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  function page(){return location.pathname.split('/').pop()||'index.html'}
  function allowed(){return !SKIP.test(page())&&!document.querySelector('[data-resume-card]')}
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
  function write(data){localStorage.setItem(KEY,JSON.stringify(data))}
  function arr(key){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[]}catch{return[]}}
  function obj(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}}
  function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el}
  function next(){const selection=arr('arandu.selection.v1').length;const compare=arr('arandu.compare.v1').length;const briefing=Object.keys(obj('arandu.selection.briefing.v1')).length;const reservations=arr('arandu.reservation.status.v1').length;if(!selection)return['Explorar obras','obras.html'];if(selection>1&&!compare)return['Comparar seleção','comparar-obras.html'];if(briefing<2)return['Completar briefing','minha-selecao.html#briefing'];if(!reservations)return['Registrar interesse','obras.html'];return['Gerar proposta','proposta-curatorial.html']}
  function render(){if(!allowed())return;const last=read();if(!last.href||last.href===page())return;const main=document.querySelector('main');if(!main)return;const n=next();const section=make('section','arandu-resume-section');section.dataset.resumeCard='true';const container=make('div','container');const card=make('article','card arandu-resume-card');card.append(make('p','eyebrow','Retomar jornada'),make('h2',null,'Continue sua curadoria sem recomeçar.'));const p=make('p',null,'Você passou por '+(last.title||last.href)+'. Retome essa etapa ou avance para o próximo passo sugerido.');const actions=make('div','page-actions');const back=make('a','cta secondary','Voltar para '+(last.label||'última página'));back.href=last.href;const go=make('a','cta',n[0]);go.href=n[1];actions.append(back,go);card.append(p,actions);container.appendChild(card);section.appendChild(container);const first=main.querySelector('section');if(first)first.insertAdjacentElement('afterend',section);else main.prepend(section)}
  function remember(){if(SKIP.test(page()))return;const label=(document.querySelector('h1')?.textContent||document.title||page()).trim().slice(0,80);write({href:page()+location.search,title:label,label:label,at:new Date().toISOString()})}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(render,1500);setTimeout(remember,2200)});
})();
