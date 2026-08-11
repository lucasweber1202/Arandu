#!/usr/bin/env node
import fs from 'node:fs';

const requiredFiles = [
  'api/orders.js',
  'lib/email.mjs',
  'docs/supabase-orders.sql',
  'docs/supabase-order-state-machine.sql',
  'docs/rollback/supabase-order-state-machine.rollback.sql',
  'docs/rollback/supabase-orders.rollback.sql',
  'scripts/run-staging-release.mjs',
  '.github/workflows/staging-release.yml',
  'docs/PRODUCT_READINESS_EXECUTION.md'
];

const problems = [];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) problems.push(`Arquivo obrigatório ausente: ${file}`);
}

const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8'));
for (const flow of ['cleanInstall', 'existingDatabase']) {
  if (manifest[flow]?.at(-1) !== 'docs/supabase-order-state-machine.sql') {
    problems.push(`docs/supabase-order-state-machine.sql deve ser a última migration em ${flow}.`);
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

const ordersApi = fs.readFileSync('api/orders.js', 'utf8');
if (/body\.(?:price|currency|platform_fee|artist_amount)/.test(ordersApi)) {
  problems.push('API de orders não deve confiar em preço/moeda/comissão enviados pelo navegador.');
}
if (!ordersApi.includes("const scope = 'orders.create'")) problems.push('Orders sem escopo de idempotência dedicado.');
if (!ordersApi.includes("adminSupabaseRpc('transition_order_atomic'")) problems.push('Orders não usa máquina de estados transacional.');
if (/adminSupabaseRequest\(`orders\?id=.*method: 'PATCH'/s.test(ordersApi)) problems.push('Orders ainda permite PATCH direto sem invariantes no banco.');

const env = fs.readFileSync('.env.example', 'utf8');
for (const variable of [
  'ARANDU_PACKAGING_POLICY_REFERENCE=',
  'ARANDU_EMAIL_PROVIDER=disabled',
  'ARANDU_TRANSACTIONAL_EMAIL_READY=false',
  'ARANDU_STAGING_DATABASE_URL='
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
if (/\n\s+(push|pull_request):/.test(staging)) problems.push('Staging real não pode executar automaticamente em push/PR.');

const runner = fs.readFileSync('scripts/run-staging-release.mjs', 'utf8');
if (runner.includes('ops/release-evidence.json')) {
  problems.push('Runner de staging não pode promover release-evidence automaticamente.');
}

const commercialPolicy = fs.readFileSync('lib/commercial-policy.mjs', 'utf8');
if (!commercialPolicy.includes("packaging: 'ARANDU_PACKAGING_POLICY_REFERENCE'")) {
  problems.push('Snapshot comercial não contém referência de embalagem.');
}

const email = await import(`../lib/email.mjs?check=${Date.now()}`);
if (email.listTransactionalTemplates().length !== 7) problems.push('Esperados 7 templates transacionais.');
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
