// Prontidão da apresentação na Demo canônica LOCAL: responde, antes de entrar na
// sala, "posso apresentar no Modo leitura? e no Modo interativo?".
//
//   bash scripts/demo/local.sh readiness            # os dois modos
//   bash scripts/demo/local.sh readiness --smoke    # + smoke das jornadas pela API real
//
// Só LÊ. Nunca reseta, nunca grava, nunca toca banco hospedado: recusa qualquer
// alvo que não seja localhost. Quando algo falta, diz o comando a rodar
// (ex.: `npm run demo:local:reset`) e a pessoa decide. Segredos (senha, chaves,
// cookies, tokens) nunca aparecem na saída nem no relatório.
//
// Custo de cota: entra por senha direto no Auth local (não usa o login do app,
// que tem limite de 12/10 min por IP) e faz poucas leituras por persona. Rode
// ~10 min antes do ensaio para a cota de 240 req/10 min da gestora estar cheia.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { assertDemoTarget, DemoGuardError } from '../../lib/finance/demo-guard.mjs';
import { encodeSessionValue } from '../../lib/session-cookie.mjs';
import { BUYERS, PROVIDERS } from '../../lib/finance/demo-personas.mjs';
import { RFQ_OPEN, RFQ_CREDIT, RFQ_ACQUIRING, TASKS } from './dataset.mjs';

const args = new Set(process.argv.slice(2));
const SMOKE = args.has('--smoke');
const OUT = process.env.DEMO_READINESS_DIR || 'reports/demo-readiness';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// ---------------------------------------------------------------- travas
let config;
try { config = assertDemoTarget(process.env); } catch (error) {
  if (!(error instanceof DemoGuardError)) throw error;
  console.error('Prontidão recusada: o ambiente não é a Demo canônica.');
  for (const reason of error.reasons) console.error(`  - ${reason}`);
  process.exit(2);
}
const local = (value) => { try { return ['localhost', '127.0.0.1'].includes(new URL(value).hostname); } catch { return false; } };
if (config.target?.kind !== 'local' || !local(config.supabaseUrl) || !local(config.appUrl)) {
  console.error('Prontidão recusada: só roda contra a Demo LOCAL (Supabase e app em localhost). Nada foi lido.');
  process.exit(2);
}
const { supabaseUrl: SB, anonKey: ANON, appUrl: APP, password: PASSWORD } = config;

