import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const catalog=JSON.parse(fs.readFileSync('lib/finance/copilot-read-catalog.json'));
const statements=Object.values(catalog).map(def=>{
 if(!/^fin_[a-z_]+$/.test(def.table)||!/^[a-z_,]+$/.test(def.select))throw new Error('invalid static tool catalog');
 return `select ${def.select} from public.${def.table} limit 0;`;
});
execFileSync('psql',[process.argv[2],'-X','-q','-v','ON_ERROR_STOP=1'],{input:'set role authenticated;\n'+statements.join('\n'),stdio:['pipe','pipe','pipe']});
console.log('Copilot: every closed tool projection exists and is SELECT-authorized in real PostgreSQL.');
