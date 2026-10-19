// Classificação da estação de apresentação (Plano B, Demo canônica LOCAL).
// Função pura sobre fatos já coletados por scripts/demo/station.mjs, para ser
// testada sem Docker (scripts/test-demo-station.mjs).
//
//   UNSAFE   — alvo ou configuração que pode tocar outro ambiente (hospedado,
//              produção, banco sem a marca de demo). Pare e não apresente.
//   BLOCKED  — falta requisito essencial (Node 24, Docker, serviço, navegador,
//              certificado, porta tomada por outro processo...).
//   PREPARED — tudo verde aqui, mas ainda não é a estação definitiva provada:
//              sem congelamento, SHA diferente do congelado, árvore suja, sem
//              prontidão recente, ou máquina efêmera (CI, sessão remota).
//   READY    — esta máquina foi declarada a estação, está no SHA congelado com
//              árvore limpa, todos os requisitos passam e a prontidão recente
//              disse Modo leitura PRONTO.
export const STATUS = Object.freeze({ READY: 'READY', PREPARED: 'PREPARED', BLOCKED: 'BLOCKED', UNSAFE: 'UNSAFE' });
const RANK = { READY: 0, PREPARED: 1, BLOCKED: 2, UNSAFE: 3 };

export const REQUIREMENTS = Object.freeze({
  nodeMajor: 24,
  minCpus: 2,
  minMemoryGiB: 6,      // Postgres + GoTrue + PostgREST + Storage + app + Chromium
  minDiskGiB: 10,       // imagens (~3 GB), banco e relatórios
  readinessMaxAgeMinutes: 120,
  ports: [54322, 9999, 3000, 5000, 8443, 4443]
});

const check = (id, label, status, detail, fix) => ({ id, label, status, detail, ...(fix ? { fix } : {}) });

