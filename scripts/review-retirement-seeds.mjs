#!/usr/bin/env node
// Compile a read-only count query from the historical seed literals. The
// generated query returns no row content and never authorizes destruction.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';
const env={PATH:process.env.PATH,HOME:process.env.HOME,...loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL||'postgresql://postgres:postgres@localhost:5432/postgres')};
const sql=q=>execFileSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'],{env,input:q,encoding:'utf8'}).trim();
const collections=fs.readFileSync('docs/arandu-mvp-collections.sql','utf8');
const values=collections.match(/insert into curated_collections \(id, slug, title, summary, curatorial_axis, audience, position, payload\)\s*values\s*([\s\S]*?)\non conflict/)[1];
const rows=JSON.parse(sql(`with seeded(id,slug,title,summary,curatorial_axis,audience,position,payload) as (values ${values}),
 expected as(select seeded.*, 'published'::text status,null::text hero_image_url from seeded)
 select jsonb_agg(jsonb_build_array(id,md5(to_jsonb(expected)::text)) order by id) from expected;`));
const catalog=JSON.parse(sql(`select jsonb_build_array('production',md5(jsonb_build_object('id','production',
 'dataset_version','unconfigured','dataset_kind','demonstration','verified_ready',false,
 'verified_by',null,'verified_at',null,'write_verified_at',null,'write_verified_by',null,
 'notes','Catálogo ainda não aprovado para publicação.')::text));`));
const groups=[['curated_collections',rows],['catalog_releases',[catalog]]];
const count=(table,expected,match)=>{
 const literals=expected.map(([id,hash])=>`('${id}','${hash}')`).join(',');
 const query=`select count(*) n from public.${table} x join (values ${literals}) e(id,hash) on x.id=e.id where md5((to_jsonb(x)-'created_at'-'updated_at')::text) ${match?'=':'<>'} e.hash`;
 return `case when to_regclass('public.${table}') is null then 0 else (xpath('/row/n/text()',query_to_xml($seed_query$${query}$seed_query$,false,true,'')))[1]::text::bigint end`;
};
const output=`-- Generated from unchanged historical seed literals by scripts/review-retirement-seeds.mjs.
-- Exact seed content matching is a technical signal, NOT provenance/retention approval.
-- Historical decommission exempts IDs alone; modified content at those IDs
-- must be classified and preserved before any destructive acknowledgement.
begin isolation level repeatable read read only;
set local row_security=off;
select jsonb_build_object(
${groups.flatMap(([table,expected])=>[
 ` '${table}_matching_seed_rows',${count(table,expected,true)}`,
 ` '${table}_modified_exempt_rows',${count(table,expected,false)}`
]).join(',\n')},
 'classification','REQUIRES_OWNER_DECISION', 'conversion','BLOCKED') as seed_review;
rollback;
`;
assert(rows.length===4&&rows.every(r=>/^[a-f0-9]{32}$/.test(r[1])));
fs.writeFileSync('ops/sql/legacy-art-seed-review.sql',output);
console.log('Read-only retirement seed review compiled; no data, approval or deletion exported.');
