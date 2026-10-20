import { chromium } from '@playwright/test';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const vp of [{width:1440,height:900},{width:390,height:844}]) {
const p = await b.newPage({viewport:vp}); const errs=[]; p.on('pageerror',e=>errs.push(p.url()+' '+e.message));
await p.goto('http://127.0.0.1:4181/'); await p.click('#tour-start'); await p.waitForLoadState('networkidle');
await p.click('#topo a'); await p.waitForTimeout(300);
await p.click('.tour-header a[href="/demo/index.html"]'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
console.log(JSON.stringify(errs)); }
await b.close();
