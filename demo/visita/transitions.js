// Entrada e visita optam pela transição entre documentos (@view-transition).
// Quando o navegador desiste dela (aba oculta, navegação interrompida, estado
// inválido), as promessas da transição rejeitam; sem tratamento, viram erro
// de página sem efeito para o visitante. A transição é só apresentação: aqui
// ela pode falhar em silêncio. `blocking="render"` garante o registro antes
// do primeiro quadro, quando `pagereveal` dispara.
function quiet(event) {
  const transition = event.viewTransition;
  if (!transition) return;
  for (const promise of [transition.ready, transition.finished, transition.updateCallbackDone]) promise?.catch(() => {});
}
window.addEventListener('pageswap', quiet);
window.addEventListener('pagereveal', quiet);
