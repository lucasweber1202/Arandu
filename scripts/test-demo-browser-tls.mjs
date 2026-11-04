import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';
import {localDemoCertificateArgs} from './ci-demo/browser-tls.mjs';
// Public certificate fixture only; no private key and no system-clock dependency.
const pem=readFileSync(new URL('../tests/fixtures/loopback-public-cert.pem',import.meta.url));
const cert=new X509Certificate(pem),now=Date.parse(cert.validFrom)+1000;
const args=localDemoCertificateArgs('https://localhost:4443',pem,now);
assert.equal(args.length,1);assert.match(args[0],/^--ignore-certificate-errors-spki-list=[A-Za-z0-9+/]{43}=$/);
assert.deepEqual(localDemoCertificateArgs('https://127.0.0.1:4443',pem,now),args);
for(const url of ['https://arandu-demo.vercel.app','https://localhost.attacker.example','http://localhost:4443'])assert.deepEqual(localDemoCertificateArgs(url,pem,now),[]);
assert.deepEqual(localDemoCertificateArgs('https://localhost:4443',null,now),[]);
assert.throws(()=>localDemoCertificateArgs('https://user:secret@localhost:4443',pem,now));
assert.throws(()=>localDemoCertificateArgs('https://localhost:4443','invalid',now));
assert.throws(()=>localDemoCertificateArgs('https://localhost:4443',pem,0));
assert.throws(()=>localDemoCertificateArgs('https://localhost:4443',pem,Date.parse(cert.validTo)+1000));
assert.throws(()=>localDemoCertificateArgs('https://[::1]:4443',pem,now));
console.log('Canonical browser TLS: exact loopback SPKI, remote exclusion, validity and credential guards PASS');
