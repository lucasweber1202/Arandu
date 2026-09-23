#!/usr/bin/env node
import fs from 'node:fs';

const requiredFiles = [
  'api/orders.js',
  'api/account-orders.js',
  'api/email-dispatch.js',
  'lib/email.mjs',
  'lib/email-outbox.mjs',
  'docs/supabase-orders.sql',
  'docs/supabase-order-state-machine.sql',
  'docs/supabase-orders-hardening.sql',
  'docs/supabase-transactional-email-outbox.sql',
  'docs/supabase-retention-controls.sql',
  'docs/supabase-email-outbox-fencing.sql',
  'docs/rollback/supabase-order-state-machine.rollback.sql',
  'docs/rollback/supabase-orders-hardening.rollback.sql',
  'docs/rollback/supabase-transactional-email-outbox.rollback.sql',
  'docs/rollback/supabase-retention-controls.rollback.sql',
  'docs/rollback/supabase-email-outbox-fencing.rollback.sql',
  'docs/rollback/supabase-orders.rollback.sql',
  'scripts/run-staging-release.mjs',
  'scripts/validate-staging-environment.mjs',
  'scripts/verify-backup-restore.mjs',
  '.github/workflows/staging-release.yml',
  'docs/PRODUCT_READINESS_EXECUTION.md',
  'docs/PRODUCTION_READINESS_FINAL.md'
];

const problems = [];
for (const file of requiredFiles) if (!fs.existsSync(file)) problems.push(`Arquivo obrigatório ausente: ${file}`);

const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8'));
for (const flow of ['cleanInstall', 'existingDatabase']) {
  const migrations = manifest[flow] || [];
  const orders = migrations.indexOf('docs/supabase-orders.sql');
  const stateMachine = migrations.indexOf('docs/supabase-order-state-machine.sql');
  const hardening = migrations.indexOf('docs/supabase-orders-hardening.sql');
  const outbox = migrations.indexOf('docs/supabase-transactional-email-outbox.sql');
  const retention = migrations.indexOf('docs/supabase-retention-controls.sql');
  if (orders === -1 || stateMachine !== orders + 1 || hardening !== stateMachine + 1 || outbox !== hardening + 1 || retention !== outbox + 1) problems.push(`Sequência de pedidos/readiness inválida em ${flow}.`);
  const operationalStatus = migrations.indexOf('docs/supabase-operational-status.sql');
  if (operationalStatus !== retention + 1) problems.push(`Máquina de estados operacional deve vir logo depois da retenção em ${flow}.`);
  const profileAccess = migrations.indexOf('docs/supabase-profile-access.sql');
  if (profileAccess !== operationalStatus + 1) problems.push(`Vínculo de conta e artista deve vir logo depois da máquina de estados em ${flow}.`);
  const trailCompleteness = migrations.indexOf('docs/supabase-operational-trail-completeness.sql');
  if (trailCompleteness !== profileAccess + 1) problems.push(`Trilha operacional completa deve vir logo depois do vínculo em ${flow}.`);
  const fencing = migrations.indexOf('docs/supabase-email-outbox-fencing.sql');
  if (fencing !== trailCompleteness + 1) problems.push(`Fencing da outbox deve vir logo depois da trilha operacional completa em ${flow}.`);
  const betaEvents = migrations.indexOf('docs/supabase-beta-conversion-events.sql');
  if (betaEvents !== fencing + 1) problems.push(`Eventos de conversão da beta devem vir logo depois do fencing da outbox em ${flow}.`);
  const b2b = migrations.indexOf('docs/supabase-b2b-platform.sql');
  if (b2b !== betaEvents + 1 || b2b !== migrations.length - 1) problems.push(`Migration B2B deve vir após os eventos da beta e encerrar a sequência em ${flow}.`);
}

const sql = fs.readFileSync('docs/supabase-orders.sql', 'utf8');
for (const token of ['create table if not exists public.orders','enable row level security','create_order_atomic','complete_idempotency','audit_privileged_mutation']) if (!sql.includes(token)) problems.push(`Migration de orders sem: ${token}`);

const hardening = fs.readFileSync('docs/supabase-orders-hardening.sql', 'utf8');
for (const token of ['order_status_history','protect_order_history_append_only','protect_order_immutable_fields','Justificativa operacional é obrigatória.','from public, anon, authenticated, service_role']) if (!hardening.includes(token)) problems.push(`Hardening de orders sem: ${token}`);

