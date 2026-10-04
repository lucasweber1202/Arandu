import fs from 'node:fs';
const issues=[];const read=(file)=>fs.readFileSync(file,'utf8');const api=[
  read('api/[...path].js'),
  ...fs.readdirSync('lib/api/domains').filter((file)=>file.endsWith('.mjs')).map((file)=>read(`lib/api/domains/${file}`))
].join('\n');const migration=read('docs/supabase-sprint6-12-platform.sql');
function need(file,source,term,message){if(!source.includes(term))issues.push(`${file}: ${message}`);}
need('api/[...path].js',api,'publicDataRequest','não separa leitura pública da service role.');
need('api/[...path].js',api,'SUPABASE_ANON_KEY','não exige chave anônima nas views públicas.');
need('api/[...path].js',api,'consume_rate_limit','não usa rate limit distribuído.');
need('api/[...path].js',api,'beginIdempotency','reservas e propostas não possuem idempotência.');
need('api/[...path].js',api,'handleCatalogReview','workflow editorial ausente.');
need('api/[...path].js',api,'handlePrivacy','fluxo LGPD ausente.');
need('api/[...path].js',api,"action === 'reset-password'",'recuperação de senha ausente.');
need('api/[...path].js',api,'handleConversionEvents','métricas consentidas ausentes.');
need('docs/supabase-sprint6-12-platform.sql',migration,'catalog_review_history','migration não cria histórico editorial.');
need('docs/supabase-sprint6-12-platform.sql',migration,'privacy_requests','migration não cria solicitações LGPD.');
need('docs/supabase-sprint6-12-platform.sql',migration,'idempotency_keys','migration não cria chaves de idempotência.');
if (!read('vite.config.js').includes('const pages = [') || read('vite.config.js').includes('collectHtmlFiles('))
  issues.push('vite.config.js: entradas HTML precisam de lista explícita para não publicar relatórios ou legado.');
if(/async function publicDataRequest[\s\S]{0,900}SUPABASE_SERVICE_KEY/.test(api))issues.push('api/[...path].js: leitura pública ainda referencia a service role.');
console.log('Arandu Platform Hardening Check');console.log(`Erros: ${issues.length}`);issues.forEach((item)=>console.error(`- ${item}`));if(issues.length)process.exit(1);
