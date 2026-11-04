import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {PRODUCT_E2E} from './e2e-suites.mjs';
for(const suite of PRODUCT_E2E)if(!existsSync(suite))throw Error(`Product suite missing: ${suite}`);
const r=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test',...PRODUCT_E2E,...process.argv.slice(2)],{stdio:'inherit'});
if(r.error)throw r.error;process.exit(r.status??1);
