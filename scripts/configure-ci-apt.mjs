import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CI apt transport (Ubuntu 24.04 x64 GitHub-hosted runner only).
//
// History: the runner used to resolve Ubuntu packages through
// mirror+file:/etc/apt/apt-mirrors.txt, whose first entry was the Azure mirror.
// When that mirror failed, this script replaced every Ubuntu source with
// https://archive.ubuntu.com. In November 2026 the same runner image started
// running on AWS (run 44524490289: "Region: us-east-1, Cloud: AWS"), where
// archive.ubuntu.com/security.ubuntu.com timed out ("Network is unreachable",
// "Resource temporarily unavailable") while the runner's own cloud-local
// mirror list would have answered. Forcing one public host made every apt
// step depend on a single external endpoint.
//
// Now: every Ubuntu archive URI (the runner mirror list, azure.archive,
// archive.ubuntu.com, security.ubuntu.com) points to ONE Arandu mirror list
// that keeps the runner's mirrors first, in their original order, and appends
// the official archive and security hosts as fallbacks. apt's mirror method
// moves to the next entry when one fails. Suites, components and Signed-By
// stay untouched: package signatures are still verified against the Ubuntu
// archive keyring; nothing here adds trusted=yes or third-party repositories.

export const ARANDU_MIRROR_FILE = '/etc/apt/arandu-mirrors.txt';
export const RUNNER_MIRROR_FILE = '/etc/apt/apt-mirrors.txt';
export const OFFICIAL_FALLBACKS = Object.freeze(['https://archive.ubuntu.com/ubuntu/', 'http://security.ubuntu.com/ubuntu/']);

const UBUNTU_URI = /(?:mirror\+file:\/etc\/apt\/apt-mirrors\.txt|https?:\/\/(?:azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?)(?=[\s]|$)/g;

/** Rewrites only Ubuntu archive URIs to the Arandu mirror list. Idempotent. */
export function useMirrorList(source) {
  return source.replace(UBUNTU_URI, `mirror+file:${ARANDU_MIRROR_FILE}`);
}

/**
 * Runner mirrors first (order and metadata preserved, comments dropped), then
 * the official hosts not already listed. Only http(s) Ubuntu mirror URLs are
 * accepted from the runner file; anything else is ignored, never trusted.
 */
export function mirrorList(runnerMirrors = '') {
  const lines = String(runnerMirrors).split('\n').map((line) => line.trim())
    .filter((line) => /^https?:\/\/[a-z0-9.-]+\/ubuntu\/?(?:\t.*)?$/i.test(line));
  const seen = new Set(lines.map((line) => line.split('\t')[0].replace(/\/?$/, '/')));
  for (const url of OFFICIAL_FALLBACKS) if (!seen.has(url)) lines.push(url);
  return `${lines.join('\n')}\n`;
}

export const networkConfig = `Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
Acquire::ForceIPv4 "true";
APT::Update::Error-Mode "any";
`;

// Kept for callers/tests that still import the old name.
export const useUbuntuArchive = useMirrorList;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const os = fs.readFileSync('/etc/os-release', 'utf8');
  if (!/^ID=ubuntu$/m.test(os) || !/^VERSION_ID="24\.04"$/m.test(os) || process.arch !== 'x64') {
    throw new Error('CI apt preparation requires the pinned Ubuntu 24.04 x64 runner.');
  }
  const runner = fs.existsSync(RUNNER_MIRROR_FILE) ? fs.readFileSync(RUNNER_MIRROR_FILE, 'utf8') : '';
  const list = mirrorList(runner);
  fs.writeFileSync(ARANDU_MIRROR_FILE, list);
  const directory = '/etc/apt/sources.list.d';
  const files = ['/etc/apt/sources.list', ...fs.readdirSync(directory)
    .filter((name) => /\.(list|sources)$/.test(name)).map((name) => path.join(directory, name))];
  let changed = 0;
  for (const file of files.filter((file) => fs.existsSync(file))) {
    const source = fs.readFileSync(file, 'utf8');
    const updated = useMirrorList(source);
    if (source !== updated) { fs.writeFileSync(file, updated); changed++; }
  }
  fs.writeFileSync('/etc/apt/apt.conf.d/99-arandu-ci-network', networkConfig);
  const hosts = list.trim().split('\n').map((line) => new URL(line.split('\t')[0]).host);
  console.log(`CI apt: ${changed} source file(s) use ${ARANDU_MIRROR_FILE}; mirror order: ${hosts.join(' -> ')}; signed packages required, IPv4, bounded retries, strict index update.`);
}
