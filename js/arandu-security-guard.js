/* Arandu — segurança leve do front público */
(function(){
  const LOCAL_HOSTS=['localhost','127.0.0.1','0.0.0.0'];
  const SENSITIVE_KEYS=['SUPABASE_SERVICE_ROLE_KEY','supabase_service_role_key','ARANDU_ADMIN_TOKEN','arandu.admin.token','arandu.adminToken.v1'];
  const PERSONAL_DATA_KEYS=['arandu.leads.v1','arandu.formDrafts.v1','arandu.reservations.v1','arandu.reservation.status.v1','arandu.proposal.v1','arandu.public.proposal'];
  const PUBLIC_FORM_COOLDOWN='arandu.form.lastSubmitAt';
  function isLocal(){return LOCAL_HOSTS.includes(location.hostname)}
  function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el}
  function notify(text){let box=document.querySelector('[data-security-notice]');if(!box){box=make('div','arandu-security-notice');box.dataset.securityNotice='true';document.body.appendChild(box)}box.textContent=text;box.hidden=false;clearTimeout(box._timer);box._timer=setTimeout(function(){box.hidden=true},5200)}
  function clearKeys(storage,keys){try{keys.forEach(function(key){storage.removeItem(key)})}catch{}}
  function protectAdminToken(){
    if(isLocal())return;
    let removed=false;
    try{SENSITIVE_KEYS.forEach(function(key){if(localStorage.getItem(key))removed=true})}catch{}
    clearKeys(localStorage,SENSITIVE_KEYS);
    if(removed)notify('Credencial administrativa persistente removida deste navegador.');
  }
  function inspectLocalStorage(){
    try{SENSITIVE_KEYS.forEach(function(key){if(localStorage.getItem(key)){localStorage.removeItem(key);notify('Dado sensível removido do armazenamento local.')}})}catch{}
  }
  function clearLocalPersonalData(showNotice=true){
    clearKeys(localStorage,PERSONAL_DATA_KEYS);
    if(showNotice)notify('Dados pessoais locais removidos deste navegador.');
  }
  function addHoneypots(){document.querySelectorAll('form').forEach(function(form){if(form.dataset.securityReady==='true')return;form.dataset.securityReady='true';const trap=make('input');trap.type='text';trap.name='website';trap.autocomplete='off';trap.tabIndex=-1;trap.setAttribute('aria-hidden','true');trap.style.position='absolute';trap.style.left='-9999px';trap.style.opacity='0';form.appendChild(trap)})}
  function hasTrap(form){const trap=form.querySelector('input[name="website"]');return trap&&trap.value.trim().length>0}
  function tooSoon(){const last=Number(localStorage.getItem(PUBLIC_FORM_COOLDOWN)||0);return Date.now()-last<2500}
  function markSubmit(){localStorage.setItem(PUBLIC_FORM_COOLDOWN,String(Date.now()))}
  document.addEventListener('click',function(event){if(event.target.closest('[data-clear-local-personal-data]'))clearLocalPersonalData(true)});
  document.addEventListener('submit',function(event){const form=event.target;if(!(form instanceof HTMLFormElement))return;if(hasTrap(form)){event.preventDefault();notify('Envio bloqueado por proteção anti-spam.');return}if(tooSoon()){event.preventDefault();notify('Aguarde alguns segundos antes de enviar outro formulário.');return}markSubmit()},{capture:true});
  window.AranduPrivacy={clearLocalPersonalData:function(){clearLocalPersonalData(true)}};
  document.addEventListener('DOMContentLoaded',function(){protectAdminToken();inspectLocalStorage();addHoneypots();setTimeout(addHoneypots,1200)});
})();