// ------------------------------------------------------------- utilidades
const SECRET = new RegExp([PASSWORD, config.serviceKey, ANON].filter(Boolean).map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^', 'g');
/** Diagnóstico sanitizado: sem senha, chaves, JWT, cookies nem identificadores longos. */
const sanitize = (text) => String(text ?? '')
  .replace(SECRET, '[segredo]')
  .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
  .replace(/(arandu_session=)[^;\s]+/g, '$1[cookie]')
  .replace(/(authorization|apikey|cookie)(["':=\s]+)[^\s"',}]+/gi, '$1$2[oculto]')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
  .slice(0, 400);
const sections = [];
let current = null;
function section(title) { current = { title, checks: [] }; sections.push(current); }
function check(name, status, detail = '', { modes = ['leitura', 'interativo'], fix = '' } = {}) {
  // status: PASS | FAIL | WARN (não bloqueia) | SKIP (não executado — nunca conta como PASS)
  current.checks.push({ name, status, detail: sanitize(detail), modes, fix });
  const mark = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'AVISO', SKIP: 'NÃO EXECUTADO' }[status];
  console.log(`  ${mark.padEnd(13)} ${name}${detail ? ` — ${sanitize(detail)}` : ''}${status === 'FAIL' && fix ? `\n${' '.repeat(16)}→ ${fix}` : ''}`);
}
async function get(url, options = {}, retried = false) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: response.status, json, text, headers: response.headers };
  } catch (error) {
    // Conexão keep-alive fechada pelo servidor durante uma pausa longa (ex.: depois do
    // seed --check): o Node reaproveita o socket morto. Só leitura é repetida, uma vez.
    if (!retried && error.cause?.code === 'UND_ERR_SOCKET' && (options.method || 'GET') === 'GET') return get(url, options, true);
    return { status: 0, json: null, text: String(error.cause?.code || error.message), headers: new Headers() };
  }
}
const git = (...argv) => { try { return execFileSync('git', argv, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };

// -------------------------------------------------- 1. identidade do código
section('Identidade do código');
const head = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const dirty = git('status', '--porcelain');
check('Commit em uso', head ? 'PASS' : 'FAIL', head ? `${head.slice(0, 12)} (${branch})` : 'repositório git não encontrado');
check('Árvore sem alterações locais', dirty ? 'WARN' : 'PASS', dirty ? `${dirty.split('\n').length} arquivo(s) alterado(s): a Demo não corresponde exatamente ao commit` : '');
const lastUi = Number(git('log', '-1', '--format=%ct', '--', 'finance', 'provider', 'lib/finance')) * 1000;
const distStat = fs.existsSync(path.join(root, 'dist/finance')) ? fs.statSync(path.join(root, 'dist/finance')) : null;
check('Build da interface atualizado', distStat && distStat.mtimeMs >= lastUi ? 'PASS' : 'FAIL',
  distStat ? `build de ${new Date(distStat.mtimeMs).toLocaleString('pt-BR')}` : 'dist/ ausente', { fix: 'npm run build && bash scripts/demo/local.sh app' });
const pidFile = path.join(root, 'scripts/pilot-local/.state/app.pid');
const lastApi = Number(git('log', '-1', '--format=%ct', '--', 'api', 'lib')) * 1000;
const appStarted = fs.existsSync(pidFile) ? fs.statSync(pidFile).mtimeMs : 0;
check('App local iniciado depois do último commit de API', appStarted >= lastApi ? 'PASS' : 'FAIL',
  appStarted ? `app iniciado em ${new Date(appStarted).toLocaleString('pt-BR')}` : 'sem registro do processo do app', { fix: 'bash scripts/demo/local.sh app' });

// ---------------------------------------------------------- 2. serviços
section('Serviços');
const docker = spawnSync('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}'], { encoding: 'utf8' });
const containers = docker.status === 0 ? docker.stdout.trim().split('\n').filter(Boolean) : [];
check('Contêineres do Supabase local', containers.length >= 4 && containers.every((line) => /\bUp\b/.test(line)) ? 'PASS' : 'FAIL',
  containers.length ? containers.map((line) => line.replace(/\t/, ': ')).join(' · ') : 'docker indisponível', { fix: 'npm run demo:setup (≈20 min) — tenha a máquina pronta antes' });
const authHealth = await get(`${SB}/auth/v1/health`);
check('Auth (GoTrue)', authHealth.status === 200 ? 'PASS' : 'FAIL', `HTTP ${authHealth.status}`, { fix: 'npm run demo:setup' });
const restHealth = await get(`${SB}/rest/v1/`, { headers: { apikey: ANON } });
check('Banco via PostgREST', restHealth.status === 200 ? 'PASS' : 'FAIL', `HTTP ${restHealth.status}`, { fix: 'npm run demo:setup' });
// Storage local (documentos privados da Demo: minutas e anexos do processo).
const storage = await get(`${SB}/storage/v1/status`);
check('Storage (documentos privados)', storage.status === 200 ? 'PASS' : 'FAIL', `HTTP ${storage.status}`, { fix: 'npm run demo:setup' });
const alive = await get(`${APP}/api/health`);
check('App do Arandu', alive.status === 200 && alive.json?.release?.environment === 'demo' ? 'PASS' : 'FAIL',
  alive.json ? `ambiente ${alive.json.release?.environment}, dados ${alive.json.release?.datasource}` : `HTTP ${alive.status} ${alive.text}`, { fix: 'bash scripts/demo/local.sh app' });
const ready = await get(`${APP}/api/health?probe=ready`);
// A sonda de prontidão é a da implantação hospedada (topologia aprovada em
// lib/deployment-topology.mjs). O banco local descartável não faz parte da
// topologia, então "not_ready" aqui é esperado e não bloqueia a Demo local;
// fica registrado como aviso, nunca como PASS.
check('Sonda de prontidão da implantação hospedada', ready.status === 200 && ready.json?.ok !== false ? 'PASS' : 'WARN',
  ready.json ? `${ready.json.status || 'sem status'} — esperado na Demo local (banco fora da topologia hospedada)` : `HTTP ${ready.status}`);
const login = await get(`${APP}/login.html`);
check('Página de login', login.status === 200 ? 'PASS' : 'FAIL', `HTTP ${login.status}`);

// Sem os serviços essenciais, o resto não tem como ser medido: as checagens
// seguintes ficam NÃO EXECUTADAS (nunca PASS) e o diagnóstico aponta a causa
// real, em vez de sugerir reset por uma Demo que só está fora do ar.
const ESSENTIAL = /^(Contêineres|Auth|Banco via PostgREST|App do Arandu)/;
const servicesDown = sections.flatMap((s) => s.checks).filter((c) => c.status === 'FAIL' && ESSENTIAL.test(c.name)).map((c) => c.name);
if (servicesDown.length) {
  section('Personas, cenário, Modo interativo e smoke');
  check('Demais checagens', 'SKIP', `não executadas: serviço essencial fora do ar (${servicesDown.join(', ')}). Suba a Demo (npm run demo:setup) e rode de novo; não é caso de reset.`);
} else {
// ---------------------------------------------------------- 3. personas
section('Personas e autenticação');
const people = {
  ...Object.fromEntries(Object.entries(BUYERS).map(([key, p]) => [key, { ...p, key }])),
  // Provedores pela persona (eduardo, patricia…), não pela instituição.
  ...Object.fromEntries(Object.values(PROVIDERS).map((p) => {
    const key = p.person.name.split(' ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return [key, { ...p.person, key, org: p.name }];
  }))
};
async function signIn(person) {
  const response = await get(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: person.email, password: PASSWORD })
  });
  if (response.status !== 200 || !response.json?.access_token) return `HTTP ${response.status}`;
  person.id = response.json.user?.id;
  person.cookie = `arandu_session=${encodeURIComponent(encodeSessionValue({ access_token: response.json.access_token, refresh_token: response.json.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 1800 }))}`;
  return null;
}
const ROLE = { admin: 'administração', finance_manager: 'gestão financeira', analyst: 'análise', viewer: 'leitura' };
for (const key of ['juliana', 'helena', 'rafael', 'carlos', 'eduardo', 'patricia', 'bruno', 'diego']) {
  const person = people[key];
  if (!person) { check(`Persona ${key}`, 'FAIL', 'não existe no dataset'); continue; }
  const failure = await signIn(person);
  check(`${person.name} (${person.org || ROLE[person.role] || person.role}) entra`, failure ? 'FAIL' : 'PASS', failure || person.email,
    { modes: ['juliana', 'helena', 'patricia'].includes(key) ? ['leitura', 'interativo'] : ['leitura'], fix: 'npm run demo:local:reset (a senha vem de scripts/pilot-local/.state/demo.env)' });
}

