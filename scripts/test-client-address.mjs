import assert from 'node:assert/strict';
import { clientAddress } from '../lib/client-address.mjs';

// Política de proxies confiáveis (lib/client-address.mjs).
const req = (headers = {}, remoteAddress = '10.0.0.5') => ({ headers, socket: { remoteAddress } });

// Fora da Vercel e sem proxy declarado: cabeçalho do cliente nunca conta.
for (const headers of [
  { 'x-forwarded-for': '203.0.113.9' }, { 'x-real-ip': '203.0.113.9' }, { 'x-vercel-forwarded-for': '203.0.113.9' },
  { 'x-forwarded-for': '203.0.113.9, 198.51.100.1' }
]) assert.equal(clientAddress(req(headers), {}), '10.0.0.5', JSON.stringify(headers));
assert.equal(clientAddress(req({}, null), {}), 'unknown');
assert.equal(clientAddress({ headers: {} }, {}), 'unknown');

// Vercel: a borda grava o IP; valor inválido cai no próximo cabeçalho ou na conexão.
const vercel = { VERCEL: '1' };
assert.equal(clientAddress(req({ 'x-vercel-forwarded-for': '198.51.100.7', 'x-forwarded-for': '203.0.113.9' }), vercel), '198.51.100.7');
assert.equal(clientAddress(req({ 'x-real-ip': '198.51.100.8' }), vercel), '198.51.100.8');
assert.equal(clientAddress(req({ 'x-vercel-forwarded-for': 'nao-e-ip', 'x-forwarded-for': '198.51.100.9, 10.1.1.1' }), vercel), '198.51.100.9');
assert.equal(clientAddress(req({ 'x-forwarded-for': '<script>' }), vercel), '10.0.0.5');
assert.equal(clientAddress(req({ 'x-vercel-forwarded-for': '198.51.100.7' }), { VERCEL: '0' }), '10.0.0.5', 'só VERCEL=1 confia na borda');

// Proxy próprio declarado: vale o N-ésimo a partir da direita; o cliente só controla a esquerda.
const oneHop = { ARANDU_TRUSTED_PROXY_HOPS: '1' };
assert.equal(clientAddress(req({ 'x-forwarded-for': '6.6.6.6, 198.51.100.20' }), oneHop), '198.51.100.20', 'valor forjado à esquerda ignorado');
assert.equal(clientAddress(req({ 'x-forwarded-for': '6.6.6.6, 198.51.100.21, 10.0.0.2' }), { ARANDU_TRUSTED_PROXY_HOPS: '2' }), '198.51.100.21');
assert.equal(clientAddress(req({ 'x-forwarded-for': '198.51.100.22' }), { ARANDU_TRUSTED_PROXY_HOPS: '2' }), '10.0.0.5', 'cadeia menor que os saltos declarados: conexão direta');
assert.equal(clientAddress(req({ 'x-vercel-forwarded-for': '198.51.100.7' }), { ...oneHop, VERCEL: '1' }), '10.0.0.5', 'com proxy declarado, cabeçalho da Vercel não vale');
for (const hops of ['0', '6', '-1', 'abc', '1.5']) {
  assert.equal(clientAddress(req({ 'x-forwarded-for': '198.51.100.30' }), { ARANDU_TRUSTED_PROXY_HOPS: hops }), '10.0.0.5', `saltos inválidos: ${hops}`);
}

// IPv6: um bloco /64 é um cliente; IPv4 mapeado em IPv6 vira IPv4.
assert.equal(clientAddress(req({}, '2001:db8:abcd:12:1::5'), {}), '2001:db8:abcd:12::/64');
assert.equal(clientAddress(req({}, '2001:db8:abcd:12:ffff:ffff:ffff:ffff'), {}), '2001:db8:abcd:12::/64');
assert.equal(clientAddress(req({}, '::ffff:192.0.2.10'), {}), '192.0.2.10');
assert.equal(clientAddress(req({ 'x-vercel-forwarded-for': '[2001:db8::1]' }), vercel), '2001:db8:0:0::/64');

console.log('Client address: cabeçalho forjado ignorado fora da Vercel, borda da Vercel, proxy declarado pela direita, cadeia curta, saltos inválidos e agrupamento IPv6 /64 aprovados.');
