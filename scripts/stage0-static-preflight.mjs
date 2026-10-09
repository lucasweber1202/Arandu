#!/usr/bin/env node
/**
 * Credentials-free, READ-ONLY analysis of the Stage 0 database assignments.
 * It is intentionally NOT a substitute for consolidation:check, backups,
 * restore drills, hosted tests or production deployment evidence.
 */
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ACTIVE_SUPABASE_ASSIGNMENTS,
  CONSOLIDATION_TARGETS,
  PERMANENT_HOSTED_ENVIRONMENTS
} from '../lib/deployment-topology.mjs';

const KNOWN_STATUS = Object.freeze({
  no_assignment: 'NO_APPROVED_DATABASE',
  ambiguous_assignment: 'AMBIGUOUS_DATABASE_ASSIGNMENT',
  reused_assignment: 'SHARED_DATABASE_ASSIGNMENT',
  source_still_active: 'PLANNED_SOURCE_STILL_ASSIGNED_TO_OLD_ROLE'
});

export function inspectStaticStage0({
  assignments = ACTIVE_SUPABASE_ASSIGNMENTS,
  targets = CONSOLIDATION_TARGETS
} = {}) {
  const results = [];
  for (const environment of PERMANENT_HOSTED_ENVIRONMENTS) {
    const refs = assignments[environment] || [];
    const codes = [];
    if (refs.length === 0) codes.push(KNOWN_STATUS.no_assignment);
    if (refs.length > 1) codes.push(KNOWN_STATUS.ambiguous_assignment);
    const otherPermanent = PERMANENT_HOSTED_ENVIRONMENTS.filter(name => name !== environment);
    if (refs.some(ref => otherPermanent.some(name => (assignments[name] || []).includes(ref)))) {
      codes.push(KNOWN_STATUS.reused_assignment);
    }
    const target = targets[environment];
    if (target?.sourceRef && (assignments[target.sourceKind] || []).includes(target.sourceRef)) {
      codes.push(KNOWN_STATUS.source_still_active);
    }
    results.push({
      environment,
      assignment_count: refs.length,
      static_status: codes.length ? 'BLOCKED' : 'ASSIGNMENT_REGISTERED',
      reason_codes: [...new Set(codes)]
    });
  }
  return {
    schema_version: 1,
    scope: 'repository-topology-only',
    release_ready: false,
    environments: results,
    disclaimer: 'Static repository assessment only. It does not inspect live secrets, backup/restore evidence, migrations, or hosted readiness.'
  };
}

function asMarkdown(result) {
  return [
    '### Stage 0 — static deployment preflight (read-only)',
    '',
    '| Environment | Code-level assignment | Static result |',
    '| --- | --- | --- |',
    ...result.environments.map(entry =>
      `| ${entry.environment} | ${entry.assignment_count} active ref(s) | ${entry.static_status}${entry.reason_codes.length ? `: ${entry.reason_codes.join(', ')}` : ''} |`
    ),
    '',
    'This check uses repository metadata only; it neither reads secrets nor authorizes release.',
    'A BLOCKED result means that a production build cannot pass the current topology gate.',
    'Complete inventory, classified export, tested restore and reviewed cutover before changing active assignments.',
    'Use `npm run consolidation:check` and the hosted doctor for release evidence. Do not bypass `finance:env:check`.',
    ''
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = new Set(process.argv.slice(2));
  const result = inspectStaticStage0();
  if (args.has('--json')) console.log(JSON.stringify(result));
  else console.log(asMarkdown(result));
  if (args.has('--github-summary') && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, asMarkdown(result) + '\n', { encoding: 'utf8' });
  }
  if (args.has('--strict') && result.environments.some(item => item.static_status === 'BLOCKED')) {
    process.exitCode = 1;
  }
}