async function api(person, pathname, { method = 'GET', body } = {}) {
  if (!person?.cookie) return { status: 0, json: null, text: 'sem sessão' };
  const response = await get(`${APP}/api/finance/${pathname}`, {
    method, headers: { Origin: APP, 'Content-Type': 'application/json', Cookie: person.cookie }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 429) response.text = 'limite de requisições da API (429): espere ~10 min sem usar esta persona';
  return response;
}

// ------------------------------------------------------- 4. seed e cenário
section('Cenário semeado (leitura)');
const juliana = people.juliana;
const orgs = await api(juliana, 'organizations');
const org = (orgs.json?.rows || []).find((row) => row.kind === 'BUYER');
check('Vitta Foods visível para a gestora', org ? 'PASS' : 'FAIL', org?.legal_name || `HTTP ${orgs.status} ${orgs.text}`, { fix: 'npm run demo:local:reset' });
const orgQ = org ? `organization_id=${encodeURIComponent(org.id)}` : '';
const overview = org ? await api(juliana, `overview?${orgQ}`) : { json: null };
const rfqs = overview.json?.rfqs || [];
const byTitle = (title) => rfqs.find((row) => row.title === title);
for (const [label, spec, status] of [['Nova linha de crédito em avaliação', RFQ_CREDIT, 'comparing'], ['Adquirência decidida e contratada', RFQ_ACQUIRING, null], ['Concorrência sazonal em coleta', RFQ_OPEN, 'collecting']]) {
  const rfq = byTitle(spec.title);
  check(label, rfq && (!status || rfq.status === status) ? 'PASS' : 'FAIL', rfq ? `${rfq.status}, ${(rfq.proposals || []).length} proposta(s)` : 'ausente', { fix: 'npm run demo:local:reset' });
}
const contracts = overview.json?.contracts || [];
check('Contratos vigentes (Lumina e Atlas)', contracts.filter((row) => ['active', 'renewing'].includes(row.status)).length >= 2 ? 'PASS' : 'FAIL', `${contracts.length} contrato(s)`, { fix: 'npm run demo:local:reset' });
const seedCheck = spawnSync(process.execPath, [path.join(root, 'scripts/demo/seed.mjs'), '--check', '--quiet'], { cwd: root, env: process.env, encoding: 'utf8', timeout: 600_000 });
const seedSummary = (seedCheck.stdout + seedCheck.stderr).match(/(\d+)\/(\d+) checagens/);
check('Checagens de sanidade do seed', seedCheck.status === 0 ? 'PASS' : 'FAIL', seedSummary ? `${seedSummary[1]}/${seedSummary[2]} checagens` : sanitize((seedCheck.stderr || seedCheck.stdout).split('\n').filter(Boolean).slice(-2).join(' ')),
  { fix: 'npm run demo:local:reset' });

// ------------------------------------------ 5. estado inicial do Modo interativo
section('Estado inicial do Modo interativo (precisa estar intocado)');
const fresh = { modes: ['interativo'], fix: 'Modo interativo já usado: rode npm run demo:local:reset (≈15 min) — nunca em banco hospedado' };
const open = byTitle(RFQ_OPEN.title);
const meridian = (open?.proposals || []).find((row) => /meridian/i.test(row.provider_name || ''));
const orbe = (open?.proposals || []).find((row) => /orbe/i.test(row.provider_name || ''));
check('Orbe já respondeu à concorrência sazonal (base da comparação parcial)', orbe ? 'PASS' : 'FAIL', orbe ? `versão ${orbe.version || 1}` : 'proposta da Orbe ausente', { fix: 'npm run demo:local:reset' });
const meridianInvite = (open?.invites || []).find((row) => /meridian/i.test(row.provider_name || ''));
check('Meridian ainda pode responder (convite ativo e coleta aberta)', open?.status === 'collecting' && (!open?.invites || (meridianInvite && ['invited', 'accepted'].includes(meridianInvite.status))) ? 'PASS' : 'FAIL',
  meridianInvite ? `convite ${meridianInvite.status}` : open?.invites ? 'convite da Meridian ausente' : 'lista de convites não informada na visão geral', fresh);
check('Meridian ainda não enviou proposta na concorrência sazonal (I6)', open && !meridian ? 'PASS' : 'FAIL', open ? `${(open.proposals || []).length} proposta(s) na coleta` : 'concorrência ausente', fresh);
const approvals = org ? await api(people.helena, `approvals?${orgQ}`) : { json: null };
const helenaTurn = (approvals.json?.rows || []).find((row) => row.status === 'pending');
// Sem resposta (timeout/rede) não é "já usado": não mandar resetar uma estação intacta.
const unanswered = org && !approvals.status;
check('Etapa da CFO pendente na nova linha (I4)', helenaTurn ? 'PASS' : 'FAIL',
  helenaTurn ? 'pedido aguardando a Helena'
    : unanswered ? `a API não respondeu à leitura das aprovações (${approvals.text}); nada indica uso anterior`
      : `nenhum pedido pendente (${approvals.status ? `HTTP ${approvals.status}` : 'organização não lida'}${approvals.status && approvals.status !== 200 ? ` ${approvals.text}` : ''})`,
  unanswered ? { modes: ['interativo'], fix: 'rode a prontidão de novo em alguns minutos (sem reset); se repetir, veja scripts/pilot-local/.state/app.log' } : fresh);
const tasks = org ? await api(juliana, `tasks?${orgQ}&status=open&limit=200`) : { json: null };
const live = (tasks.json?.rows || []).filter((row) => /cronograma de remessa dos terminais/i.test(row.title));
check('Nenhuma tarefa de ensaio anterior (I1–I2)', tasks.status === 200 && !live.length ? 'PASS' : 'FAIL', tasks.status === 200 ? `${(tasks.json.rows || []).length} tarefa(s) abertas; ${live.length} de ensaio` : tasks.status ? `HTTP ${tasks.status}` : 'organização não lida', fresh);
check('Tarefas do seed presentes', (tasks.json?.rows || []).length >= Math.min(5, TASKS.length) ? 'PASS' : 'FAIL', `${(tasks.json?.rows || []).length} abertas`, { fix: 'npm run demo:local:reset' });
// Entrada por persona: cada janela anônima nova reivindica um workspace pronto, e o
// servidor aceita 4 reivindicações por hora por origem (auth-demo-claim). Só lê.
const pool = await fetch(`${SB}/rest/v1/fin_demo_workspaces?select=status,claimed_at`, { headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` } })
  .then(async (response) => (response.ok ? response.json() : null)).catch(() => null);
const readyCount = (pool || []).filter((row) => row.status === 'ready').length;
const recentClaims = (pool || []).filter((row) => row.claimed_at && Date.parse(row.claimed_at) > Date.now() - 3600000).length;
check('Pool de visitantes (entrada por persona)', pool && readyCount >= 2 && recentClaims <= 2 ? 'PASS' : 'FAIL',
  pool ? `${readyCount} workspace(s) pronto(s); ${recentClaims} entrada(s) nova(s) na última hora (limite 4/h por rede)` : 'pool não lido',
  { modes: ['interativo'], fix: readyCount < 2 ? 'npm run demo:local:workspaces -- provision --count=4 (≈ 10 min por par)' : 'espere a janela de 1 h das entradas novas ou siga pelas janelas já abertas ("Trocar persona" não consome workspace)' });

// ------------------------------------------------- 6. smoke das jornadas
section('Smoke das jornadas essenciais pela API real (só leitura)');
if (!SMOKE) check('Smoke das jornadas', 'SKIP', 'rode com --smoke para executar (consome cota de leitura de várias personas)');
else {
  const credit = byTitle(RFQ_CREDIT.title);
  const comparison = credit ? await api(juliana, 'comparison', { method: 'POST', body: { rfq_id: credit.id } }) : { status: 0 };
  check('Comparação da nova linha (Juliana)', comparison.status === 200 ? 'PASS' : 'FAIL', `HTTP ${comparison.status}`);
  const contractId = contracts.find((row) => row.product === 'acquiring')?.id;
  const impl = contractId ? await api(juliana, `implementations?${orgQ}&contract_id=${contractId}`) : { status: 0 };
  check('Implantação do contrato da Lumina por contract_id', impl.status === 200 && (impl.json?.rows || impl.json?.items || []).length !== 0 ? 'PASS' : 'FAIL', `HTTP ${impl.status}`);
  const cov = await api(juliana, `covenants?${orgQ}`);
  check('Covenants e obrigações', cov.status === 200 ? 'PASS' : 'FAIL', `HTTP ${cov.status}`);
  const viewer = await api(people.carlos, `tasks?${orgQ}&status=open&limit=5`);
  check('Leitor (Carlos) lê tarefas', viewer.status === 200 ? 'PASS' : 'FAIL', `HTTP ${viewer.status}`);
  // assignments exige a organização provedora de quem lê (#215).
  const providerAssignments = async (person) => {
    const orgsOf = await api(person, 'organizations');
    const own = (orgsOf.json?.rows || []).find((row) => row.kind === 'PROVIDER');
    return own ? api(person, `assignments?organization_id=${encodeURIComponent(own.id)}`) : { status: orgsOf.status || 0, json: null };
  };
  const patricia = await providerAssignments(people.patricia);
  const invite = (patricia.json?.rows || []).find((row) => row.rfq_title === RFQ_OPEN.title || row.title === RFQ_OPEN.title || row.rfq_status === 'collecting');
  check('Meridian vê a concorrência sazonal em coleta', invite ? 'PASS' : 'FAIL', `HTTP ${patricia.status}`, { modes: ['interativo'] });
  const eduardo = await providerAssignments(people.eduardo);
  const leaks = JSON.stringify(eduardo.json || {}).match(/Lumina Pay|Orbe Capital|Meridian/g) || [];
  // O nome do comprador (buyer_name, #215) vem da organização compradora; nunca de outra instituição.
  check('Portal mostra o comprador quando a API informa (buyer_name)', (patricia.json?.rows || []).some((row) => row.buyer_name) ? 'PASS' : 'WARN', (patricia.json?.rows || []).some((row) => row.buyer_name) ? 'nome do comprador presente' : 'API sem buyer_name (schema anterior): o portal usa texto neutro');
  check('Atlas não vê outras instituições', eduardo.status === 200 && !leaks.length ? 'PASS' : 'FAIL', eduardo.status === 200 ? `${leaks.length} menção(ões) a concorrentes` : `HTTP ${eduardo.status}`);
}

}

// --------------------------------------------------------------- relatório
const verdict = (mode) => {
  const relevant = sections.flatMap((s) => s.checks).filter((c) => c.modes.includes(mode));
  const failed = relevant.filter((c) => c.status === 'FAIL');
  return { mode, ready: failed.length === 0, failed: failed.map((c) => ({ name: c.name, fix: c.fix })), skipped: relevant.filter((c) => c.status === 'SKIP').map((c) => c.name) };
};
const report = { generated_at: new Date().toISOString(), commit: head, branch, app: APP, smoke: SMOKE,
  station_evidence: { schema: 1, host: os.hostname(), clean: Boolean(head) && !dirty,
    lockSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex') },
  modes: [verdict('leitura'), verdict('interativo')], sections };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'readiness.json'), `${JSON.stringify(report, null, 2)}\n`);
const md = [`# Prontidão da Demo local — ${new Date().toLocaleString('pt-BR')}`, '', `Commit \`${head.slice(0, 12)}\` (${branch}) · app ${APP} · smoke ${SMOKE ? 'executado' : 'não executado'}`, '',
  ...report.modes.map((m) => `- **Modo ${m.mode}: ${m.ready ? 'PRONTO' : 'NÃO PRONTO'}**${m.failed.length ? ` — ${m.failed.map((f) => `${f.name}${f.fix ? ` (→ ${f.fix})` : ''}`).join('; ')}` : ''}${m.skipped.length ? ` · não executado: ${m.skipped.join(', ')}` : ''}`),
  '', ...sections.flatMap((s) => [`## ${s.title}`, '', '| Verificação | Resultado | Detalhe |', '| --- | --- | --- |', ...s.checks.map((c) => `| ${c.name} | ${c.status} | ${c.detail.replace(/\|/g, '/')} |`), ''])].join('\n');
fs.writeFileSync(path.join(OUT, 'readiness.md'), md);
console.log('');
for (const m of report.modes) console.log(`Modo ${m.mode}: ${m.ready ? 'PRONTO' : 'NÃO PRONTO'}${m.failed.length ? ` (${m.failed.length} pendência(s))` : ''}`);
console.log(`Relatório: ${OUT}/readiness.md`);
process.exit(report.modes.every((m) => m.ready) ? 0 : 1);
