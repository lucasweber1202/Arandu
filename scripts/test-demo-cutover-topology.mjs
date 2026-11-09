#!/usr/bin/env node
// Simula a conversão Pilot→Demo sem alterar destinos reais ou segredos.
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
assert.equal(supabaseAssignmentCollisionProblem(),null);
assert.match(permanentSupabaseAssignmentProblem('demo',demo),/sem atribuição ativa/);
assert.match(permanentSupabaseAssignmentProblem('production',production),/sem atribuição ativa/);
const candidate=proposedDemoCutoverAssignments();
assert.deepEqual(candidate.demo,[demo]);
assert.deepEqual(candidate.pilot,[]);
assert.deepEqual(candidate.legacy,[production]);
assert.deepEqual(candidate.production,[]);
assert.equal(supabaseAssignmentCollisionProblem(candidate),null);
assert.equal(permanentSupabaseAssignmentProblem('demo',demo,candidate),null);
assert.match(permanentSupabaseAssignmentProblem('production',production,candidate),/sem atribuição ativa/);
assert.match(permanentSupabaseAssignmentProblem('demo',production,candidate),/sem atribuição ativa/);
const duplicate={...candidate,pilot:[demo]};
assert.match(supabaseAssignmentCollisionProblem(duplicate),/simultaneamente/);
assert.match(permanentSupabaseAssignmentProblem('demo',demo,duplicate),/simultaneamente/);
assert.match(permanentSupabaseAssignmentProblem('demo',demo,{...candidate,production:[demo]}),/simultaneamente/);
assert.match(supabaseAssignmentCollisionProblem({...candidate,demo:[demo,demo]}),/simultaneamente/);
assert.match(supabaseAssignmentCollisionProblem({...candidate,demo:['not-a-valid-ref']}),/inválida/);
const future={...candidate,legacy:[],production:[production]};
assert.equal(permanentSupabaseAssignmentProblem('production',production,future),null);
assert.equal(supabaseAssignmentCollisionProblem(future),null);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.demo,[]);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.pilot,[demo]);
assert.deepEqual(ACTIVE_SUPABASE_ASSIGNMENTS.production,[]);
console.log('Cutover preflight: refs exatos, plano Demo sem overlap, produção bloqueada e atribuições ativas imutáveis.');
