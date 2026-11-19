#!/usr/bin/env node
// apt with an explicit failure class. Usage (as root, after configure-ci-apt):
//   node scripts/ci/apt-install.mjs --update-only
//   node scripts/ci/apt-install.mjs postgresql-client
// Exit codes are stable so a log or summary can tell infrastructure from product:
//   0 ok · 20 external_dependency (mirror/network) · 21 security (signature)
//   22 installation (package/dependency) · 23 capacity (disk/lock)
// It never ignores an error and never weakens signature checks.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAILURE_CLASSES = Object.freeze({
  external_dependency: 20,
  security: 21,
  installation: 22,
  capacity: 23
});

const RULES = [
  ['security', /NO_PUBKEY|BADSIG|The following signatures were invalid|is not signed|EXPKEYSIG|Hash Sum mismatch/i],
  ['capacity', /No space left on device|Could not get lock|Unable to acquire the dpkg frontend lock/i],
  ['external_dependency', /Network is unreachable|Resource temporarily unavailable|Could not resolve|Temporary failure resolving|connection timed out|Connection failed|Could not connect|Failed to fetch|Some index files failed to download|Cannot initiate the connection/i],
  ['installation', /Unable to locate package|has no installation candidate|Unmet dependencies|held broken packages|dpkg returned an error/i]
];

/** Classifies apt output. Pure; exported for tests. Order matters: security first. */
export function classifyAptFailure(output) {
  for (const [name, pattern] of RULES) if (pattern.test(output)) return name;
  return 'installation';
}

/** Hosts mentioned in failing fetch lines (no credentials can appear in apt URLs here). */
export function failingHosts(output) {
  const hosts = new Set();
  for (const line of String(output).split('\n')) {
    if (!/^(Err:|E: Failed to fetch|W: Failed to fetch)/.test(line.trim())) continue;
    for (const match of line.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(match[1].toLowerCase());
  }
  return [...hosts];
}

function run(argv) {
  const result = spawnSync('apt-get', argv, { encoding: 'utf8', env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  return { status: result.status ?? 1, output };
}

function fail(stage, output) {
  const failureClass = classifyAptFailure(output);
  const hosts = failingHosts(output);
  const detail = `apt ${stage} failed: class=${failureClass}${hosts.length ? ` hosts=${hosts.join(',')}` : ''}`;
  console.log(`::error title=CI_${failureClass.toUpperCase()}::${detail}`);
  console.log(`CI_FAILURE_CLASS=${failureClass}`);
  console.log(failureClass === 'external_dependency'
    ? 'Diagnóstico: o espelho/rede de pacotes do runner não respondeu. Não é regressão do produto; reexecute quando o serviço externo voltar. Nada foi ignorado.'
    : `Diagnóstico: ${detail}.`);
  process.exit(FAILURE_CLASSES[failureClass]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const packages = process.argv.slice(2).filter((arg) => arg !== '--update-only');
  if (!process.argv.includes('--update-only') && !packages.length) { console.error('Usage: apt-install.mjs --update-only | <package>...'); process.exit(2); }
  if (packages.some((name) => !/^[a-z0-9][a-z0-9.+-]*(=[A-Za-z0-9.+~:-]+)?$/.test(name))) { console.error('Invalid package name.'); process.exit(2); }
  const update = run(['update']);
  if (update.status !== 0) fail('update', update.output);
  if (packages.length) {
    const install = run(['install', '-y', '--no-install-recommends', ...packages]);
    if (install.status !== 0) fail('install', install.output);
  }
  console.log(`CI apt OK: ${packages.length ? packages.join(' ') : 'index update only'}`);
}
