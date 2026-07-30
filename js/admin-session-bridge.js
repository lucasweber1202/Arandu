/**
 * Ponte temporária para os painéis legados.
 *
 * O valor abaixo não é credencial e nunca é aceito pelo servidor. Ele apenas
 * mantém scripts antigos, que verificavam a existência de um marcador antes de
 * iniciar, funcionando enquanto cada painel é migrado para a sessão HttpOnly.
 */
(() => {
  const SESSION_HINT = 'cookie-session';
  ['arandu.admin.sessionHint', 'arandu.adminSessionHint.v1'].forEach((key) => {
    sessionStorage.setItem(key, SESSION_HINT);
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-admin-session-hint], [data-pilot-admin-session-hint], #admin-token').forEach((input) => {
      input.value = SESSION_HINT;
      input.hidden = true;
      input.setAttribute('aria-hidden', 'true');
      input.tabIndex = -1;
    });
    document.querySelectorAll('[data-admin-save-token], [data-admin-clear-token]').forEach((control) => {
      control.hidden = true;
    });
  });

  document.addEventListener('click', async (event) => {
    const logout = event.target.closest('[data-auth-logout]');
    if (!logout) return;
    event.preventDefault();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
    } finally {
      ['arandu.admin.sessionHint', 'arandu.adminSessionHint.v1'].forEach((key) => sessionStorage.removeItem(key));
      location.replace('/admin-login.html');
    }
  });
})();
