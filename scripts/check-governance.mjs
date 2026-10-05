#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const problems = [];

const requiredFiles = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.github/CODEOWNERS',
  '.github/pull_request_template.md',
  '.github/dependabot.yml',
  '.github/workflows/ci.yml',
  'docs/OPERATIONS_INDEX.md',
  'docs/BRANCH_PROTECTION.md',
  'docs/REPOSITORY_HYGIENE.md',
  'docs/VERSIONING.md',
  'ops/release-evidence.json',
  'package.json',
  'package-lock.json'
];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

for (const file of requiredFiles) {
  if (!exists(file)) problems.push(`${file}: arquivo obrigatório ausente.`);
}

if (exists('package.json') && exists('package-lock.json')) {
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const manifestVersion = String(packageJson.version || '');
  const lockVersion = String(packageLock.version || '');
  const rootLockVersion = String(packageLock.packages?.['']?.version || '');

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifestVersion)) {
    problems.push('package.json: version não segue SemVer.');
  }
  if (manifestVersion !== lockVersion || manifestVersion !== rootLockVersion) {
    problems.push('package.json e package-lock.json possuem versões divergentes.');
  }
  if (!packageJson.scripts?.['check:governance']) {
    problems.push('package.json: script check:governance ausente.');
  }
  if (!String(packageJson.scripts?.['check:all'] || '').includes('check:governance')) {
    problems.push('package.json: check:all não executa check:governance.');
  }
  // Hierarquia sem ciclo: check:all agrega; nenhum check agregado chama check:all
  // de volta (direta ou indiretamente por outro script npm).
  const scripts = packageJson.scripts || {};
  const invoked = (name) => [...String(scripts[name] || '').matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);
  const reachesAll = (name, seen = new Set()) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return invoked(name).some((child) => child === 'check:all' || reachesAll(child, seen));
  };
  for (const child of invoked('check:all')) {
    if (reachesAll(child)) problems.push(`package.json: ${child} chama check:all de volta (recursão).`);
  }
  if (!packageJson.scripts?.['audit:ci']) {
    problems.push('package.json: script audit:ci ausente.');
  }
}

if (exists('README.md')) {
  const readme = read('README.md');
  const requiredSections = [
    '## Estado operacional',
    '## Validação local',
    '## Governança do repositório',
    '## Critério de lançamento'
  ];
  for (const section of requiredSections) {
    if (!readme.includes(section)) problems.push(`README.md: seção obrigatória ausente: ${section}.`);
  }
  if (readme.includes('Os Sprints 1 a 5 estão implementados no código')) {
    problems.push('README.md: resumo histórico desatualizado voltou a ser publicado.');
  }
  if (!readme.includes('ops/release-evidence.json')) {
    problems.push('README.md: fonte oficial dos gates não está referenciada.');
  }
}

