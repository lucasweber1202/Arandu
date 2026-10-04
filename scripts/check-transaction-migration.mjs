import fs from 'node:fs';

const outbox = fs.readFileSync('docs/supabase-transactional-email-outbox.sql', 'utf8');
const outboxFencing = fs.readFileSync('docs/supabase-email-outbox-fencing.sql', 'utf8');
const issues = [];

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) issues.push(message);
}

// Infraestrutura compartilhada que sobreviveu à aposentadoria da vertical de
// arte (docs/LEGACY_ART_RETIREMENT.md): a outbox transacional com fencing. A
// idempotência, a auditoria e as invariantes de reserva, proposta curatorial,
// pedido e catálogo eram só da vertical; as migrations históricas seguem
// imutáveis e a migration de decommission remove esses objetos.
for (const pattern of [
  /create table if not exists public\.transactional_email_outbox/i,
  /for update skip locked/i,
  /claim_transactional_email_batch/i,
  /complete_transactional_email/i,
  /fail_transactional_email/i,
  /recipient_address = null/i
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

console.log('Arandu Shared Transaction & Outbox Migration Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
