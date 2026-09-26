// Prova que toda rota da API consolidada é alcançável na Vercel.
//
// Fora do Next.js, a Vercel entrega a `api/[...path].js` apenas caminhos de um
// segmento (/api/health, /api/forms). Em 26/09/2026 a produção respondia
// NOT_FOUND da própria plataforma para /api/finance/*, /api/auth/* e
// /api/jobs/renewals — o portal real, o login e o cron nunca chegavam ao código.
// O rewrite `/api/:aranduScope/:aranduRest+` leva esses caminhos à função; este
// check impede que ele suma, que passe a sombrear uma função própria, ou que o
// roteador ganhe uma rota de vários segmentos fora do alcance dele.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const router = fs.readFileSync('api/[...path].js', 'utf8');
const SOURCE = '/api/:aranduScope/:aranduRest+';
const HOBBY_FUNCTION_LIMIT = 12;

const rewrite = (vercel.rewrites || []).find((item) => item.source === SOURCE);
assert.ok(rewrite, `vercel.json precisa do rewrite ${SOURCE} para rotas /api com dois ou mais segmentos.`);

// path-to-regexp: `:nome` casa um segmento; `:nome+` casa um ou mais.
const matcher = new RegExp(`^${SOURCE
  .replace(/\/:[A-Za-z]+\+/g, '/[^/]+(?:/[^/]+)*')
  .replace(/\/:[A-Za-z]+/g, '/[^/]+')}/?$`);

const functions = fs.readdirSync('api').filter((file) => file.endsWith('.js'));
assert.ok(functions.length <= HOBBY_FUNCTION_LIMIT, `api/ tem ${functions.length} funções; o plano Hobby aceita ${HOBBY_FUNCTION_LIMIT}.`);
assert.ok(functions.every((file) => !file.includes('/')), 'Funções aninhadas em api/ mudariam a precedência do rewrite.');

// O rewrite nunca pode capturar uma função própria nem uma rota de um segmento.
for (const file of functions) {
  const path = `/api/${file.replace(/\.js$/, '')}`;
  if (file.startsWith('[')) continue;
  assert.doesNotMatch(path, matcher, `${path} seria desviado pelo rewrite.`);
}
for (const single of ['/api/health', '/api/forms', '/api/finance', '/api/jobs', '/api/security-contact']) {
  assert.doesNotMatch(single, matcher, `${single} não deveria casar com o rewrite.`);
}

// Destino: um segmento só, sem função própria e sem rota no roteador — se a
// plataforma um dia entregar o destino em vez do caminho original, a resposta
// é 404 (fail-closed), nunca outra rota.
const destination = String(rewrite.destination || '');
assert.match(destination, /^\/api\/[a-z-]+$/, 'Destino do rewrite deve ser um único segmento em /api.');
const destinationName = destination.slice('/api/'.length);
assert.ok(!functions.includes(`${destinationName}.js`), `Destino ${destination} não pode ser uma função própria.`);
assert.ok(!router.includes(`route === '${destinationName}'`), `Destino ${destination} não pode ser rota do roteador.`);

// Toda rota de vários segmentos declarada no roteador precisa casar.
const exact = [...router.matchAll(/route === '([a-z-]+\/[a-z0-9/-]+)'/g)].map((match) => `/api/${match[1]}`);
const prefixes = [...router.matchAll(/route\.startsWith\('([a-z-]+\/)'\)/g)].map((match) => `/api/${match[1]}example`);
const nested = ['/api/finance/rfqs', '/api/finance/documents/download', '/api/finance/ops/overview', '/api/auth/login'];
const multiSegment = [...new Set([...exact, ...prefixes, ...nested])];
assert.ok(exact.includes('/api/jobs/renewals'), 'Roteador deixou de declarar /api/jobs/renewals.');
assert.ok(prefixes.some((path) => path.startsWith('/api/finance/')), 'Roteador deixou de declarar /api/finance/*.');
for (const path of multiSegment) assert.match(path, matcher, `${path} não chega a api/[...path].js na Vercel.`);

// Cron: cada caminho agendado precisa existir como função ou via rewrite.
for (const cron of vercel.crons || []) {
  const path = cron.path.split('?')[0];
  const direct = functions.includes(`${path.replace(/^\/api\//, '')}.js`);
  assert.ok(direct || matcher.test(path), `Cron ${path} não chega a nenhuma função.`);
}

// Em rewrite, `req.url` guarda o caminho original: o roteador reconhece
// security.txt pelo caminho público, não pelo destino.
assert.match(router, /original === '\/\.well-known\/security\.txt'\) return 'security-contact'/, 'Roteador não reconhece /.well-known/security.txt pelo caminho original.');

// Execução real do roteador com o caminho que a Vercel entrega.
function fakeResponse() {
  const headers = {};
  return {
    statusCode: 200, headers, body: '',
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    writeHead(status, extra = {}) { this.statusCode = status; for (const [k, v] of Object.entries(extra)) this.setHeader(k, v); return this; },
    end(chunk = '') { this.body += String(chunk); this.ended = true; return this; },
    write(chunk = '') { this.body += String(chunk); return true; }
  };
}
async function call(url, env = {}) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) { saved[key] = process.env[key]; process.env[key] = value; }
  try {
    const { default: handler } = await import('../api/[...path].js');
    const res = fakeResponse();
    await handler({ method: 'GET', url, headers: { host: 'arandu.example.com' }, socket: { remoteAddress: '127.0.0.1' } }, res);
    return res;
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

const expires = new Date(Date.now() + 90 * 86_400_000).toISOString();
const security = await call('/.well-known/security.txt', { ARANDU_SECURITY_CONTACT: 'mailto:security@arandu.example.com', ARANDU_SECURITY_EXPIRES: expires });
assert.equal(security.statusCode, 200, 'security.txt via caminho original deveria responder 200 quando configurado.');
assert.match(security.body, /^Contact: mailto:security@arandu\.example\.com/m);

const dispatch = await call(destination);
assert.equal(dispatch.statusCode, 404, 'Destino do rewrite acessado diretamente deve falhar fechado.');
assert.match(dispatch.body, /Rota de API não encontrada/);

const renewals = await call('/api/jobs/renewals');
assert.notEqual(renewals.statusCode, 404, '/api/jobs/renewals precisa chegar ao handler (sem segredo: 401/503, nunca 404).');

console.log(`Vercel API routing: ${multiSegment.length} rotas de vários segmentos alcançáveis via ${SOURCE}; ${functions.length}/${HOBBY_FUNCTION_LIMIT} funções; cron e security.txt verificados.`);
