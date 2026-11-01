import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
// Keep a populated rollback probe transactional. The normal runner applies the
// complete rollback file on all install paths; here only its transaction wrappers
// are removed so the synthetic business records and DDL can be rolled back too.
const fixture=fs.readFileSync('tests/database/financial-product-terms.sql','utf8').split('do $$ declare c uuid;')[0];
const rollback=fs.readFileSync('docs/rollback/supabase-financial-platform-intelligence.rollback.sql','utf8').replace(/^begin;\s*$/mg,'').replace(/^commit;\s*$/mg,'');
const sql=fixture+'\nreset role;\n'+rollback+`\nset role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.cid(1)::text,true);
select pg_temp.crm_error(format('select public.fin_record_contract_terms(%L,%L::jsonb,1,%L)',pg_temp.crm_id('bank_guarantee'),'{}','Editor legado após rollback'),'invalid contract terms');
do $$ begin
 if not exists(select 1 from public.fin_contract_versions where contract_id=pg_temp.crm_id('bank_guarantee') and version=1 and terms ? 'product_terms') then raise exception 'rollback lost specialized history';end if;
end $$;
reset role;
rollback;`;
execFileSync('psql',[process.argv[2],'-X','-q','-v','ON_ERROR_STOP=1'],{input:sql,stdio:['pipe','pipe','pipe']});
console.log('Product terms populated rollback: history retained; legacy clients cannot remove specialized terms after withdrawal.');
