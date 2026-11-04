import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {safeNetworkUrl,watchBrowserProblems} from '../tests/e2e/helpers/browser-problems.mjs';
assert.equal(safeNetworkUrl('https://user:secret@localhost:4443/api/finance/profile?token=private'), 'https://localhost:4443/api/finance/profile?[redacted]');
assert(!safeNetworkUrl('https://localhost/private/user%40example.com/123e4567-e89b-12d3-a456-426614174000').includes('example'));
assert.equal(safeNetworkUrl('https://localhost:4443/assets/negotiation-board-longhash123456.js?key=private'),'https://localhost:4443/assets/negotiation-board-longhash123456.js?[redacted]');
assert.equal(safeNetworkUrl('data:text/plain,private'),'[unknown-url]');
const page=new EventEmitter(),problems=watchBrowserProblems(page);
const request={url:()=> 'https://localhost:4443/assets/app.js?secret=private',method:()=> 'GET',resourceType:()=> 'script',failure:()=>({errorText:'net::ERR_TOO_MANY_RETRIES'})};
page.emit('request',request);page.emit('requestfailed',request);
page.emit('console',{type:()=> 'error',text:()=> 'Failed to load resource: net::ERR_TOO_MANY_RETRIES token=private',location:()=>({url:request.url()})});
assert.equal(problems.length,2);
for(const text of problems){const item=JSON.parse(text);assert.equal(item.method,'GET');assert.equal(item.resourceType,'script');assert.equal(item.error,'net::ERR_TOO_MANY_RETRIES');assert.equal(item.status,null);assert(!text.includes('private'));}
const apiRequest={...request,url:()=> 'https://localhost:4443/api/finance/profile?org=private',resourceType:()=> 'fetch'};
page.emit('response',{url:apiRequest.url,request:()=>apiRequest,status:()=>403});
assert.equal(JSON.parse(problems.at(-1)).status,403);
// Diagnostic changes must never turn other application/network errors green.
for(const status of [400,401,404,409,429,500,503]){
 const before=problems.length;
 page.emit('response',{url:apiRequest.url,request:()=>apiRequest,status:()=>status});
 assert.equal(problems.length,before+1);assert.equal(JSON.parse(problems.at(-1)).status,status);
}
for(const code of ['net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_FAILED']){
 page.emit('console',{type:()=> 'error',text:()=>code+' secret=private',location:()=>({url:request.url()})});
 assert.equal(JSON.parse(problems.at(-1)).error,code);
}
page.emit('pageerror',new Error('financial payload private'));
assert.equal(JSON.parse(problems.at(-1)).kind,'pageerror');assert(!problems.at(-1).includes('private'));

console.log('Browser diagnostics: URL redaction, method/resource/status/error and failure preservation PASS (event harness; not canonical Demo reproduction)');
