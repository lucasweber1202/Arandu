import fs from 'node:fs';
import { evaluateCatalogRelease } from './lib/catalog-readiness.mjs';

const strict = process.argv.includes('--require-ready');
const enabled = ['1','true','yes','sim'].includes(String(process.env.ARANDU_PILOT_ENABLED || '').trim().toLowerCase());
const approved = ['1','true','yes','sim'].includes(String(process.env.ARANDU_PILOT_APPROVED || '').trim().toLowerCase());
const accessCode = String(process.env.ARANDU_PILOT_ACCESS_CODE || '');
const secret = String(process.env.ARANDU_PILOT_SECRET || '');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const catalog = evaluateCatalogRelease({
  artists: read('data/artists.json'),
  artworks: read('data/artworks.json'),
  release: read('data/catalog-release.json')
});
const requiredFiles = ['piloto.html','painel-piloto.html','js/pilot.js','js/pilot-page.js','js/pilot-dashboard.js','docs/supabase-sprint5-pilot.sql'];
const runtimeChecks = {
  enabled,
  accessCode: accessCode.length >= 10,
  secret: secret.length >= 32,
  catalog: catalog.verifiedReady,
  files: requiredFiles.every((file) => fs.existsSync(file))
};
const releaseChecks = {
  approved,
  catalog: runtimeChecks.catalog,
  files: runtimeChecks.files,
  runtimeConfiguration: !enabled || (runtimeChecks.accessCode && runtimeChecks.secret)
};
const runtimePending = Object.entries(runtimeChecks).filter(([, ok]) => !ok).map(([key]) => key);
const releasePending = Object.entries(releaseChecks).filter(([, ok]) => !ok).map(([key]) => key);

console.log('Arandu Closed Pilot Readiness');
console.log(`Operação do piloto: ${Object.values(runtimeChecks).filter(Boolean).length}/${Object.keys(runtimeChecks).length}`);
console.log(`Piloto em execução: ${runtimePending.length === 0}`);
console.log(`Gate de lançamento: ${Object.values(releaseChecks).filter(Boolean).length}/${Object.keys(releaseChecks).length}`);
console.log(`Piloto concluído: ${releasePending.length === 0}`);
if (runtimePending.length) console.warn(`Pendências para executar: ${runtimePending.join(', ')}.`);
if (releasePending.length) console.warn(`Pendências para lançar: ${releasePending.join(', ')}.`);
if (strict && releasePending.length) process.exit(1);
