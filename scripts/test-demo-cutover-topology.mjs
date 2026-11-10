#!/usr/bin/env node
// Estado ACTIVE pós-atribuição, sem realizar deploy, seed nem migrations.
import assert from 'node:assert/strict';
import {
  ACTIVE_SUPABASE_ASSIGNMENTS, CONSOLIDATION_TARGETS,
  proposedDemoCutoverAssignments, supabaseAssignmentCollisionProblem,
  permanentSupabaseAssignmentProblem
} from '../lib/deployment-topology.mjs';
const demo='offgpyysgdhfemjlchod';
const production='igacnfjeuqhxcmfyepgj';
assert.equal(CONSOLIDATION_TARGETS.demo.sourceRef,demo);
assert.equal(CONSOLIDATION_TARGETS.production.sourceRef,production);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.demo,[demo]);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.pilot,[]);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.legacy,[production]);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.production,[]);
assert.equal(supabaseAssignmentCollisionProblem(),null);
assert.equal(permanentSupabaseAssignmentProblem('demo',demo),null);
assert.match(permanentSupabaseAssignmentProblem('production',production),/sem atribuição ativa/);
assert.match(permanentSupabaseAssignmentProblem('production',demo),/sem atribuição ativa/);
assert.match(permanentSupabaseAssignmentProblem('demo',production),/sem atribuição ativa/);
assert.deepEqual(proposedDemoCutoverAssignments(),ACTIVE_SUPABASE_ASSIGNMENTS);
const doubleOwner={...ACTIVE_SUPABASE_ASSIGNMENTS,pilot:[demo]};
assert.match(supabaseAssignmentCollisionProblem(doubleOwner),/simultaneamente/);
assert.match(permanentSupabaseAssignmentProblem('demo',demo,doubleOwner),/simultaneamente/);
assert.match(supabaseAssignmentCollisionProblem({...ACTIVE_SUPABASE_ASSIGNMENTS,production:[demo]}),/simultaneamente/);
assert.match(supabaseAssignmentCollisionProblem({...ACTIVE_SUPABASE_ASSIGNMENTS,demo:[demo,demo]}),/simultaneamente/);
assert.match(supabaseAssignmentCollisionProblem({...ACTIVE_SUPABASE_ASSIGNMENTS,demo:['not-a-valid-ref']}),/inválida/);
const future={...ACTIVE_SUPABASE_ASSIGNMENTS,legacy:[],production:[production]};
assert.equal(supabaseAssignmentCollisionProblem(future),null);
assert.equal(permanentSupabaseAssignmentProblem('production',production,future),null);
console.log('Demo attribution: única dona do ref Pilot convertido, production não ativada e colisões recusadas.');
