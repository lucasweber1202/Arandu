// Linha "Política v2 · regra · etapas" no contexto de um processo.

import { el, icon } from '../../../src/core.js';
import { readOS } from '../platform/os-store.js';
import { evaluatePolicy, policyVersion, rfqPolicyVersion } from './policy.js';

/** Política de aprovação que vale para este processo (versão em que começou). */
export function policyLine(ctx, rfq) {
  const policies = readOS().policies;
  const version = rfqPolicyVersion(policies, rfq.id);
  const policy = policyVersion(policies, version);
  if (!policy) return null;
  const outcome = evaluatePolicy(policy, rfq);
  return el('p', { class: 'policy-line', id: 'policy-line' }, [icon('workflow', { size: 14 }),
    el('span', { text: ` Política v${version}${outcome.rule ? ` · ${outcome.rule.name}: ${outcome.stages.map((stage) => stage.label).join(' → ')}` : ' · sem etapas exigidas'}.` }),
    version !== policies.current ? el('span', { class: 'muted', text: ` A atual é a v${policies.current}; este processo continua na versão em que começou.` }) : null,
    el('a', { href: ctx.href('/finance/policies.html'), text: ' Ver política' })]);
}
