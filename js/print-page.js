document.addEventListener('click', (event) => {
  if (event.target.closest('[data-print-page]')) window.print();
});