/** facts → { status, checks, reasons }. Nenhum fato ausente vira PASS. */
export function classifyStation(facts) {
  const f = facts || {};
  const checks = [];
  const add = (...args) => checks.push(check(...args));
  const R = REQUIREMENTS;

  // ------------------------------------------------ alvo (UNSAFE primeiro)
  const nonLocal = (f.env?.nonLocalTargets || []);
  if (nonLocal.length) add('target', 'Alvo só local', 'UNSAFE', `variáveis apontam para fora de localhost: ${nonLocal.join(', ')}`, 'Abra um terminal novo, sem variáveis de outro ambiente.');
  else add('target', 'Alvo só local', 'PASS', 'nenhuma variável aponta para fora de localhost');
  if (f.env?.vercelEnv) add('vercel', 'Fora da Vercel', 'UNSAFE', `VERCEL_ENV=${f.env.vercelEnv}`, 'unset VERCEL_ENV');
  if (f.env?.aranduEnv && f.env.aranduEnv !== 'demo') add('arandu-env', 'ARANDU_ENV', 'UNSAFE', `ARANDU_ENV=${f.env.aranduEnv} no terminal`, 'unset ARANDU_ENV (o script da Demo define demo).');
  if (f.db?.reachable && f.db.marker !== 'demo') add('db-marker', 'Banco marcado como demonstração', 'UNSAFE', `marca do banco: ${f.db.marker || 'ausente'}`, 'Não apresente: este banco não é a Demo local.');
  if (f.app?.reachable && f.app.environment && f.app.environment !== 'demo') add('app-env', 'App em ARANDU_ENV=demo', 'UNSAFE', `app responde ${f.app.environment}`, 'bash scripts/demo/local.sh app');

  // ------------------------------------------------ máquina
  add('os', 'Sistema e arquitetura', f.host?.platform ? 'PASS' : 'BLOCKED', f.host?.platform ? `${f.host.platform} ${f.host.arch}${f.host.wsl ? ' (WSL2)' : ''}` : 'desconhecido');
  const major = Number(String(f.node?.version || '').replace(/^v/, '').split('.')[0]);
  add('node', `Node.js ${R.nodeMajor}`, major === R.nodeMajor ? 'PASS' : 'BLOCKED', f.node?.version || 'ausente', `Instale Node ${R.nodeMajor} (nvm install ${R.nodeMajor}; o .nvmrc fixa a versão).`);
  add('npm', 'npm', f.npm?.version ? 'PASS' : 'BLOCKED', f.npm?.version || 'ausente');
  add('deps', 'Dependências do lockfile instaladas', f.deps?.ok ? 'PASS' : 'BLOCKED', f.deps?.detail || 'node_modules ausente', 'npm ci --include=optional');
  add('cpu', `CPU (≥ ${R.minCpus})`, (f.host?.cpus || 0) >= R.minCpus ? 'PASS' : 'BLOCKED', `${f.host?.cpus ?? '?'} núcleo(s)`);
  add('memory', `Memória (≥ ${R.minMemoryGiB} GiB)`, (f.host?.memoryGiB || 0) >= R.minMemoryGiB ? 'PASS' : 'BLOCKED', `${f.host?.memoryGiB ?? '?'} GiB`, 'Feche aplicativos; no Docker Desktop/WSL2, aumente a memória da VM.');
  add('disk', `Disco livre (≥ ${R.minDiskGiB} GiB)`, (f.host?.diskFreeGiB || 0) >= R.minDiskGiB ? 'PASS' : 'BLOCKED', `${f.host?.diskFreeGiB ?? '?'} GiB livres`);
  add('docker', 'Docker Engine', f.docker?.engine ? 'PASS' : 'BLOCKED', f.docker?.engine || 'daemon indisponível', 'Inicie o Docker (Docker Desktop/WSL2 ou systemctl start docker).');
  add('compose', 'Docker Compose', f.docker?.compose ? 'PASS' : 'BLOCKED', f.docker?.compose || 'ausente');
  add('browser', 'Chromium do Playwright do lockfile', f.browser?.ok ? 'PASS' : 'BLOCKED', f.browser?.detail || 'ausente', 'npx playwright install chromium');

  // ------------------------------------------------ portas e serviços
  const foreign = (f.ports || []).filter((p) => p.state === 'foreign');
  add('ports', 'Portas da Demo', foreign.length ? 'BLOCKED' : 'PASS',
    foreign.length ? `ocupadas por outro processo: ${foreign.map((p) => p.port).join(', ')}` : 'livres ou da própria Demo', 'Libere as portas ou encerre a outra pilha (não rode duas Demos ao mesmo tempo).');
  for (const [id, label] of [['db', 'PostgreSQL'], ['auth', 'Auth (GoTrue)'], ['rest', 'PostgREST'], ['storage', 'Storage'], ['gateway', 'Gateway HTTPS'], ['app', 'App']]) {
    const s = f.services?.[id];
    add(`svc-${id}`, label, s?.ok ? 'PASS' : 'BLOCKED', s?.detail || 'sem resposta', 'bash scripts/demo/local.sh resume');
  }
  add('db-container', 'Banco é o contêiner original', f.db?.container === 'original' ? 'PASS' : 'BLOCKED',
    f.db?.container === 'original' ? 'dados preservados no contêiner criado pelo setup' : (f.db?.container || 'contêiner ausente'),
    'Contêiner recriado ou ausente: os dados da Demo estão nele. npm run demo:setup (≈ 20 min).');
  add('cert', 'Certificado HTTPS local', f.cert?.ok ? 'PASS' : 'BLOCKED', f.cert?.detail || 'ausente', 'npm run demo:setup recria o estado local.');
  add('seed', 'Seed íntegro', f.seed?.ok ? 'PASS' : f.seed?.skipped ? 'PREPARED' : 'BLOCKED', f.seed?.detail || 'não verificado', 'npm run demo:local:check (e, se falhar, npm run demo:local:reset)');
  const ready = f.pool?.ready ?? 0;
  add('pool', 'Pool de visitantes (≥ 2 prontos)', ready >= 2 ? 'PASS' : 'BLOCKED', `${ready} pronto(s), ${f.pool?.claimed ?? 0} em uso`, 'npm run demo:local:workspaces -- provision --count=2 (≈ 11 min)');

  // ------------------------------------------------ identidade (PREPARED)
  add('tree', 'Árvore Git limpa', f.git?.clean ? 'PASS' : 'PREPARED', f.git?.clean ? 'sem alterações locais' : `${f.git?.dirty ?? '?'} arquivo(s) alterado(s)`, 'git stash (não apague trabalho) ou volte ao SHA congelado.');
  if (!f.freeze?.sha) add('freeze', 'Versão congelada', 'PREPARED', 'nenhum congelamento nesta máquina', 'bash scripts/demo/local.sh freeze --station');
  else add('freeze', 'Versão congelada', f.freeze.sha === f.git?.sha ? 'PASS' : 'PREPARED',
    f.freeze.sha === f.git?.sha ? `HEAD = congelado ${f.freeze.sha.slice(0, 12)}` : `HEAD ${String(f.git?.sha || '?').slice(0, 12)} ≠ congelado ${f.freeze.sha.slice(0, 12)}`, 'git checkout <SHA congelado> (com a árvore limpa).');
  if (f.freeze?.sha) add('lockfile', 'Lockfile = congelado', f.freeze.lockSha256 === f.git?.lockSha256 ? 'PASS' : 'PREPARED', f.freeze.lockSha256 === f.git?.lockSha256 ? 'igual' : 'package-lock.json mudou desde o congelamento');
  add('station', 'Esta é a estação declarada', f.freeze?.station && f.freeze.host === f.host?.name ? 'PASS' : 'PREPARED',
    f.freeze?.station ? (f.freeze.host === f.host?.name ? `máquina ${f.host?.name}` : `declarada em ${f.freeze.host}, esta é ${f.host?.name}`) : 'não declarada', 'bash scripts/demo/local.sh freeze --station (na máquina da apresentação)');
  add('ephemeral', 'Máquina persistente', f.host?.ephemeral ? 'PREPARED' : 'PASS', f.host?.ephemeral ? `executor efêmero (${f.host.ephemeral}): nunca é a estação` : 'sem sinais de CI ou sessão remota');
  const age = f.readiness?.ageMinutes;
  add('readiness', `Prontidão recente (≤ ${R.readinessMaxAgeMinutes} min, Modo leitura PRONTO)`,
    f.readiness?.readMode === 'PRONTO' && age != null && age <= R.readinessMaxAgeMinutes ? 'PASS' : 'PREPARED',
    f.readiness ? `leitura ${f.readiness.readMode || '?'} · interativo ${f.readiness.interactiveMode || '?'} · há ${age ?? '?'} min` : 'sem relatório', 'bash scripts/demo/local.sh readiness --smoke');

  const worst = checks.reduce((acc, c) => (c.status === 'PASS' ? acc : (RANK[c.status] > RANK[acc] ? c.status : acc)), STATUS.READY);
  return { status: worst, checks, reasons: checks.filter((c) => c.status === worst && worst !== 'READY').map((c) => `${c.label}: ${c.detail}`) };
}
