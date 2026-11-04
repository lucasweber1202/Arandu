// Seed identity is not provenance: detect modified content at exempt IDs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loopbackTarget } from '../../lib/recovery-reconciliation.mjs';
const connection=loopbackTarget(process.env.ARANDU_DATABASE_TEST_URL||'postgresql://postgres:postgres@localhost:5432/postgres');
const env={PATH:process.env.PATH,HOME:process.env.HOME,...connection};
const db=`arandu_seed_review_${randomBytes(6).toString('hex')}`;
const sql=(query,database=db)=>execFileSync('psql',['-XqAt','-v','ON_ERROR_STOP=1'],{env:{...env,PGDATABASE:database},input:query,encoding:'utf8'}).trim();
const review=()=>JSON.parse(sql(fs.readFileSync('ops/sql/legacy-art-seed-review.sql','utf8')));
let created=false;
try {
  sql(`create database ${db}`,connection.PGDATABASE);created=true;
  assert.equal(review().curated_collections_matching_seed_rows,0,'Missing legacy tables must be harmless');
  const collections=fs.readFileSync('docs/arandu-mvp-collections.sql','utf8');
  const catalog=fs.readFileSync('docs/supabase-sprint2-catalog-readiness.sql','utf8');
  for(const [text,name] of [[collections,'curated_collections'],[catalog,'public.catalog_releases']]) {
    sql(text.match(new RegExp(`create table if not exists ${name.replaceAll('.','\\.')} \\([\\s\\S]*?\\n\\);`))[0]);
    sql(text.match(new RegExp(`insert into ${name.replaceAll('.','\\.')} \\([\\s\\S]*?;`))[0]);
  }
  assert.equal(review().curated_collections_matching_seed_rows,4);
  assert.equal(review().catalog_releases_matching_seed_rows,1);
  sql("update public.curated_collections set payload='\"changed synthetic content\"'::jsonb where id='casa'; update public.catalog_releases set notes='changed synthetic content' where id='production';");
  const changed=review();
  assert.equal(changed.curated_collections_modified_exempt_rows,1);
  assert.equal(changed.catalog_releases_modified_exempt_rows,1);
  assert.equal(changed.conversion,'BLOCKED');
  assert(!JSON.stringify(changed).includes('changed synthetic content'),'Review leaked row contents');
  assert.equal(sql('select count(*) from public.curated_collections'),'4','Read-only review changed rows');
  console.log('Legacy seed review: missing tables, exact historical seeds, modified exempt IDs and no content disclosure PASS.');
} finally {if(created)sql(`drop database ${db} with(force)`,connection.PGDATABASE);}
