const TRUTHY = new Set(['1', 'true', 'yes', 'sim']);

export function presentationModeEnabled(env = process.env) {
  const requested = TRUTHY.has(String(env.ARANDU_PRESENTATION_MODE || '').trim().toLowerCase());
  const deployment = String(env.VERCEL_ENV || '').trim().toLowerCase();
  return requested && deployment !== 'production';
}

export function assertPresentationModeIsSafe(env = process.env) {
  if (String(env.VERCEL_ENV || '').trim().toLowerCase() === 'production'
    && TRUTHY.has(String(env.ARANDU_PRESENTATION_MODE || '').trim().toLowerCase())) {
    throw new Error('ARANDU_PRESENTATION_MODE não pode ser ativado em produção.');
  }
  return presentationModeEnabled(env);
}

/** Tags que identificam o ambiente demonstrativo dentro de uma página. */
export const PRESENTATION_HEAD_ASSETS = '<meta name="arandu-presentation-mode" content="true"><link rel="stylesheet" href="/css/arandu-presentation.css?v=20260814-1">';
export const PRESENTATION_BODY_ASSETS = '<script src="/js/presentation-runtime.js?v=20260814-1" defer></script>';

/**
 * Marca uma página como demonstrativa.
 *
 * Usada nos dois caminhos que servem `demo.html` e `admin-preview.html`: a
 * função serverless `api/internal-page.js` e a cópia estática feita pelo build.
 * Precisa ser uma só implementação — quando a cópia estática existe em `dist/`
 * ela vence o rewrite do Vercel, e uma página sem o banner apagaria justamente
 * o aviso que torna a demonstração honesta.
 */
export function withPresentationAssets(source) {
  const html = String(source || '');
  if (html.includes('name="arandu-presentation-mode"')) return html;
  const withHead = html.includes('</head>')
    ? html.replace('</head>', `${PRESENTATION_HEAD_ASSETS}</head>`)
    : `${PRESENTATION_HEAD_ASSETS}${html}`;
  return withHead.includes('</body>')
    ? withHead.replace('</body>', `${PRESENTATION_BODY_ASSETS}</body>`)
    : `${withHead}${PRESENTATION_BODY_ASSETS}`;
}
