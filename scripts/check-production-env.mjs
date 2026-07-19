#!/usr/bin/env node
const strict = process.argv.includes('--require-ready');
const checks = [];

const value = (name) => String(process.env[name] || '').trim();
const truthy = (name) => ['1', 'true', 'yes', 'sim'].includes(value(name).toLowerCase());
const validEmail = (candidate) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
const recentDate = (candidate, days = 30) => {
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Date.now() - timestamp <= days * 86400000;
};
const validSupabaseKey = (candidate) => {
  if (!candidate) return false;
  const jwtParts = candidate.split('.');
  return (jwtParts.length === 3 && jwtParts.every((part) => part.length >= 8)) || /^sb_(publishable|secret)_[A-Za-z0-9_-]{20,}$/.test(candidate);
};
const ownHttpsUrl = (candidate) => {
  try {
    const url = new URL(candidate);
    const placeholder = url.hostname === 'example.com' || url.hostname.endsWith('.example.com') || url.hostname.endsWith('.example');
    return url.protocol === 'https:' && url.hostname !== 'localhost' && !url.hostname.endsWith('.vercel.app') && !placeholder;
  } catch { return false; }
};
const supabaseUrl = (candidate) => {
  try { return new URL(candidate).protocol === 'https:'; } catch { return false; }
};
const add = (name, ok, guidance) => checks.push({ name, ok: Boolean(ok), guidance });

add('SUPABASE_URL', supabaseUrl(value('SUPABASE_URL')), 'Use a URL HTTPS do projeto Supabase.');
add('SUPABASE_ANON_KEY', validSupabaseKey(value('SUPABASE_ANON_KEY')), 'Use a anon/publishable key válida.');
add('SUPABASE_SERVICE_ROLE_KEY', validSupabaseKey(value('SUPABASE_SERVICE_ROLE_KEY')), 'Use uma service-role/secret key válida somente no servidor.');
add('Chaves Supabase distintas', value('SUPABASE_ANON_KEY') && value('SUPABASE_ANON_KEY') !== value('SUPABASE_SERVICE_ROLE_KEY'), 'Anon e service role não podem ser iguais.');
add('ARANDU_ADMIN_TOKEN', value('ARANDU_ADMIN_TOKEN').length >= 32, 'Gere um token aleatório com pelo menos 32 caracteres.');
add('ARANDU_SITE_URL', ownHttpsUrl(value('ARANDU_SITE_URL')), 'Configure HTTPS em domínio próprio.');

const whatsappDigits = value('ARANDU_WHATSAPP_NUMBER').replace(/\D/g, '');
add('Canal comercial', whatsappDigits.length >= 12 || validEmail(value('ARANDU_CONTACT_EMAIL')), 'Configure WhatsApp internacional ou e-mail comercial.');
add('Contato LGPD', validEmail(value('ARANDU_PRIVACY_CONTACT_EMAIL')), 'Configure um e-mail válido para solicitações LGPD.');
add('Marca aprovada', truthy('ARANDU_BRAND_READY'), 'Só ative depois da aprovação formal da identidade.');
add('Operação comercial aprovada', truthy('ARANDU_COMMERCIAL_READY'), 'Só ative depois da política comercial completa.');
add('Rate limit distribuído', truthy('ARANDU_DISTRIBUTED_RATE_LIMIT'), 'Só ative depois de testar a migration/provedor compartilhado.');
add('Monitoramento de erros', truthy('ARANDU_ERROR_MONITORING_READY'), 'Só ative depois de receber um erro canário no monitoramento.');
add('Restauração de backup', recentDate(value('ARANDU_BACKUP_VERIFIED_AT')), 'Registre uma restauração comprovada nos últimos 30 dias.');

const pilotEnabled = truthy('ARANDU_PILOT_ENABLED');
add('Piloto concluído', truthy('ARANDU_PILOT_APPROVED'), 'Aprove somente após a rodada fechada e zero bloqueadores críticos.');
if (pilotEnabled) {
  add('Código do piloto', value('ARANDU_PILOT_ACCESS_CODE').length >= 10, 'Use pelo menos 10 caracteres.');
  add('Segredo do piloto', value('ARANDU_PILOT_SECRET').length >= 32, 'Use pelo menos 32 caracteres aleatórios.');
}

const pending = checks.filter((item) => !item.ok);
console.log('Arandu Production Environment Check');
console.log(`Prontos: ${checks.length - pending.length}/${checks.length}`);
for (const item of checks) console.log(`${item.ok ? 'OK' : 'PENDENTE'} ${item.name}${item.ok ? '' : ` — ${item.guidance}`}`);
if (strict && pending.length) process.exit(1);
