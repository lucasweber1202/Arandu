// Build each variant, retain reports/bundle-profile.json, then compare profiles.
// Example: node scripts/measure-rfq-bundle.mjs work/before.json reports/bundle-profile.json
import fs from 'node:fs';
import crypto from 'node:crypto';
import {routeSizes,LIMITS} from './build-size.mjs';
const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath)throw Error('Usage: node scripts/measure-rfq-bundle.mjs BEFORE_PROFILE AFTER_PROFILE');
const read=file=>{const bytes=fs.readFileSync(file);return {profile:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
const before=read(beforePath),after=read(afterPath);
const first=routeSizes(before.profile).rfq,last=routeSizes(after.profile).rfq;
if(!Number.isFinite(first)||!Number.isFinite(last))throw Error('Both profiles must contain the RFQ route');
console.log(JSON.stringify({metric:'rfq-static-route-closure-bytes',before:first,after:last,recovered:first-last,limit:LIMITS.largestRouteJavascript,headroom:LIMITS.largestRouteJavascript-last,beforeProfileSha256:before.sha256,afterProfileSha256:after.sha256},null,2));
if(last>LIMITS.largestRouteJavascript)process.exitCode=1;
