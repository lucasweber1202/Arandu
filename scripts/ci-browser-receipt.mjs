import fs from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
export function packReceipt(value) {
 const packed=gzipSync(Buffer.from(JSON.stringify(value))).toString('base64url');
 if(packed.length>500000)throw Error('Browser receipt exceeds job output budget');
 return packed;
}
export function unpackReceipt(value) {
 if(typeof value!=='string'||!value.length||value.length>500000||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid browser job output');
 return JSON.parse(gunzipSync(Buffer.from(value,'base64url'),{maxOutputLength:4*1024*1024}).toString('utf8'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [file]=process.argv.slice(2);const value=JSON.parse(fs.readFileSync(file,'utf8'));
 if(value.sha!==process.env.GITHUB_SHA)throw Error('Browser output SHA mismatch');
 fs.appendFileSync(process.env.GITHUB_OUTPUT,`receipt=${packReceipt(value)}\n`);
}
