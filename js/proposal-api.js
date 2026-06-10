(function(){
  const API = '/api/proposals';
  const HISTORY_KEY = 'arandu.proposals.history.v1';

  function readArray(key){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[]}catch{return[]}}
  function writeArray(key,items){localStorage.setItem(key,JSON.stringify(items.slice(-80)))}
  function readObject(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}}
  function priceNumber(value){return Number(String(value||'').replace(/[^0-9]/g,''))||0}
  function total(items){return items.reduce((sum,item)=>sum+(Number(item.price)||priceNumber(item.priceLabel)),0)}
  function status(text){document.querySelectorAll('[data-proposal-status]').forEach((node)=>{node.textContent=text})}

  function payload(){
    const data=readObject('arandu.proposal.v1');
    const items=readArray('arandu.selection.v1');
    return {...data,items,total:total(items),generated_at:new Date().toISOString()};
  }

  async function save(){
    const body=payload();
    writeArray(HISTORY_KEY,[...readArray(HISTORY_KEY),{...body,local_id:`proposal_${Date.now()}`}]);
    try{
      const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json().catch(()=>({}));
      if(response.ok&&result.ok!==false){status(result.mode==='demo'?'Proposta preparada e salva neste navegador.':'Proposta registrada para a curadoria.');return true}
    }catch(_){/* fallback local */}
    status('Proposta salva neste navegador.');
    return false;
  }

  window.ARANDU_SAVE_PROPOSAL=save;
  document.addEventListener('click',(event)=>{
    if(event.target.closest('[data-proposal-copy]')||event.target.closest('[data-proposal-download]')||event.target.closest('[data-whatsapp="proposal"]')) save();
  });
})();
