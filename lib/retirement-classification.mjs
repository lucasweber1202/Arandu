// Metadata-only decision worksheet; never authorizes deletion or cutover.
import { inventoryDigest } from './consolidation-readiness.mjs';
import { RECOVERY_REFS } from './pilot-backup-preflight.mjs';
const id = value => typeof value==='string' && /^[a-z][a-z0-9_]*$/.test(value);
const relation = value => id(value) || typeof value==='string' && /^(public|auth|storage)\.[a-z][a-z0-9_]*$/.test(value);
const reference = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,159}$/.test(value) && !/password|secret|token|pending|placeholder/i.test(value);
const personal = /(^|_)(name|email|phone|whatsapp|address|user_id|ip|key|issued_to|author|owner)(_|$)/;
const opaque = /json|text|ARRAY/i;
const categories={artists:'artist_identity_and_rights',artworks:'catalog_and_rights',certificates:'certificate_and_recipient',leads:'commercial_contact',reservations:'commercial_commitment',curated_collections:'editorial',catalog_releases:'catalog_marker',api_rate_limits:'operational_identifiers',fin_job_runs:'financial_job_audit',fin_settings:'financial_configuration'};
export function classifyRetirement(audit, columns, decisions={}, {now=new Date()}={}) {
  if(!RECOVERY_REFS.includes(audit?.ref)||!audit.inventory||!Array.isArray(audit.inventory.tables)||columns?.project_ref!==audit.ref||!Array.isArray(columns.columns))throw new Error('Invalid classification metadata.');
  const i=audit.inventory;
  const counts=i.tables.map(t=>{if(!id(t.name)||!Number.isSafeInteger(t.rows)||t.rows<0)throw new Error('Invalid table counts.');return {table_name:t.name,rows:t.rows};}).sort((a,b)=>a.table_name.localeCompare(b.table_name));
  if(new Set(counts.map(t=>t.table_name)).size!==counts.length)throw new Error('Duplicate table metadata.');
  const snapshot={observed_at:audit.observed_at,table_counts:counts,public_rows:counts.reduce((n,t)=>n+t.rows,0),auth_users:i.auth?.users,storage_objects:i.storage?.objects};
  // Bind decisions to complete source metadata (including dependencies/columns), not just counts.
  const sha=inventoryDigest(audit.ref,{snapshot,metadata:i,columns:columns.columns});
  const observed=[audit.observed_at,columns.observed_at].map(Date.parse);
  const fresh=observed.every(t=>Number.isFinite(t)&&t<=now.getTime()&&now.getTime()-t<=86400000);
  const bound=decisions.project_ref===audit.ref&&decisions.inventory_sha256===sha;
  const objects=counts.map(({table_name:table,rows})=>{
    const fields=columns.columns.filter(c=>c.table===table&&id(c.column));
    if(rows&&!fields.length)throw new Error('Nonempty table missing column metadata.');
    const dependencies=(i.foreign_keys||[]).filter(f=>f.table===table||f.target===table).map(f=>({table:f.table,target:f.target})).filter(f=>relation(f.table)&&relation(f.target));
    const triggers=(i.triggers||[]).filter(t=>t.table==='public.'+table||(table==='profiles'&&t.table==='auth.users')).map(t=>({table:t.table,function:t.function})).filter(t=>/^(public|auth)\.[a-z][a-z0-9_]*$/.test(t.table)&&id(t.function));
    const d=bound?decisions.objects?.[table]:null;
    const reviewed=Boolean(fresh&&d&&Number.isFinite(Date.parse(d.decided_at))&&Date.parse(d.decided_at)<=now.getTime()&&Date.parse(d.decided_at)>=Date.parse(audit.observed_at)&&['personal','customer','synthetic','operational','unknown'].includes(d.classification)&&d.classification!=='unknown'&&['retain','review_disposal'].includes(d.disposition)&&typeof d.legal_hold==='boolean'&&reference(d.provenance_reference)&&reference(d.retention_reference)&&reference(d.custody_reference)&&reference(d.decision_reference)&&reference(d.decider_reference));
    const status=!rows?'EMPTY_AT_SNAPSHOT':!reviewed?'UNCLASSIFIED':d.legal_hold?'LEGAL_HOLD':d.disposition==='retain'?'RETAIN':'DISPOSAL_REVIEW_REQUESTED';
    return {table,rows,category:categories[table]||'unclassified_object',potential_personal_fields:fields.filter(c=>personal.test(c.column)).map(c=>c.column),opaque_fields_requiring_private_review:fields.filter(c=>opaque.test(c.type)).map(c=>c.column),dependencies,triggers,
      owner_evidence:reviewed?Object.fromEntries(['decided_at','provenance_reference','retention_reference','custody_reference','decision_reference','decider_reference'].map(k=>[k,d[k]])):null,
      status,classification:reviewed?d.classification:'unknown',retention:reviewed?'OWNER_REFERENCE_RECORDED':'NOT_PROVEN',
      preservation:'ENCRYPTED_SAME_BACKUP_RESTORE_REQUIRED',disposal_criteria:['owner_classification','retention_satisfied','no_legal_hold','verified_recovery','separate_specific_authorization'],
      required_owner_fields:reviewed?[]:['classification','disposition','legal_hold','decided_at','provenance_reference','retention_reference','custody_reference','decision_reference','decider_reference'],
      deletion_authorized:false};
  });
  return {tool:'arandu-retirement-classification',project_ref:audit.ref,observed_at:audit.observed_at,inventory_sha256:sha,inventory_fresh:fresh,decisions_bound:bound,public_rows:snapshot.public_rows,
    result:objects.some(t=>t.rows&&t.status==='UNCLASSIFIED')?'OWNER_DECISION_REQUIRED':'CLASSIFICATION_RECORDED',executes_mutation:false,conversion_authorized:false,deletion_authorized:false,objects};
}
