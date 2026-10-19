import { digest, assertPublicBytes } from './publication-manifest.mjs';

export const STAGES = ['root', 'explore', 'financial-entry', 'dashboard', 'requests', 'invites', 'proposals', 'comparison', 'approval', 'contracts', 'tasks-renewals', 'provider', 'provider-proposal', 'areas', 'return'];
export function validateFlow(flow, sha) {
  if (flow.approved_sha !== sha || !Array.isArray(flow.steps) || flow.steps.length !== STAGES.length) throw new Error('Flow must be reviewed for the expected SHA and cover all stages');
  if (flow.steps[0].path !== '/' || !['/', '/demo/index.html'].includes(flow.steps.at(-1).path)) throw new Error('Journey must start at root and return to entry');
  flow.steps.forEach((s, i) => {
    const url = new URL(String(s.path), 'https://arandu.invalid');
    if (s.stage !== STAGES[i] || !/^\/(?!\/)/.test(s.path) || url.origin !== 'https://arandu.invalid' || !(url.pathname === '/' || url.pathname.endsWith('.html')) || typeof s.text !== 'string' || !s.text.trim()) throw new Error('Invalid flow stage');
    if (i && typeof s.selector !== 'string') throw new Error('Each navigation step needs a real link selector');
  });
}
export function validateManifest(m, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Expected full approved SHA is required');
  if (m?.schema !== 1 || m.application !== 'arandu' || m.commit !== sha || m.branch !== 'main') throw new Error('Published identity differs from approved main');
  if (!['browser-sandbox', 'informative-tour-with-browser-sandbox'].includes(m.modality) || m.datasource !== 'synthetic-fixtures' || m.backend_required !== false || m.canonical_hosted_m3 !== 'BLOCKED') throw new Error('Ambiguous static demo mode');
  if (m.modality === 'informative-tour-with-browser-sandbox' && !m.files?.['/demo/visita.html']) throw new Error('Declared tour is missing');
  if (!m.files?.['/index.html'] || !m.files?.['/demo/index.html'] || !Object.keys(m.files).some(p => p.endsWith('.js'))) throw new Error('Missing entry assets');
  if (Object.keys(m.files).length > 2500) throw new Error('Artifact inventory too large');
  for (const [p, f] of Object.entries(m.files)) {
    if (!/^\/[A-Za-z0-9_./-]+$/.test(p) || p.includes('..') || p.startsWith('//') || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > 20_000_000) throw new Error('Invalid artifact entry');
  }
}
export function verifyResponse(response, bytes, path, expected) {
  const text = bytes.toString();
  if ([401, 403, 407].includes(response.status) || /Authentication Required|Vercel Authentication|vercel\.com\/.*(?:login|sso)/i.test(text)) {
    const error = new Error('Anonymous access blocked'); error.code = 'ACCESS_BLOCKED'; throw error;
  }
  if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${path}`);
  const type = response.headers.get('content-type') || '';
  if (path.endsWith('.html') && (!type.includes('text/html') || !/<(?:title|body)\b/i.test(text) || !/Arandu/i.test(text))) throw new Error('Not Arandu HTML');
  if (/\.(js|css)$/.test(path) && (!(/\.css$/.test(path) ? /text\/css/ : /(?:java|ecma)script/).test(type) || /^\s*</.test(text))) throw new Error('Asset returned wrong content type');
  if (expected && (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)) throw new Error(`Artifact mismatch: ${path}`);
  assertPublicBytes(bytes);
}
export async function getPublic(base, path, fetcher = fetch) {
  let url = new URL(path, base);
  const seen = new Set();
  for (let hop = 0; hop < 6; hop++) {
    if (url.origin !== base.origin || url.username || url.password) throw new Error('Off-origin redirect refused');
    if (seen.has(url.href)) throw new Error('Redirect loop');
    seen.add(url.href);
    const response = await fetcher(url, { redirect: 'manual', credentials: 'omit', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect without Location');
      url = new URL(location, url); continue;
    }
    if (Number(response.headers.get('content-length')) > 20_000_000) throw new Error('Response too large');
    const chunks = []; let size = 0;
    for await (const chunk of response.body || []) { size += chunk.length; if (size > 20_000_000) throw new Error('Response too large'); chunks.push(Buffer.from(chunk)); }
    return { response, bytes: Buffer.concat(chunks), url: url.href };
  }
  throw new Error('Too many redirects');
}
