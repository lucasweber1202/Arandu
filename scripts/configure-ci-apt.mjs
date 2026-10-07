import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only substitute the runner's failing Azure transport. Suites, components,
// Signed-By and Ubuntu's package signature verification remain unchanged.
export function useUbuntuArchive(source) {
  return source.replace(/https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu(?=[/\s]|$)/g, 'https://archive.ubuntu.com/ubuntu');
}

export const networkConfig = `Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
APT::Update::Error-Mode "any";
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const os = fs.readFileSync('/etc/os-release', 'utf8');
  if (!/^ID=ubuntu$/m.test(os) || !/^VERSION_ID="24\.04"$/m.test(os) || process.arch !== 'x64') {
    throw new Error('CI apt preparation requires the pinned Ubuntu 24.04 x64 runner.');
  }
  const directory = '/etc/apt/sources.list.d';
  const files = ['/etc/apt/sources.list', ...fs.readdirSync(directory)
    .filter((name) => /\.(list|sources)$/.test(name)).map((name) => path.join(directory, name))];
  let changed = 0;
  for (const file of files.filter((file) => fs.existsSync(file))) {
    const source = fs.readFileSync(file, 'utf8');
    const updated = useUbuntuArchive(source);
    if (source !== updated) { fs.writeFileSync(file, updated); changed++; }
  }
  fs.writeFileSync('/etc/apt/apt.conf.d/99-arandu-ci-network', networkConfig);
  console.log(`CI apt: official Ubuntu archive transport; ${changed} source files updated; signed packages required, bounded retries, strict index update.`);
}
