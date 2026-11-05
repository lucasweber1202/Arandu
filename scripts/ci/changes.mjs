// Shared NUL-safe parser: renames inspect both paths; copies retain their target.
export function parseChanges(output) {
  const fields=output.split('\0'), changes=[];
  for(let i=0;i<fields.length&&fields[i];) {
    const status=fields[i++], filename=fields[i++];
    if(/^R\d+$/.test(status)) changes.push({status:'renamed',previous_filename:filename,filename:fields[i++]});
    else if(/^C\d+$/.test(status)) changes.push({status:'added',filename:fields[i++]});
    else {const kind={A:'added',M:'modified',D:'removed',T:'modified'}[status];if(!kind)throw Error('Unknown git change status');changes.push({status:kind,filename});}
  }
  return changes;
}
