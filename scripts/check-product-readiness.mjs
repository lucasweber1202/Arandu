#!/usr/bin/env node
import fs from 'node:fs';

const requiredFiles = [
  'api/orders.js',
  'api/account-orders.js',
  'lib/email.mjs',
  'lib/email-outbox.mjs',
  'docs/supabase-orders.sql',
  'docs/supabase-orders-hardening.sql',
  'docs/supabase-transactional-email-outbox.sql',
  'docs/supabase-retention-controls.sql',
  'docs/rollback/supabase-orders.rollback.sql',
  'docs/rollback/supabase-orders-hardening.rollback.sql',
  'docs/rollback/supabase-transactional-email-outbox.rollback.sql',
  'docs/rollback/supabase-retention-controls.rollback.sql',
  'scripts/database-fingerprint.mjs',
  'scripts/run-staging-release.mjs',
  '.github/workflows/staging-release.yml',
  'docs/PRODUCT_READINESS_EXECUTION.md',
  'docs/ORDERS_OPERATIONS.md',
  'docs/TRANSACTIONAL_EMAIL_OUTBOX.md'
];

const problems = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) problems.push(`Arquivo obrigatório ausente: ${file}`);
}

const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8'));
for (const flow of ['cleanInstall', 'existingDatabase']) {
  const migrations = manifest[flow] || [];
  const ordersIndex = migrations.indexOf('docs/supabase-orders.sql');
  const hardeningIndex = migrations.indexOf('docs/supabase-orders-hardening.sql');
  const outboxIndex = migrations.indexOf('docs/supabase-transactional-email-outbox.sql');
  const retentionIndex = migrations.indexOf('docs/supabase-retention-controls.sql');
  if (ordersIndex === -1) problems.push(`docs/supabase-orders.sql ausente em ${flow}.`);
  if (hardeningIndex === -1) problems.push(`docs/supabase-orders-hardening.sql ausente em ${flow}.`);
  if (outboxIndex === -1) problems.push(`docs/supabase-transactional-email-outbox.sql ausente em ${flow}.`);
  if (retentionIndex === -1) problems.push(`docs/supabase-retention-controls.sql ausente em ${flow}.`);
  if (ordersIndex !== -1 && hardeningIndex !== ordersIndex + 1) {
    problems.push(`docs/supabase-orders-hardening.sql deve vir imediatamente depois de docs/supabase-orders.sql em ${flow}.`);
  }
  if (hardeningIndex !== -1 && outboxIndex !== hardeningIndex + 1) {
    problems.push(`docs/supabase-transactional-email-outbox.sql deve vir imediatamente depois do hardening de pedidos em ${flow}.`);
  }
  if (outboxIndex !== -1 && retentionIndex !== outboxIndex + 1) {
    problems.push(`docs/supabase-retention-controls.sql deve vir imediatamente depois da outbox em ${flow}.`);
  }
  if (retentionIndex !== migrations.length - 1) {
    problems.push(`docs/supabase-retention-controls.sql deve ser a última migration em ${flow}.`);
  }
}

const sql = fs.readFileSync('docs/supabase-orders.sql', 'utf8');
for (const token of [
  'create table if not exists public.orders',
  'enable row level security',
  'create_order_atomic',
  'complete_idempotency',
  'audit_privileged_mutation'
]) {
  if (!sql.includes(token)) problems.push(`Migration de orders sem: ${token}`);
}

const hardeningSql = fs.readFileSync('docs/supabase-orders-hardening.sql', 'utf8');
for (const token of [
  'create table if not exists public.order_status_history',
  'protect_order_immutable_fields',
  'transition_order_atomic',
  'Justificativa operacional é obrigatória',
  'Pedido só pode ser concluído após pagamento, entrega e certificado'
]) {
  if (!hardeningSql.includes(token)) problems.push(`Hardening de orders sem: ${token}`);
}

const outboxSql = fs.readFileSync('docs/supabase-transactional-email-outbox.sql', 'utf8');
for (const token of [
  'create table if not exists public.transactional_email_outbox',
  'for update skip locked',
  'claim_transactional_email_batch',
  'complete_transactional_email',
  'fail_transactional_email',
  'recipient_address = null',
  'trg_orders_transactional_email'
]) {
  if (!outboxSql.includes(token)) problems.push(`Outbox transacional sem: ${token}`);
}

const retentionSql = fs.readFileSync('docs/supabase-retention-controls.sql', 'utf8');
for (const token of [
  'create table if not exists public.data_retention_policies',
  'create table if not exists public.data_legal_holds',
  'enabled boolean not null default false',
  'decision_reference',
  'is_under_legal_hold',
  'create_legal_hold',
  'release_legal_hold'
]) {
  if (!retentionSql.includes(token)) problems.push(`Controles de retenção sem: ${token}`);
}

