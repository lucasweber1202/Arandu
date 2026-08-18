import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  HttpError,
  cleanEmail,
  cleanPhone,
  escapeHtml,
  html,
  json,
  readBody,
  safeRequestId,
  validEmail
} from '../lib/api-core.mjs';

function request(value, headers = {}) {
  const req = Readable.from(value == null ? [] : [Buffer.from(value)]);
  req.headers = headers;
  return req;
}

function response() {
  return {
    headers: {}, statusCode: 0, body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); }
  };
}

assert.deepEqual(await readBody(request('{"ok":true}')), { ok: true });
assert.deepEqual(await readBody(request(null)), {});
await assert.rejects(readBody(request('[]')), (error) => error instanceof HttpError && error.code === 'invalid_json_shape');
await assert.rejects(readBody(request('{')), (error) => error instanceof HttpError && error.code === 'invalid_json');
await assert.rejects(readBody(request('{"large":true}', { 'content-length': '999' }), { maxBytes: 10 }), (error) => error.status === 413);
await assert.rejects(readBody(request('{}', { 'content-length': '1e9' })), (error) => error.code === 'invalid_content_length');

assert.equal(safeRequestId('ok\r\nX-Evil: yes'), 'okX-Evil:yes');
assert.match(safeRequestId(''), /^[0-9a-f-]{36}$/i);
assert.equal(cleanEmail(' Pessoa@Example.COM '), 'pessoa@example.com');
assert.equal(cleanPhone('+55 (21) 99999-0000'), '5521999990000');
assert.equal(validEmail('pessoa@example.com'), true);
assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');

const jsonResponse = response();
json(jsonResponse, 201, { ok: true }, { 'Request-Id': 'test-1' });
assert.equal(jsonResponse.statusCode, 201);
assert.equal(jsonResponse.headers['cache-control'].includes('no-store'), true);
assert.equal(jsonResponse.headers['x-frame-options'], 'DENY');
assert.equal(jsonResponse.headers['request-id'], 'test-1');

const htmlResponse = response();
html(htmlResponse, 200, '<h1>ok</h1>');
assert.equal(htmlResponse.headers['cache-control'].includes('no-store'), true);
assert.equal(htmlResponse.headers['x-content-type-options'], 'nosniff');

console.log('API core: body limits, normalização e respostas seguras aprovados.');
