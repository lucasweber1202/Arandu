#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const strict = process.argv.includes('--require-ready');
const root = process.cwd();
const evidencePath = path.join(root, 'ops/release-evidence.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const checks = [];

const present = (candidate) => Boolean(String(candidate || '').trim());
const validDate = (candidate) => {
  const timestamp = Date.parse(String(candidate || ''));
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};
const recentDate = (candidate, days = 30) => validDate(candidate) && Date.now() - Date.parse(candidate) <= days * 86400000;
const ownHostname = (candidate) => {
  const hostname = String(candidate || '').trim().toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) return false;
  return hostname !== 'example.com' && !hostname.endsWith('.example.com') && !hostname.endsWith('.vercel.app');
};
const add = (group, name, ok, guidance) => checks.push({ group, name, ok: Boolean(ok), guidance });

add('Supabase', 'Fluxo de migration', ['cleanInstall', 'existingDatabase'].includes(evidence.supabase?.migrationFlow), 'Registre cleanInstall ou existingDatabase.');
add('Supabase', 'Projeto identificado', String(evidence.supabase?.projectRef || '').length >= 6, 'Registre apenas o project ref, nunca chaves.');
add('Supabase', 'Migrations aplicadas', validDate(evidence.supabase?.migrationsAppliedAt), 'Registre a data após a execução completa.');
add('Supabase', 'Canário de escrita recente', recentDate(evidence.supabase?.writeCanaryAt), 'Execute check:supabase:write e registre a data.');

add('Catálogo', 'Revisão identificada', present(evidence.catalog?.reviewedBy), 'Use um papel ou identificador sem PII.');
add('Catálogo', 'Revisão datada', validDate(evidence.catalog?.reviewedAt), 'Registre a data da revisão final.');
add('Catálogo', 'Direitos de imagem', evidence.catalog?.imageRightsVerified === true, 'Confirme autorizações de todas as imagens publicadas.');
add('Catálogo', 'Preços verificados', evidence.catalog?.pricesVerified === true, 'Confirme preço e disponibilidade com os artistas.');

add('Comercial', 'Aprovação identificada', present(evidence.commercial?.approvedBy), 'Registre o papel responsável pela aprovação.');
add('Comercial', 'Aprovação datada', validDate(evidence.commercial?.approvedAt), 'Registre a data de aprovação.');
add('Comercial', 'Versão da política', present(evidence.commercial?.policyVersion), 'Registre a versão publicada da política.');
add('Comercial', 'Referência jurídica', present(evidence.commercial?.legalReviewReference), 'Registre protocolo, documento ou decisão; não inclua dados sensíveis.');

const logoAsset = String(evidence.brand?.logoAsset || '');
add('Marca', 'Aprovação identificada', present(evidence.brand?.approvedBy), 'Registre o papel responsável pela aprovação.');
add('Marca', 'Aprovação datada', validDate(evidence.brand?.approvedAt), 'Registre a data de aprovação.');
add('Marca', 'Logo final existente', present(logoAsset) && fs.existsSync(path.join(root, logoAsset)), 'Aponte para um asset final versionado.');

add('Plataforma', 'Rate limit comprovado', present(evidence.platform?.rateLimitProvider), 'Registre o provedor ou mecanismo distribuído testado.');
add('Plataforma', 'Monitoramento comprovado', present(evidence.platform?.errorMonitoringProvider), 'Registre o provedor após receber um erro canário.');
add('Plataforma', 'Contato LGPD testado', validDate(evidence.platform?.privacyContactVerifiedAt), 'Registre a data do teste do canal LGPD.');
add('Plataforma', 'Restauração recente', recentDate(evidence.platform?.backupRestoreVerifiedAt), 'Comprove uma restauração nos últimos 30 dias.');
add('Plataforma', 'Referência do backup', present(evidence.platform?.backupEvidenceReference), 'Registre um protocolo ou hash sem segredos.');

const minimumCohort = Number(evidence.pilot?.minimumCohort || 10);
const startedAt = Date.parse(String(evidence.pilot?.startedAt || ''));
const completedAt = Date.parse(String(evidence.pilot?.completedAt || ''));
add('Piloto', 'Coorte mínima', Number(evidence.pilot?.cohortSize || 0) >= minimumCohort, `Inclua pelo menos ${minimumCohort} participantes.`);
add('Piloto', 'Início registrado', Number.isFinite(startedAt), 'Registre o início da rodada.');
add('Piloto', 'Conclusão registrada', Number.isFinite(completedAt) && completedAt >= startedAt, 'Registre uma conclusão posterior ao início.');
add('Piloto', 'Zero bloqueadores críticos', evidence.pilot?.criticalBlockersOpen === 0, 'Resolva todos os bloqueadores críticos.');
add('Piloto', 'Aprovação identificada', present(evidence.pilot?.approvedBy), 'Registre o papel responsável.');
add('Piloto', 'Referência de aprovação', present(evidence.pilot?.approvalReference), 'Registre relatório, ata ou protocolo.');

add('Domínio', 'Hostname próprio', ownHostname(evidence.domain?.hostname), 'Registre o domínio final sem protocolo.');
add('Domínio', 'DNS/HTTPS verificado', validDate(evidence.domain?.verifiedAt), 'Registre a data do teste DNS/HTTPS.');

const pending = checks.filter((item) => !item.ok);
console.log('Arandu Release Evidence Check');
console.log(`Evidências: ${checks.length - pending.length}/${checks.length}`);
for (const item of checks) console.log(`${item.ok ? 'OK' : 'PENDENTE'} [${item.group}] ${item.name}${item.ok ? '' : ` — ${item.guidance}`}`);
if (strict && pending.length) process.exit(1);
