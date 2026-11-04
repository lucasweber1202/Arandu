// Capabilities secundárias carregadas sob demanda pelas telas da empresa.
// Cada tela pede só o que usa (`need`); o módulo fica em cache por sessão de
// página (código, nunca dados). Abrir Tarefas ou Notificações não baixa
// contratos, relacionamento, policy, integrações nem SSO.
const LAZY = {
  policy: () => import('../policy.js'),
  contractCenter: () => import('../contract-center.js'),
  relationship: () => import('../provider-relationship.js'),
  center: () => import('../relationship-center.js'),
  integrations: () => import('../integrations.js'),
  sso: () => import('../sso.js'),
  passport: () => import('../../../../lib/finance/passport.mjs')
};
export const mods = {};
export const need = (...keys) => Promise.all(keys.map(async (key) => { mods[key] ||= await LAZY[key](); }));
