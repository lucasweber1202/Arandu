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
