import fs from 'node:fs';

const migration = fs.readFileSync('docs/supabase-transactions-rbac-audit.sql', 'utf8');
const rollback = fs.readFileSync('docs/rollback/supabase-transactions-rbac-audit.rollback.sql', 'utf8');
const api = fs.readFileSync('api/[...path].js', 'utf8');
const commercial = fs.readFileSync('api/commercial.js', 'utf8');
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
if (/\bbody\.(total|platform_fee|artist_amount)\b/.test(commercial)) {
  issues.push('API comercial ainda confia em valores monetários do cliente.');
}

console.log('Arandu Transaction, RLS & Audit Migration Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
