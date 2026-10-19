// Resolve fixture context through the actor's real API session. Legal names
// repeat across visitor workspaces and are never global tenant identifiers.
export function rehearsalOrganizationId(response, { kind, legalName }) {
  if (response?.status !== 200 || response.data?.ok !== true || response.data.environment !== 'demo' || !Array.isArray(response.data.rows)) throw new Error('Demo organization context unavailable');
  const matches = response.data.rows.filter(row => row.kind === kind && row.legal_name === legalName);
  if (matches.length !== 1 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(matches[0].id)) throw new Error('Demo organization context absent or ambiguous');
  return matches[0].id;
}

export function rehearsalSqlFailure(stderr) {
  const state = String(stderr || '').match(/ERROR:\s+([A-Z0-9]{5})\b/)?.[1] || 'UNKNOWN';
  return `SQL probe failed (sqlstate ${state}); verify actor-scoped fixture context`;
}
