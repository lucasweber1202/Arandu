import assert from 'node:assert/strict';
import {
  accountReservation,
  normalizeFormPayload,
  normalizeProposal,
  normalizeReservation,
  normalizeSelection,
  publicSelection
} from '../lib/api-dtos.mjs';

const form = normalizeFormPayload({
  type: 'contato', page: '/contato.html',
  data: { nome: 'Pessoa', email: 'PESSOA@example.com', telefone: '(21) 99999-0000', message: 'Olá', role: 'admin' }
}, { consentVersion: 'lgpd-v1' });
assert.equal(form.table, 'leads');
assert.equal(form.record.email, 'pessoa@example.com');
assert.equal(form.record.whatsapp, '21999990000');
assert.equal('role' in form.record, false, 'mass assignment não pode atravessar o DTO');
assert.deepEqual(form.record.payload, { form_type: 'contato', source_page: '/contato.html', consent_version: 'lgpd-v1' });

assert.deepEqual(normalizeReservation({ artworkId: 'obra-1', name: 'Pessoa', whatsapp: '+55 21 99999-0000', price: 1 }), {
  artwork_id: 'obra-1', name: 'Pessoa', whatsapp: '5521999990000', deadline: null, notes: null, origin: 'website'
});
assert.deepEqual(normalizeProposal({ client: 'Cliente', items: [{ id: 'a' }, { artwork_id: 'b' }], total: 1 }).artworkIds, ['a', 'b']);

const selection = normalizeSelection({
  email: 'pessoa@example.com',
  briefing: { email: 'vazar@example.com', telefone: '21999990000', ambiente: 'sala' },
  items: [{ id: 'obra-1', url: 'javascript:alert(1)', thumb: '../segredo.png' }]
});
assert.equal(selection.items[0].url, '');
assert.equal(selection.items[0].thumb, 'segredopng');
const shared = publicSelection({ public_token: 'token', status: 'open', items: selection.items, briefing: selection.briefing });
assert.equal('email' in shared.briefing, false);
assert.equal('telefone' in shared.briefing, false);
assert.equal(shared.briefing.ambiente, 'sala');
assert.equal(publicSelection({ status: 'draft' }), null);

assert.deepEqual(Object.keys(accountReservation({ id: 'r', artwork_id: 'a', status: 'requested', name: 'PII' })).sort(), ['artwork_id', 'created_at', 'deadline', 'expires_at', 'id', 'notes', 'status', 'updated_at']);

console.log('API DTOs: allowlists, minimização e seleção pública aprovadas.');
