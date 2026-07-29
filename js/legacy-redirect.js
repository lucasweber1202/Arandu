(() => {
  const target = document.body?.dataset.legacyRedirect;
  if (!target) return;
  window.setTimeout(() => {
    const destination = new URL(target, window.location.href);
    destination.search = window.location.search;
    destination.hash = window.location.hash;
    window.location.replace(destination.href);
  }, 250);
})();
