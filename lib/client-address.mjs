import { isIP } from 'node:net';

// Endereço de origem para limite de tentativas e trilha. Política explícita de
// proxies confiáveis (13/10/2026):
//
// - Vercel (VERCEL=1, definido pela plataforma em todo deploy, inclusive
//   Preview): a borda da Vercel grava `x-vercel-forwarded-for`/`x-real-ip` e
//   sobrescreve `x-forwarded-for` com o IP do cliente; valores que o cliente
//   mande nesses cabeçalhos não chegam à função.
// - Atrás de proxy próprio: ARANDU_TRUSTED_PROXY_HOPS=N (1 a 5) declara quantos
//   proxies confiáveis acrescentam ao `x-forwarded-for`; vale o N-ésimo endereço
//   a partir da direita, que nenhum cliente consegue forjar. Cabeçalhos
//   próprios da Vercel são ignorados nesse modo.
// - Qualquer outro caso (local, testes, outro host sem declaração): só o
//   endereço da conexão. Cabeçalho de proxy é ignorado: antes, girar
//   `x-forwarded-for` dava a cada tentativa um limite novo.
//
// IPv6 é agrupado por /64 (o bloco que um único cliente recebe): trocar de
// endereço dentro do mesmo bloco não renova o limite.

function normalize(value) {
  let address = String(value ?? '').trim();
  if (address.startsWith('[') && address.includes(']')) address = address.slice(1, address.indexOf(']'));
  if (/^::ffff:\d{1,3}(?:\.\d{1,3}){3}$/i.test(address)) address = address.slice(7);
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  const [head, tail = ''] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((part) => part.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

function trustedHops(env) {
  const value = Number(env.ARANDU_TRUSTED_PROXY_HOPS);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
}

/** Endereço confiável da origem, já normalizado; 'unknown' quando não há como saber. */
export function clientAddress(req, env = process.env) {
  const headers = req?.headers || {};
  const socket = normalize(req?.socket?.remoteAddress);
  const hops = trustedHops(env);
  if (hops) {
    const chain = String(headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean);
    // Sem a cadeia completa, o proxy declarado não está na frente: conexão direta.
    return (chain.length >= hops && normalize(chain[chain.length - hops])) || socket || 'unknown';
  }
  if (env.VERCEL === '1') {
    for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
      const first = normalize(String(headers[name] || '').split(',')[0]);
      if (first) return first;
    }
  }
  return socket || 'unknown';
}
