import { BASELINE_VERSION, workspaceEmail } from '../../lib/finance/demo-workspaces.mjs';
import { BUYERS, PROVIDERS } from '../../lib/finance/demo-personas.mjs';

// Synthetic metadata only. Does not provision accounts or a hosted workspace.
export function demoWorkspaceFixture(index = 1, extra = {}) {
  const id = n => `00000000-0000-4000-8000-${(index * 100 + n).toString(16).padStart(12, '0')}`;
  const slug = extra.slug ?? index.toString(16).padStart(10, '0');
  const people = [...Object.entries(BUYERS), ...Object.entries(PROVIDERS).map(([key, p]) => [key, p.person])];
  return { slug, status: 'ready', baseline_version: BASELINE_VERSION,
    buyer_organization_id: id(1), provider_organization_ids: Object.keys(PROVIDERS).map((_, i) => id(i + 2)),
    user_ids: people.map((_, i) => id(i + 20)), personas: Object.fromEntries(people.map(([key, p]) => [key, workspaceEmail(p.email, slug)])), ...extra };
}
