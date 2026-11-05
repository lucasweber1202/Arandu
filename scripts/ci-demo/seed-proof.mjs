import fs from 'node:fs';
import path from 'node:path';

export function assessSeedEquivalence(profiles,contract) {
  const failures=[];
  if(!Number.isInteger(contract?.checks)||contract.checks<1||!/^[a-f0-9]{64}$/.test(contract?.check_names_sha256||''))failures.push('invalid_contract');
  const seen=new Set();
  for(const {name,report:r} of profiles) {
    if(!/^seed-(?:baseline-reset|[a-f0-9]{10}-seed)\.json$/.test(name)||seen.has(name))failures.push('unexpected_or_duplicate_profile');
    seen.add(name);
    if(r?.classification!=='synthetic_seed_timing_no_payload'||r.result!=='PASS'||r.sanity?.checks!==contract.checks
      ||r.sanity?.passed!==contract.checks||r.sanity?.check_names_sha256!==contract.check_names_sha256
      ||!r.phases?.some(p=>p.name==='sanity'&&p.result==='PASS'))failures.push('semantic_equivalence_failed');
  }
  if(profiles.length!==5||!seen.has('seed-baseline-reset.json'))failures.push('missing_seed_profiles');
  return {result:failures.length?'FAIL':'PASS',baseline:1,workspaces:4,checks_per_seed:contract.checks,total_checks:contract.checks*5,failures:[...new Set(failures)]};
}

export function verifySeedProfiles(directory,contract) {
  const files=fs.readdirSync(directory).filter(name=>/^seed-(?:baseline-reset|[a-f0-9]{10}-seed)\.json$/.test(name));
  return assessSeedEquivalence(files.map(name=>({name,report:JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))})),contract);
}
