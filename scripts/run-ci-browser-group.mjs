import { spawnSync } from 'node:child_process';
import { PRODUCT_E2E } from './e2e-suites.mjs';
import { browserProjects } from './ci-browser-groups.mjs';
const extra=process.argv.slice(2);
if(extra.some(a=>a!=='--list'))throw Error('Only --list is accepted for the fixed CI group');
const args=browserProjects(process.env.ARANDU_BROWSER_GROUP).map(p=>'--project='+p);
const r=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test',...PRODUCT_E2E,...args,...extra],{stdio:'inherit'});
if(r.error)throw Error('Browser group process failed');process.exit(r.status??1);
