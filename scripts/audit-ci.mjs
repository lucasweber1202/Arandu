#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { classifyNpmAudit, verifyOfficialWithdrawal, GHSA_ID, GHSA_SOURCE } from '../lib/npm-audit-gate.mjs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['audit', '--audit-level=high', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  env: process.env
});

function fail(message) {
  console.error('AUDIT BLOCKED:', message);
  process.exitCode = 1;
}
if (result.error || ![0, 1].includes(result.status)) {
  fail('npm audit não pôde ser executado com segurança: ' + String(result.error?.message || result.stderr || result.status).slice(0, 500));
} else {
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { report = null; }
  const assessment = classifyNpmAudit(report);
  if (assessment.kind === 'clean' && result.status === 0) {
    console.log('npm audit high/critical: nenhum advisory ativo detectado.');
  } else if (assessment.kind === 'withdrawn-candidate' && result.status === 1) {
    // Fail closed: official live GitHub Advisory Database evidence is mandatory.
    // If the advisory is reactivated, inaccessible, malformed or exception expires,
    // the pipeline must fail rather than silently bypassing npm's audit.
    try {
      const response = await fetch(GHSA_SOURCE, {
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
        headers: { Accept: 'application/json', 'User-Agent': 'Arandu-Supply-Chain-Audit' }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const verified = verifyOfficialWithdrawal(await response.json());
      if (!verified) throw new Error('GitHub não confirma retirada válida (ou exceção expirada)');
      console.log('npm audit: única causa alta é ' + GHSA_ID +
        ', oficialmente retirado no GitHub; ' + assessment.names.length +
        ' pacotes afetados transitivamente. Nenhuma vulnerabilidade alta ativa foi aceita.');
    } catch (error) {
      fail('Não foi possível verificar advisory retirado na fonte oficial: ' + String(error.message).slice(0, 180));
    }
  } else {
    fail(assessment.reason || ('npm audit falhou com status ' + result.status + '.'));
    if (assessment.names?.length) console.error('Pacotes sinalizados: ' + assessment.names.join(', '));
  }
}
