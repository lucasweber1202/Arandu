import fs from 'node:fs';

const issues = [];
const api = fs.readFileSync('api/[...path].js', 'utf8');
const client = fs.readFileSync('js/pilot.js', 'utf8');
const migration = fs.readFileSync('docs/supabase-sprint5-pilot.sql', 'utf8');
const requireTerm = (source, term, message) => { if (!source.includes(term)) issues.push(message); };

requireTerm(api, 'timingSafeEqual', 'Código do piloto não usa comparação em tempo constante.');
requireTerm(api, 'HttpOnly; SameSite=Lax; Secure', 'Cookie do piloto não está protegido.');
requireTerm(api, 'pilotEventPayload', 'Eventos não possuem whitelist de payload.');
requireTerm(api, 'requirePilotAccess(req)', 'Eventos/feedback não exigem convite.');
requireTerm(api, "adminGuard(req)", 'Métricas do piloto não exigem token administrativo.');
requireTerm(client, "navigator.doNotTrack === '1'", 'Telemetria não respeita Do Not Track.');
requireTerm(migration, 'revoke all on public.pilot_events', 'Tabela de eventos aceita acesso direto.');
requireTerm(migration, 'revoke all on public.pilot_feedback', 'Tabela de feedback aceita acesso direto.');

console.log('Arandu Pilot Security Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
