import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {safeNetworkUrl,watchBrowserProblems} from '../tests/e2e/helpers/browser-problems.mjs';
assert.equal(safeNetworkUrl('https://user:secret@localhost:4443/api/finance/profile?token=private'), 'https://localhost:4443/api/finance/profile?[redacted]');
assert(!safeNetworkUrl('https://localhost/private/user%40example.com/123e4567-e89b-12d3-a456-426614174000').includes('example'));
const page=new EventEmitter(),problems=watchBrowserProblems(page);
const request={url:()=> 'https://localhost:4443/assets/app.js?secret=private',method:()=> 'GET',resourceType:()=> 'script',failure:()=>({errorText:'net::ERR_TOO_MANY_RETRIES'})};
page.emit('request',request);page.emit('requestfailed',request);
page.emit('console',{type:()=> 'error',text:()=> 'Failed to load resource: net::ERR_TOO_MANY_RETRIES token=private',location:()=>({url:request.url()})});
assert.equal(problems.length,2);
for(const text of problems){const item=JSON.parse(text);assert.equal(item.method,'GET');assert.equal(item.resourceType,'script');assert.equal(item.error,'net::ERR_TOO_MANY_RETRIES');assert.equal(item.status,null);assert(!text.includes('private'));}
page.emit('response',{url:()=> 'https://localhost:4443/api/finance/profile?org=private',request:()=>request,status:()=>403});
assert.equal(JSON.parse(problems.at(-1)).status,403);
console.log('Browser diagnostics: URL redaction, method/resource/status/error and failure preservation PASS (event harness; not canonical Demo reproduction)');
