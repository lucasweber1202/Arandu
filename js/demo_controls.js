function aranduDemoLoad(){
  const item={id:'sertao-silencioso',title:'Sertão Silencioso',artist:'Camila Rebouças',context:'fotografia',url:'obra.html?id=sertao-silencioso',price:2100,priceLabel:'R$ 2.100'};
  window.localStorage.setItem('arandu.selection.v1',JSON.stringify([item]));
  window.localStorage.setItem('arandu.proposal.v1',JSON.stringify({client:'Clínica Horizonte',space:'Clínica',goal:'Acolhimento',budget:'R$ 8.000'}));
  document.querySelectorAll('[data-demo-status]').forEach(function(n){n.textContent='Demo carregada.'});
}
function aranduDemoReset(){['arandu.selection.v1','arandu.proposal.v1','arandu.reservations.v1','arandu.quiz.v1'].forEach(function(k){window.localStorage.removeItem(k)});document.querySelectorAll('[data-demo-status]').forEach(function(n){n.textContent='Demo limpa.'});}
document.addEventListener('click',function(e){var a=e.target.closest('[data-load-demo]');if(a){e.preventDefault();aranduDemoLoad();if(a.dataset.demoRedirect)location.href=a.dataset.demoRedirect}var b=e.target.closest('[data-reset-demo]');if(b){e.preventDefault();aranduDemoReset();}});