const ordersApi = fs.readFileSync('api/orders.js', 'utf8');
if (/body\.(?:price|currency|platform_fee|artist_amount)/.test(ordersApi)) problems.push('API de orders não deve confiar em preço/moeda/comissão enviados pelo navegador.');
if (!ordersApi.includes("const scope = 'orders.create'")) problems.push('Orders sem escopo de idempotência dedicado.');
if (!ordersApi.includes("adminSupabaseRpc('transition_order_atomic'")) problems.push('Orders não usa máquina de estados transacional.');
if (!ordersApi.includes('justification.length < 8')) problems.push('Orders não exige justificativa operacional.');
if (/adminSupabaseRequest\(`orders\?id=.*method: 'PATCH'/s.test(ordersApi)) problems.push('Orders ainda permite PATCH direto sem invariantes no banco.');

const accountOrdersApi = fs.readFileSync('api/account-orders.js', 'utf8');
if (!accountOrdersApi.includes("hasSupabaseAccess('user')")) problems.push('Conta de pedidos não exige acesso Supabase de usuário.');
if (!accountOrdersApi.includes('userSupabaseRequest(')) problems.push('Conta de pedidos não consulta com JWT/RLS.');
if (/policy_snapshot|platform_fee|artist_amount/.test(accountOrdersApi)) problems.push('Conta de pedidos expõe campos comerciais internos.');

const env = fs.readFileSync('.env.example', 'utf8');
for (const variable of ['ARANDU_PACKAGING_POLICY_REFERENCE=','ARANDU_EMAIL_PROVIDER=disabled','ARANDU_TRANSACTIONAL_EMAIL_READY=false','ARANDU_STAGING_DATABASE_URL=','ARANDU_STAGING_SITE_URL=','ARANDU_STAGING_PROJECT_REF=','ARANDU_PRODUCTION_PROJECT_REF=','ARANDU_RESTORE_DATABASE_URL=']) if (!env.includes(variable)) problems.push(`.env.example sem ${variable}`);

const readiness = fs.readFileSync('api/readiness.js', 'utf8');
if (!readiness.includes("'orders'")) problems.push('Readiness não verifica tabela orders.');
if (!readiness.includes('transactionalEmail')) problems.push('Readiness não verifica e-mail transacional.');

const staging = fs.readFileSync('.github/workflows/staging-release.yml', 'utf8');
if (!staging.includes('workflow_dispatch:')) problems.push('Staging release deve ser manual.');
if (!staging.includes('environment: staging')) problems.push('Staging release deve usar GitHub Environment staging.');
if (!staging.includes('ARANDU-STAGING')) problems.push('Staging release sem confirmação explícita.');
if (/\n\s+(push|pull_request):/.test(staging)) problems.push('Staging real não pode executar automaticamente em push/PR.');

const runner = fs.readFileSync('scripts/run-staging-release.mjs', 'utf8');
if (runner.includes('ops/release-evidence.json')) problems.push('Runner de staging não pode promover release-evidence automaticamente.');

const commercialPolicy = fs.readFileSync('lib/commercial-policy.mjs', 'utf8');
if (!commercialPolicy.includes("packaging: 'ARANDU_PACKAGING_POLICY_REFERENCE'")) problems.push('Snapshot comercial não contém referência de embalagem.');

const email = await import(`../lib/email.mjs?check=${Date.now()}`);
// Cobertura do ciclo de vida do pedido: cada transição relevante precisa de um
// template próprio, senão o evento é enfileirado e morre sem mensagem.
const templates = email.listTransactionalTemplates();
const requiredTemplates = [
  'order_created', 'order_confirmed', 'payment_confirmed', 'order_shipped',
  'order_delivered', 'order_completed', 'order_cancelled', 'order_refunded'
];
for (const template of requiredTemplates) {
  if (!templates.includes(template)) problems.push(`Template transacional ausente: ${template}.`);
}
if (templates.length < 15) problems.push(`Esperados ao menos 15 templates transacionais, encontrados ${templates.length}.`);
const rendered = email.renderTransactionalEmail('reservation_confirmed', { artwork: '<teste>' });
if (rendered.html.includes('<teste>')) problems.push('Template de e-mail não escapou HTML.');
const previousProvider = process.env.ARANDU_EMAIL_PROVIDER;
process.env.ARANDU_EMAIL_PROVIDER = 'disabled';
const disabled = await email.sendTransactionalEmail({ template: 'contact_received', to: 'teste@example.com' });
if (previousProvider === undefined) delete process.env.ARANDU_EMAIL_PROVIDER;
else process.env.ARANDU_EMAIL_PROVIDER = previousProvider;
if (disabled.reason !== 'disabled') problems.push('Provider de e-mail deve ficar disabled durante o gate.');

if (problems.length) {
  console.error('Product readiness gate falhou:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('Product readiness gate aprovado.');
