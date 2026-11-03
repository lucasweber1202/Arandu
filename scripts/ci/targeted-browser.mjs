import {spawnSync} from 'node:child_process';
const suites=JSON.parse(process.env.CI_SUITES);
if(!Array.isArray(suites)||!suites.length||suites.some(s=>!/^tests\/e2e\/[a-z0-9-]+\.spec\.js$/.test(s)))throw Error('Invalid suites');
const r=spawnSync('npx',['playwright','test',...suites,'--project=chromium-desktop','--project=mobile-chrome'],{stdio:'inherit'});
if(r.error)throw r.error;process.exit(r.status??1);
