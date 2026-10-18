// Veredito da verificação hospedada (scripts/demo/hosted-parity.mjs): só READY
// com tudo comprovado; falta de acesso, transporte ou "não verificado" nunca
// viram PASS. Sem rede: testa a regra pura.
import { test, expect } from '@playwright/test';
import { transportOutcome, verdict } from '../../scripts/demo/hosted-parity-verdict.mjs';

const pass = (id) => ({ id, result: 'PASS' });

test('transporte: sem resposta, proteção de deploy e 5xx de terceiros não são resposta da aplicação', () => {
  expect(transportOutcome({ status: 0 })).toBe('UNKNOWN');
  expect(transportOutcome({ status: 401, app: false })).toBe('BLOCKED');
  expect(transportOutcome({ status: 403, app: false })).toBe('BLOCKED');
  expect(transportOutcome({ status: 502, app: false })).toBe('UNKNOWN');
  // 401 da própria aplicação (JSON) é resposta lida: o item decide PASS/FAIL.
  expect(transportOutcome({ status: 401, app: true })).toBeNull();
  expect(transportOutcome({ status: 503, app: true })).toBeNull();
  expect(transportOutcome({ status: 404, app: false })).toBeNull();
});

test('veredito: falha comprovada prevalece; acesso e transporte nunca viram READY', () => {
  expect(verdict([pass('a'), pass('b')])).toBe('READY');
  expect(verdict([pass('a'), { id: 'b', result: 'FAIL' }, { id: 'c', result: 'BLOCKED' }])).toBe('NOT_READY');
  expect(verdict([pass('a'), { id: 'b', result: 'BLOCKED' }, { id: 'c', result: 'UNKNOWN' }])).toBe('ACCESS_BLOCKED');
  expect(verdict([pass('a'), { id: 'b', result: 'UNKNOWN' }])).toBe('INCONCLUSIVE');
  expect(verdict([])).toBe('INCONCLUSIVE');
});

test('veredito: "não verificado" só é aceito para o SHA no laboratório local', () => {
  const sha = { id: 'release-sha', result: 'NOT_RUN' };
  expect(verdict([pass('a'), sha])).toBe('INCONCLUSIVE');
  expect(verdict([pass('a'), sha], { local: true })).toBe('READY');
  expect(verdict([pass('a'), { id: 'readiness', result: 'NOT_RUN' }], { local: true })).toBe('INCONCLUSIVE');
});
