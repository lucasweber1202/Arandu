import { createHash } from 'node:crypto';
import { xlsxRows } from './extraction-providers.mjs';
import { validateFeeObservation } from './fee-intelligence.mjs';
export const INGESTION_VERSION = 'financial-fee-import-v1';
export const IMPORT_FIELDS = ['source_object_id','service','charging_unit','currency','period_start','period_end','observed_amount','volume','base_amount'];
export const IMPORT_LIMITS = Object.freeze({ bytes: 65536, rows: 100, columns: 40 });
export const fingerprint = data => createHash('sha256').update(data).digest('hex');
const invalid = code => { const e = new Error(code); e.code = code; throw e; };
export function csvRows(text, delimiter = ',') {
 if (![';',','].includes(delimiter)) invalid('invalid_delimiter');
 const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
 text=text.replace(/^\uFEFF/,'');
 const pushCell=()=>{if(cell.length>2000)invalid('cell_too_large');row.push(cell);cell='';afterQuote=false;if(row.length>IMPORT_LIMITS.columns)invalid('too_many_columns');};
 const pushRow=()=>{pushCell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>IMPORT_LIMITS.rows+1)invalid('too_many_rows');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||afterQuote)invalid('invalid_csv_quote');quoted=true;continue;}
  if(c===delimiter){pushCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;pushRow();continue;}
  if(afterQuote)invalid('invalid_csv_after_quote');cell+=c;
 }
 if(quoted)invalid('unclosed_csv_quote');if(cell||row.length||afterQuote)pushRow();return rows;
}
function numeric(v){if(typeof v!=='string'||!/^\d+(?:[.,]\d{1,6})?$/.test(v.trim()))return v;return Number(v.replace(',','.'));}
export function feeImportPreview({bytes,format,mapping,source_reference,delimiter=',',today=new Date().toISOString().slice(0,10)}){
 if(!Buffer.isBuffer(bytes)||bytes.length>IMPORT_LIMITS.bytes||bytes.length===0)invalid('invalid_file_size');
 if(!/^[\p{L}\p{N} ._:/-]{3,100}$/u.test(source_reference||''))invalid('invalid_import_source');
 let raw,locators=null;
 if(format==='csv'){
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{invalid('invalid_utf8');}
  raw=csvRows(text,delimiter);
 }else if(format==='xlsx'){const parsed=xlsxRows(bytes,{preserveColumns:true,rejectFormulas:true});raw=parsed.map(r=>r.cells);locators=parsed.map(r=>r.locator);}
 else invalid('unsupported_import_format');
 if(raw.length<2||raw.length>IMPORT_LIMITS.rows+1)invalid('invalid_row_count');
 const columns=raw[0].map(v=>String(v).trim());
 if(columns.length>IMPORT_LIMITS.columns||columns.some(v=>!v||v.length>100)||new Set(columns).size!==columns.length)invalid('ambiguous_columns');
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||Object.keys(mapping).some(k=>!IMPORT_FIELDS.includes(k))||Object.values(mapping).some(v=>typeof v!=='string'||!columns.includes(v))||new Set(Object.values(mapping)).size!==Object.values(mapping).length)invalid('invalid_column_mapping');
 const required=IMPORT_FIELDS.filter(k=>!['volume','base_amount'].includes(k));
 if(required.some(k=>!mapping[k]))invalid('incomplete_column_mapping');
 const sha=fingerprint(bytes),seen=new Map();
 const rows=raw.slice(1).map((cells,index)=>{
  const values=Object.fromEntries(Object.entries(mapping).map(([key,column])=>[key,String(cells[columns.indexOf(column)]??'').trim()]));
  const errors=[];
  for(const key of required)if(!values[key])errors.push({column:mapping[key],code:'required',suggestion:'Informe o valor da coluna.'});
  if(!/^[A-Za-z0-9._:-]{1,80}$/.test(values.source_object_id||''))errors.push({column:mapping.source_object_id,code:'invalid_source_id',suggestion:'Use identificador externo estável, com até 80 caracteres.'});
  for(const key of ['observed_amount','volume','base_amount'])if(values[key]!==undefined){if(values[key]===''&&key!=='observed_amount')delete values[key];else values[key]=numeric(values[key]);}
  values.currency=values.currency.toUpperCase();values.source_type='other_import';
  values.source_reference=`${source_reference}/${values.source_object_id}`;values.evidence_reference=`file:sha256:${sha}`;
  const problem=validateFeeObservation(values,today);if(problem)errors.push({column:null,code:'invalid_fee_observation',suggestion:problem});
  let state=errors.some(e=>e.code==='required')?'incomplete':errors.length?'invalid':'valid';
  const identity=values.source_reference;
  if(state==='valid'&&seen.has(identity)){const previous=seen.get(identity);state=JSON.stringify(previous.values)===JSON.stringify(values)?'duplicate':'conflicting';if(state==='conflicting')previous.state='conflicting';}
  const line=locators?Number(/[A-Z]+(\d+)$/.exec(locators[index+1])?.[1]):index+2;
  const result={line,source_locator:locators?locators[index+1]:`registro ${index+2}`,state,values,errors};if(state==='valid')seen.set(identity,result);return result;
 });
 if(new Set(rows.map(r=>r.line)).size!==rows.length)invalid('ambiguous_row_numbers');
 return {api_version:INGESTION_VERSION,file_fingerprint:sha,fingerprint:fingerprint(JSON.stringify({sha,mapping,source_reference,delimiter,format})),columns,mapping,rows,
  confirmation_required:true,limits:IMPORT_LIMITS,stats:Object.fromEntries(['valid','invalid','incomplete','duplicate','conflicting'].map(state=>[state,rows.filter(r=>r.state===state).length]))};
}
