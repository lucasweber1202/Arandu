import fs from 'node:fs';

const migration = fs.readFileSync('docs/supabase-transactions-rbac-audit.sql', 'utf8');
const rollback = fs.readFileSync('docs/rollback/supabase-transactions-rbac-audit.rollback.sql', 'utf8');
const api = [
  'api/[...path].js',
  ...fs.readdirSync('lib/api/domains').filter((name) => name.endsWith('.mjs')).map((name) => `lib/api/domains/${name}`)
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const commercial = fs.readFileSync('api/commercial.js', 'utf8');
const ordersApi = fs.readFileSync('api/orders.js', 'utf8');
const accountOrdersApi = fs.readFileSync('api/account-orders.js', 'utf8');
const stateMachine = fs.readFileSync('docs/supabase-order-state-machine.sql', 'utf8');
const ordersHardening = fs.readFileSync('docs/supabase-orders-hardening.sql', 'utf8');
const outbox = fs.readFileSync('docs/supabase-transactional-email-outbox.sql', 'utf8');
const outboxFencing = fs.readFileSync('docs/supabase-email-outbox-fencing.sql', 'utf8');
const issues = [];

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) issues.push(message);
}

requirePattern(migration, /uq_reservations_one_active_artwork[\s\S]*status in \('requested', 'confirmed'\)/i, 'Reserva ativa não possui índice único parcial.');
requirePattern(migration, /create_reservation_atomic[\s\S]*for update/i, 'RPC de reserva não bloqueia a obra.');
requirePattern(migration, /create_proposal_atomic[\s\S]*insert into public\.proposal_items/i, 'RPC de proposta não cria itens na mesma função.');
requirePattern(migration, /acquire_idempotency[\s\S]*pg_advisory_xact_lock/i, 'Aquisição de idempotência não está serializada.');
requirePattern(migration, /identity_hash/i, 'Idempotência não está vinculada à identidade.');
requirePattern(migration, /request_hash/i, 'Idempotência não está vinculada ao payload.');
requirePattern(migration, /policy_snapshot jsonb/i, 'Snapshot imutável da política comercial não é persistido.');
requirePattern(api, /p_policy_snapshot: policy/i, 'API pública não envia o snapshot completo da política do servidor.');
requirePattern(commercial, /p_policy_snapshot: commercialPolicy/i, 'API comercial não envia o snapshot completo da política do servidor.');
requirePattern(migration, /status in \('processing', 'completed', 'failed'\)/i, 'Estados de idempotência estão incompletos.');
requirePattern(migration, /revoke insert, update, delete on public\.reservations from anon, authenticated/i, 'Escrita direta em reservas continua aberta.');
requirePattern(migration, /revoke insert, update, delete on public\.proposals from anon, authenticated/i, 'Escrita direta em propostas continua aberta.');
requirePattern(migration, /drop policy if exists artist_submissions_public_insert/i, 'Policy pública de submissões não foi removida.');
requirePattern(migration, /drop policy if exists newsletter_public_insert/i, 'Policy pública de newsletter não foi removida.');
requirePattern(migration, /privacy_requests_select_own[\s\S]*auth\.uid\(\) = user_id/i, 'RLS própria de solicitações LGPD ausente.');
requirePattern(migration, /audit_privileged_mutation[\s\S]*arandu_safe_audit_state/i, 'Auditoria transacional minimizada ausente.');
requirePattern(migration, /apply_catalog_review_atomic[\s\S]*catalog_review_history[\s\S]*audit_logs/i, 'Revisão editorial não atualiza histórico e auditoria atomicamente.');
requirePattern(rollback, /drop function if exists public\.create_reservation_atomic/i, 'Rollback não remove RPC de reserva.');
requirePattern(api, /adminSupabaseRpc\('create_reservation_atomic'/, 'API de reserva não usa RPC atômica.');
requirePattern(api, /adminSupabaseRpc\('create_proposal_atomic'/, 'API de proposta não usa RPC atômica.');
requirePattern(api, /userSupabaseRequest\(session\.accessToken/, 'Rotas de conta não exercitam JWT e RLS.');
requirePattern(api, /adminSupabaseRpc\('apply_catalog_review_atomic'/, 'Revisão editorial não usa RPC transacional.');
requirePattern(commercial, /create_commercial_record_atomic/, 'Operação comercial não é transacional.');
requirePattern(commercial, /requireCommercialPolicy/, 'Comissão não vem da política completa e versionada do servidor.');
if (/\bbody\.(total|platform_fee|artist_amount)\b/.test(commercial)) issues.push('API comercial ainda confia em valores monetários do cliente.');

requirePattern(stateMachine, /select \* into v_order from public\.orders where id = p_order_id for update/i, 'State machine base não bloqueia o pedido.');
requirePattern(stateMachine, /Pagamento pago exige pedido confirmado/i, 'State machine base perdeu a invariante de pagamento.');
requirePattern(stateMachine, /Emissão do certificado exige pagamento e entrega/i, 'State machine base perdeu a invariante de certificado.');
requirePattern(stateMachine, /update public\.artworks set status = 'sold'/i, 'State machine base não sincroniza obra vendida.');

requirePattern(ordersHardening, /create table if not exists public\.order_status_history/i, 'Hardening não cria histórico de pedidos.');
requirePattern(ordersHardening, /protect_order_history_append_only/i, 'Histórico de pedidos não está protegido como append-only.');
requirePattern(ordersHardening, /protect_order_immutable_fields/i, 'Hardening não protege snapshots financeiros.');
requirePattern(ordersHardening, /Justificativa operacional é obrigatória/i, 'Hardening não exige justificativa operacional.');
for (const invariant of [
  'Pedido não pode ser cancelado no estado operacional atual.',
  'Pagamento pago exige pedido confirmado.',
  'Fulfillment exige pedido confirmado e pagamento pago.',
  'Certificado pronto exige pagamento pago.',
  'Emissão do certificado exige pagamento e entrega.',
  'Conclusão exige pagamento, entrega e certificado resolvido.'
]) {
  if (!ordersHardening.includes(invariant)) issues.push(`Hardening perdeu invariante da PR #38: ${invariant}`);
}
requirePattern(ordersHardening, /set_config\('request\.headers'/i, 'Hardening não propaga contexto de auditoria.');
requirePattern(ordersHardening, /update public\.artworks set status = 'sold'/i, 'Hardening não sincroniza obra concluída.');
requirePattern(ordersHardening, /from public, anon, authenticated, service_role/i, 'Assinatura antiga não é revogada do service_role durante o hardening.');

requirePattern(ordersApi, /adminSupabaseRpc\('transition_order_atomic'/, 'API de orders não usa RPC atômica.');
requirePattern(ordersApi, /justification\.length < 8/, 'API de orders não exige justificativa.');
requirePattern(ordersApi, /p_tracking_code:/, 'API de orders não encaminha tracking.');
requirePattern(ordersApi, /p_shipping_provider:/, 'API de orders não encaminha transportadora.');
if (/adminSupabaseRequest\(`orders\?id=.*method: 'PATCH'/s.test(ordersApi)) issues.push('Orders ainda permite PATCH direto no banco.');

requirePattern(accountOrdersApi, /hasSupabaseAccess\('user'\)/, 'Conta de pedidos não exige acesso Supabase de usuário.');
requirePattern(accountOrdersApi, /userSupabaseRequest\(/, 'Conta de pedidos não usa JWT/RLS do comprador.');
if (/policy_snapshot|platform_fee|artist_amount/.test(accountOrdersApi)) issues.push('Conta de pedidos expõe campos comerciais internos desnecessários.');

for (const pattern of [
  /create table if not exists public\.transactional_email_outbox/i,
  /for update skip locked/i,
  /claim_transactional_email_batch/i,
  /complete_transactional_email/i,
  /fail_transactional_email/i,
  /recipient_address = null/i,
  /trg_orders_transactional_email/i
]) requirePattern(outbox, pattern, `Outbox transacional incompleta: ${pattern}`);

for (const pattern of [
  /claim_token uuid/i,
  /lease_expires_at timestamptz/i,
  /for update skip locked/i,
  /claim_transactional_email_batch_v2/i,
  /complete_transactional_email_v2[\s\S]*claim_token = p_claim_token[\s\S]*lease_expires_at > now\(\)/i,
  /fail_transactional_email_v2[\s\S]*claim_token = p_claim_token[\s\S]*lease_expires_at > now\(\)/i,
  /revoke all on function public\.complete_transactional_email\(uuid,text,text\) from service_role/i
]) requirePattern(outboxFencing, pattern, `Fencing da outbox incompleto: ${pattern}`);

console.log('Arandu Transaction, RLS & Audit Migration Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
