// Playwright timing/coverage receipt. No attachments, selectors, network values,
// assertion messages, credentials, bodies or page contents are serialized.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
export function caseMetadata(test) {
  const file=path.relative(root,test.location.file).split(path.sep).join('/');
  if(!/^tests\/e2e\/[a-z0-9-]+\.spec\.js$/.test(file))throw Error('Unexpected browser spec');
  const project=test.parent.project()?.name;
  if(!['chromium-desktop','firefox-desktop','webkit-desktop','mobile-chrome','mobile-safari'].includes(project))throw Error('Unexpected browser project');
  return {id:test.id,file,line:test.location.line,project,expected_status:test.expectedStatus};
}
export default class BrowserReceipt {
  onBegin(config,suite) {
    this.enabled=Boolean(process.env.ARANDU_BROWSER_PROFILE_DIR);if(!this.enabled)return;
    this.start=performance.now();this.cases=suite.allTests().map(caseMetadata);this.results=[];this.hooks=new WeakMap();
    this.sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(process.env.GITHUB_SHA && process.env.GITHUB_SHA!==this.sha)throw Error('Browser checkout SHA mismatch');
    this.workers=config.workers;
  }
  onStepEnd(test,result,step) {
    if(!this.enabled||step.parent||step.category!=='hook')return;
    const value=this.hooks.get(result)||{setup_ms:0,teardown_ms:0};
    if(step.title==='Before Hooks')value.setup_ms+=step.duration;
    if(step.title==='After Hooks')value.teardown_ms+=step.duration;
    this.hooks.set(result,value);
  }
  onTestEnd(test,result) {
    if(!this.enabled)return;
    this.results.push({...caseMetadata(test),retry:result.retry,status:result.status,duration_ms:result.duration,...this.hooks.get(result),
      explicit_skip:result.status==='skipped'&&test.annotations.some(a=>a.type==='skip'&&(Boolean(a.description)||(test.title==='capturas reproduzíveis das superfícies financeiras'&&['firefox-desktop','webkit-desktop','mobile-safari'].includes(test.parent.project()?.name))))});
  }
  onError() {
    console.error('BROWSER_RUN_ERROR: inspect standard execution evidence; for collection errors rerun npm run test:e2e:list.');
  }
  onEnd(result) {
    if(!this.enabled)return;
    const group=process.env.ARANDU_BROWSER_GROUP||'all';
    if(!/^[a-z_]+$/.test(group))throw Error('Invalid browser receipt group');
    const plan=process.env.ARANDU_BROWSER_PLAN_ONLY==='1';
    const report={format_version:1,sha:this.sha,group,mode:plan?'plan':'execution',result:result.status,workers:this.workers,
      wall_ms:performance.now()-this.start,cases:this.cases,results:this.results,
      limitations:['Setup/teardown are top-level Playwright hook durations.','Network request counts are not measured by this reporter.','Explicit skips remain SKIPPED; they are never labeled PASS.']};
    if(plan)console.log(`BROWSER_PLAN cases=${this.cases.length} sha=${this.sha}`);
    fs.mkdirSync(process.env.ARANDU_BROWSER_PROFILE_DIR,{recursive:true});
    fs.writeFileSync(path.join(process.env.ARANDU_BROWSER_PROFILE_DIR,plan?'browser-plan.json':`browser-${group}.json`),JSON.stringify(report,null,2)+'\n');
  }
}
