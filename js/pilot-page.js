(function () {
  const form = document.querySelector('[data-pilot-feedback]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-pilot-feedback-status]');
    status.textContent = 'Enviando feedback...';
    const fields = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/pilot/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, sessionId: window.ARANDU_PILOT?.sessionId(), contactAllowed: fields.contactAllowed === 'on' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Não foi possível enviar.');
      status.textContent = 'Feedback recebido. Obrigado por testar com atenção.';
      form.reset();
      window.ARANDU_PILOT?.track('pilot_task', { status: 'feedback_complete' });
    } catch (error) { status.textContent = error.message; }
  });
})();
