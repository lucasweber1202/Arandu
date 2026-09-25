import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/supabase-migrations.json');
const issues = [];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const [flow, files] of Object.entries(manifest)) {
  if (!Array.isArray(files) || !files.length) {
    issues.push(`${flow}: sequência vazia.`);
    continue;
  }
  if (new Set(files).size !== files.length) issues.push(`${flow}: contém migration duplicada.`);
  files.forEach((file) => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) issues.push(`${flow}: arquivo ausente ${file}.`);
    else if (!fs.readFileSync(absolute, 'utf8').trim()) issues.push(`${flow}: arquivo vazio ${file}.`);
  });
  const sprint2 = files.indexOf('docs/supabase-sprint2-catalog-readiness.sql');
  const collections = files.indexOf('docs/arandu-mvp-collections.sql');
  const sprint5 = files.indexOf('docs/supabase-sprint5-pilot.sql');
  const platform = files.indexOf('docs/supabase-sprint6-12-platform.sql');
  const commercial = files.indexOf('docs/supabase-commercial.sql');
  const transactions = files.indexOf('docs/supabase-transactions-rbac-audit.sql');
  const orders = files.indexOf('docs/supabase-orders.sql');
  const orderStateMachine = files.indexOf('docs/supabase-order-state-machine.sql');
  const ordersHardening = files.indexOf('docs/supabase-orders-hardening.sql');
  const emailOutbox = files.indexOf('docs/supabase-transactional-email-outbox.sql');
  const retention = files.indexOf('docs/supabase-retention-controls.sql');
  const operationalStatus = files.indexOf('docs/supabase-operational-status.sql');
  const profileAccess = files.indexOf('docs/supabase-profile-access.sql');
  const trailCompleteness = files.indexOf('docs/supabase-operational-trail-completeness.sql');
  const emailFencing = files.indexOf('docs/supabase-email-outbox-fencing.sql');
  const production = files.indexOf('docs/supabase-production.sql');
  if (sprint2 === -1) issues.push(`${flow}: migration do Sprint 2 ausente.`);
  if (sprint5 === -1) issues.push(`${flow}: migration do Sprint 5 ausente.`);
  if (platform === -1) issues.push(`${flow}: migration dos Sprints 6 a 12 ausente.`);
  if (commercial === -1) issues.push(`${flow}: migration comercial canônica ausente.`);
  if (transactions === -1) issues.push(`${flow}: migration transacional/RLS ausente.`);
  if (orders === -1) issues.push(`${flow}: migration de pedidos ausente.`);
  if (orderStateMachine === -1) issues.push(`${flow}: máquina de estados de pedidos ausente.`);
  if (ordersHardening === -1) issues.push(`${flow}: hardening de pedidos ausente.`);
  if (emailOutbox === -1) issues.push(`${flow}: outbox transacional ausente.`);
  if (retention === -1) issues.push(`${flow}: controles de retenção ausentes.`);
  if (collections === -1) issues.push(`${flow}: migration de coleções públicas ausente.`);
  if (production === -1) issues.push(`${flow}: migration de produção ausente.`);
  if (sprint2 !== -1 && production !== -1 && sprint2 < production) issues.push(`${flow}: a migration do Sprint 2 precisa vir depois da camada de produção para fechar as políticas.`);
  if (sprint5 < sprint2) issues.push(`${flow}: a migration do Sprint 5 precisa vir depois do gate de catálogo.`);
  if (collections !== -1 && sprint2 !== -1 && collections < sprint2) issues.push(`${flow}: coleções precisam vir depois do gate de catálogo.`);
  if (collections !== -1 && sprint5 !== -1 && collections > sprint5) issues.push(`${flow}: coleções precisam vir antes da telemetria do piloto.`);
  if (platform !== -1 && sprint5 !== -1 && platform < sprint5) issues.push(`${flow}: hardening da plataforma precisa vir depois da migration do piloto.`);
  if (commercial !== -1 && platform !== -1 && commercial < platform) issues.push(`${flow}: tabelas comerciais precisam vir depois do hardening da plataforma.`);
  if (transactions !== -1 && commercial !== -1 && transactions < commercial) issues.push(`${flow}: transações/RLS precisam vir depois das tabelas comerciais.`);
  if (orders !== -1 && transactions !== -1 && orders < transactions) issues.push(`${flow}: pedidos precisam vir depois da camada transacional.`);
  if (orders !== -1 && orderStateMachine !== orders + 1) issues.push(`${flow}: state machine deve vir imediatamente depois de orders.`);
  if (orderStateMachine !== -1 && ordersHardening !== orderStateMachine + 1) issues.push(`${flow}: hardening deve vir imediatamente depois da state machine da PR #38.`);
  if (ordersHardening !== -1 && emailOutbox !== ordersHardening + 1) issues.push(`${flow}: outbox deve vir imediatamente depois do hardening de pedidos.`);
  if (emailOutbox !== -1 && retention !== emailOutbox + 1) issues.push(`${flow}: retenção deve vir imediatamente depois da outbox.`);
  if (operationalStatus === -1) issues.push(`${flow}: máquina de estados operacional ausente.`);
  if (retention !== -1 && operationalStatus !== retention + 1) issues.push(`${flow}: a máquina de estados operacional deve vir imediatamente depois dos controles de retenção.`);
  if (profileAccess === -1) issues.push(`${flow}: vínculo de conta e artista ausente.`);
  if (operationalStatus !== -1 && profileAccess !== operationalStatus + 1) issues.push(`${flow}: o vínculo de conta e artista deve vir imediatamente depois da máquina de estados operacional.`);
  if (trailCompleteness === -1) issues.push(`${flow}: trilha operacional completa ausente.`);
  if (profileAccess !== -1 && trailCompleteness !== profileAccess + 1) issues.push(`${flow}: a trilha completa deve vir imediatamente depois do vínculo de conta e artista.`);
  // O fencing da outbox foi escrito quando a retenção encerrava a sequência. Como
  // as migrations dos PRs #43–#45 entraram depois dela, ele deixou de ser o
  // último, mas continua imediatamente depois da trilha operacional completa.
  if (emailFencing === -1) issues.push(`${flow}: fencing da outbox ausente.`);
  if (trailCompleteness !== -1 && emailFencing !== trailCompleteness + 1) issues.push(`${flow}: o fencing da outbox deve vir imediatamente depois da trilha operacional completa.`);
  // A ampliação do vocabulário de eventos depende da tabela criada nos Sprints
  // 6 a 12 e encerra a sequência atual.
  const betaEvents = files.indexOf('docs/supabase-beta-conversion-events.sql');
  if (betaEvents === -1) issues.push(`${flow}: eventos de conversão da beta ausentes.`);
  if (betaEvents !== -1 && platform !== -1 && betaEvents < platform) issues.push(`${flow}: os eventos da beta precisam vir depois do hardening da plataforma.`);
  // O procurement financeiro B2B é aditivo e depende apenas de auth.users, mas
  // encerra a sequência para que a instalação limpa e o upgrade tenham a mesma
  // ordem canônica.
  const financial = files.indexOf('docs/supabase-financial-procurement.sql');
  if (financial === -1) issues.push(`${flow}: migration de procurement financeiro ausente.`);
  if (betaEvents !== -1 && financial !== betaEvents + 1) issues.push(`${flow}: o procurement financeiro deve vir imediatamente depois dos eventos de conversão da beta.`);
  // O endurecimento depende das tabelas e funções criadas pela migration
  // anterior, então vem logo depois dela e encerra a sequência.
  const financialHardening = files.indexOf('docs/supabase-financial-procurement-hardening.sql');
  if (financialHardening === -1) issues.push(`${flow}: endurecimento do procurement financeiro ausente.`);
  if (financial !== -1 && financialHardening !== financial + 1) issues.push(`${flow}: o endurecimento deve vir imediatamente depois do procurement financeiro.`);
  // Os controles de piloto dependem das tabelas e funções das duas anteriores.
  const financialPilot = files.indexOf('docs/supabase-financial-pilot.sql');
  if (financialPilot === -1) issues.push(`${flow}: controles de piloto financeiro ausentes.`);
  if (financialHardening !== -1 && financialPilot !== financialHardening + 1) issues.push(`${flow}: os controles de piloto devem vir imediatamente depois do endurecimento.`);
  const approvals = files.indexOf('docs/supabase-financial-enterprise-approvals.sql');
  if (approvals === -1) issues.push(`${flow}: aprovação empresarial ausente.`);
  if (financialPilot !== -1 && approvals !== financialPilot + 1) issues.push(`${flow}: a aprovação deve vir depois dos controles de piloto.`);
  const drafts = files.indexOf('docs/supabase-financial-enterprise-drafts.sql');
  if (drafts === -1) issues.push(`${flow}: rascunhos persistidos ausentes.`);
  if (approvals !== -1 && drafts !== approvals + 1) issues.push(`${flow}: rascunhos devem vir depois de aprovações.`);
  const collaboration = files.indexOf('docs/supabase-financial-collaboration.sql');
  if (collaboration === -1) issues.push(`${flow}: colaboração financeira ausente.`);
  if (drafts !== -1 && collaboration !== drafts + 1) issues.push(`${flow}: colaboração deve vir depois dos rascunhos.`);
  const search = files.indexOf('docs/supabase-financial-operational-search.sql');
  if (search === -1) issues.push(`${flow}: busca financeira ausente.`);
  if (collaboration !== -1 && search !== collaboration + 1) issues.push(`${flow}: busca deve vir depois da colaboração.`);
  const renewals = files.indexOf('docs/supabase-financial-renewals.sql');
  if (renewals === -1) issues.push(`${flow}: renovação financeira ausente.`);
  if (search !== -1 && renewals !== search + 1) issues.push(`${flow}: renovação deve vir depois da busca.`);
  const editor = files.indexOf('docs/supabase-financial-rfq-editor.sql');
  if (editor === -1) issues.push(`${flow}: editor persistente de RFQ ausente.`);
  if (renewals !== -1 && editor !== renewals + 1) issues.push(`${flow}: editor deve vir depois da renovação.`);
  if (editor !== -1 && editor !== files.length - 1) issues.push(`${flow}: editor deve encerrar a sequência atual.`);
}

console.log('Arandu Migration Order Check');
console.log(`Fluxos: ${Object.keys(manifest).length}`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