const ordersApi = fs.readFileSync('api/orders.js', 'utf8');
if (/body\.(?:price|currency|platform_fee|artist_amount)/.test(ordersApi)) {
  problems.push('API de orders não deve confiar em preço/moeda/comissão enviados pelo navegador.');
}
if (!ordersApi.includes("const scope = 'orders.create'")) problems.push('Orders sem escopo de idempotência dedicado.');
if (!ordersApi.includes("adminSupabaseRpc('transition_order_atomic'")) problems.push('Orders não usam a state machine atômica.');
if (!ordersApi.includes('justification.length < 8')) problems.push('Orders não exigem justificativa operacional para transições.');

const accountOrdersApi = fs.readFileSync('api/account-orders.js', 'utf8');
if (!accountOrdersApi.includes("hasSupabaseAccess('user')")) problems.push('Conta de pedidos não exige acesso Supabase de usuário.');
if (!accountOrdersApi.includes('userSupabaseRequest(')) problems.push('Conta de pedidos não consulta usando JWT/RLS do comprador.');
if (/policy_snapshot|platform_fee|artist_amount/.test(accountOrdersApi)) problems.push('Conta de pedidos expõe campos comerciais internos desnecessários.');

const env = fs.readFileSync('.env.example', 'utf8');
for (const variable of [
  'ARANDU_PACKAGING_POLICY_REFERENCE=',
  'ARANDU_EMAIL_PROVIDER=disabled',
  'ARANDU_TRANSACTIONAL_EMAIL_READY=false',
  'ARANDU_STAGING_DATABASE_URL=',
  'ARANDU_STAGING_DATABASE_FINGERPRINT=',
  'ARANDU_STAGING_PROJECT_REF='
]) {
  if (!env.includes(variable)) problems.push(`.env.example sem ${variable}`);
}

const readiness = fs.readFileSync('api/readiness.js', 'utf8');
if (!readiness.includes("'orders'")) problems.push('Readiness não verifica tabela orders.');
if (!readiness.includes('transactionalEmail')) problems.push('Readiness não verifica e-mail transacional.');

const staging = fs.readFileSync('.github/workflows/staging-release.yml', 'utf8');
if (!staging.includes('workflow_dispatch:')) problems.push('Staging release deve ser manual.');
if (!staging.includes('environment: staging')) problems.push('Staging release deve usar GitHub Environment staging.');
if (!staging.includes('ARANDU-STAGING')) problems.push('Staging release sem confirmação explícita.');
if (!staging.includes('ARANDU_STAGING_DATABASE_FINGERPRINT')) problems.push('Staging release não exige fingerprint do banco.');
if (!staging.includes('ARANDU_STAGING_PROJECT_REF')) problems.push('Staging release não exige project ref esperado.');
if (/\n\s+(push|pull_request):/.test(staging)) problems.push('Staging real não pode executar automaticamente em push/PR.');

const runner = fs.readFileSync('scripts/run-staging-release.mjs', 'utf8');
if (runner.includes('ops/release-evidence.json')) {
  problems.push('Runner de staging não pode promover release-evidence automaticamente.');
}
for (const token of ['databaseFingerprint', 'expectedFingerprint', 'expectedProjectRef']) {
  if (!runner.includes(token)) problems.push(`Runner de staging sem verificação: ${token}.`);
}

const commercialPolicy = fs.readFileSync('lib/commercial-policy.mjs', 'utf8');
if (!commercialPolicy.includes("packaging: 'ARANDU_PACKAGING_POLICY_REFERENCE'")) {
  problems.push('Snapshot comercial não contém referência de embalagem.');
}

const email = await import(`../lib/email.mjs?check=${Date.now()}`);
if (email.listTransactionalTemplates().length < 10) problems.push('Esperados pelo menos 10 templates transacionais.');
for (const template of ['order_created', 'payment_confirmed', 'order_shipped']) {
  if (!email.listTransactionalTemplates().includes(template)) problems.push(`Template de pedido ausente: ${template}.`);
}
const rendered = email.renderTransactionalEmail('reservation_confirmed', { artwork: '<teste>' });
if (rendered.html.includes('<teste>')) problems.push('Template de e-mail não escapou HTML.');
const previousProvider = process.env.ARANDU_EMAIL_PROVIDER;
process.env.ARANDU_EMAIL_PROVIDER = 'disabled';
const disabled = await email.sendTransactionalEmail({
  template: 'contact_received',
  to: 'teste@example.com'
});
if (previousProvider === undefined) delete process.env.ARANDU_EMAIL_PROVIDER;
else process.env.ARANDU_EMAIL_PROVIDER = previousProvider;
if (disabled.reason !== 'disabled') problems.push('Provider de e-mail deve ficar disabled durante o gate.');

if (problems.length) {
  console.error('Product readiness gate falhou:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('Product readiness gate aprovado.');
