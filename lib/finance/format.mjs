// Formatação compartilhada pelos módulos puros (presenters do servidor e
// lógica de sinais da interface). Sem dependências: entra em qualquer chunk.

/** "2026-11-03" ou "2026-11-03T10:00:00Z" → "03/11/2026"; vazio → `empty`. */
export const brDay = (value, empty = '—') => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : empty);