if (exists('.github/workflows/ci.yml')) {
  const ci = read('.github/workflows/ci.yml');
  if (!/permissions:\s*\n\s+contents:\s*read/.test(ci)) {
    problems.push('.github/workflows/ci.yml: permissões mínimas contents: read ausentes.');
  }
  if (!ci.includes('npm run audit:ci')) {
    problems.push('.github/workflows/ci.yml: auditoria de dependências não é executada.');
  }
  if (!ci.includes('npm run check:all')) {
    problems.push('.github/workflows/ci.yml: suíte completa não é executada.');
  }
  if (!ci.includes('persist-credentials: false')) {
    problems.push('.github/workflows/ci.yml: checkout mantém credenciais sem necessidade.');
  }
  // Otimizar minutos não pode encolher a cobertura final: os dois jobs com
  // navegador instalam os três motores e as duas configs têm os cinco projetos.
  for (const job of ['validate', 'presentation', 'database', 'deploy-boundaries']) {
    if (!new RegExp(`^  ${job}:`, 'm').test(ci)) problems.push(`.github/workflows/ci.yml: job ${job} ausente.`);
  }
  // Evaluate each browser job: setup must run on cache hit and on cache miss.
  for (const job of ['validate', 'presentation']) {
    const section = ci.split(new RegExp(`^  ${job}:`, 'm'))[1]?.split(/^  [a-z][\w-]*:/m)[0] || '';
    const steps = section.split(/      - name:/).slice(1);
    const binarySteps = steps.filter((step) => /run: npx playwright install (?:--with-deps )?chromium firefox webkit/.test(step));
    const depsSteps = steps.filter((step) => /run: npx playwright install(?:-deps| --with-deps) chromium firefox webkit/.test(step));
    if (!binarySteps.length || !depsSteps.length) {
      problems.push(`.github/workflows/ci.yml: ${job} precisa instalar dependências e os três motores.`);
    }
    for (const step of new Set([...binarySteps, ...depsSteps])) {
      if (/\n\s+if:|continue-on-error: true/.test(step)) {
        problems.push(`.github/workflows/ci.yml: instalação de ${job} deve ser incondicional e bloquear em falha.`);
      }
    }
  }
  if (/\|\|\s*true/.test(ci)) problems.push('.github/workflows/ci.yml: `|| true` mascara falha.');
  for (const config of ['playwright.config.js', 'playwright.presentation.config.js']) {
    const projects = exists(config) ? read(config) : '';
    for (const name of ['chromium-desktop', 'firefox-desktop', 'webkit-desktop', 'mobile-chrome', 'mobile-safari']) {
      if (!projects.includes(`name: '${name}'`)) problems.push(`${config}: projeto ${name} ausente.`);
    }
  }
}

if (exists('.github/CODEOWNERS')) {
  const codeowners = read('.github/CODEOWNERS');
  if (!codeowners.includes('@lucasweber1202')) {
    problems.push('.github/CODEOWNERS: proprietário principal ausente.');
  }
}

if (exists('.github/dependabot.yml')) {
  const dependabot = read('.github/dependabot.yml');
  if (!dependabot.includes('package-ecosystem: "npm"')) {
    problems.push('.github/dependabot.yml: ecossistema npm ausente.');
  }
  if (!dependabot.includes('package-ecosystem: "github-actions"')) {
    problems.push('.github/dependabot.yml: ecossistema GitHub Actions ausente.');
  }
  // Cada ecossistema abre PR contra pilot; PR de dependência direto em main
  // diverge main x pilot sem passar pela integração (#126).
  const ecosystems = dependabot.split(/^  - package-ecosystem:/m).slice(1);
  for (const block of ecosystems) {
    const name = block.split('\n')[0].trim();
    if (!/^    target-branch: "pilot"$/m.test(block)) {
      problems.push(`.github/dependabot.yml: ${name} sem target-branch "pilot".`);
    }
  }
}

if (exists('ops/release-evidence.json')) {
  const evidence = readJson('ops/release-evidence.json');
  const gates = evidence.gates && typeof evidence.gates === 'object' ? evidence.gates : {};
  if (Object.keys(gates).length !== 13) {
    problems.push(`ops/release-evidence.json: esperados 13 gates, encontrados ${Object.keys(gates).length}.`);
  }
}

// Merge só com os quatro gates verdes no HEAD exato (incidente da #118).
if (exists('.github/pull_request_template.md')) {
  const template = read('.github/pull_request_template.md');
  for (const required of ['npm run merge:gates', 'HEAD exato', 'database', 'deploy-boundaries', 'validate', 'presentation']) {
    if (!template.includes(required)) problems.push(`.github/pull_request_template.md: regra de merge sem "${required}".`);
  }
}
if (exists('CONTRIBUTING.md') && !read('CONTRIBUTING.md').includes('npm run merge:gates')) problems.push('CONTRIBUTING.md: regra de merge no HEAD exato ausente.');

console.log('Arandu Governance Check');
console.log(`Arquivos obrigatórios: ${requiredFiles.length}`);
console.log(`Problemas: ${problems.length}`);
for (const problem of problems) console.error(`- ${problem}`);
if (problems.length) process.exit(1);
