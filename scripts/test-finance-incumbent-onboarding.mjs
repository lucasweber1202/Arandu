#!/usr/bin/env node
// Onboarding da instituição pelo contrato existente: estado do convite por fatos.
import assert from 'node:assert/strict';
import { incumbentInvite, INCUMBENT_TEXT } from '../lib/finance/incumbent-onboarding.mjs';

const P = 'p1';
const rfq = (over = {}) => ({ status: 'draft', invites: [], proposals: [], ...over });
assert.deepEqual(incumbentInvite(rfq(), P, { canManage: true }), { kind: 'none', canInvite: true, proposal: false, reason: null });
assert.equal(incumbentInvite(rfq(), P).canInvite, false, 'sem permissão não convida');
assert.equal(incumbentInvite(rfq({ status: 'comparing' }), P, { canManage: true }).canInvite, false, 'fase fechada não convida');
assert.equal(incumbentInvite(rfq(), null, { canManage: true }).kind, 'unavailable');
const invited = rfq({ status: 'open', invites: [{ provider_id: P, status: 'invited', expires_at: '2026-12-01' }, { provider_id: 'other', status: 'accepted' }] });
assert.deepEqual(incumbentInvite(invited, P, { canManage: true }), { kind: 'invited', canInvite: false, proposal: false, expiresAt: '2026-12-01' });
const accepted = rfq({ status: 'collecting', invites: [{ provider_id: P, status: 'revoked' }, { provider_id: P, status: 'accepted', accepted_at: '2026-11-02' }], proposals: [{ provider_id: P, current_version: 1, status: 'submitted' }] });
assert.equal(incumbentInvite(accepted, P).kind, 'accepted');
assert.equal(incumbentInvite(accepted, P).proposal, true);
const closed = rfq({ status: 'open', invites: [{ provider_id: P, status: 'expired' }] });
assert.deepEqual(incumbentInvite(closed, P, { canManage: true }).kind, 'closed');
assert.equal(incumbentInvite(closed, P, { canManage: true }).canInvite, true, 'convite encerrado pode ser refeito');
assert.ok(!/recomend|melhor|ranking|score/i.test(JSON.stringify(INCUMBENT_TEXT)), 'sem linguagem de recomendação');
console.log('incumbent-onboarding: ok');
