const e=process.env;
if(e.CLASSIFY_RESULT!=='success'||!['A','B','C','D'].includes(e.RISK))throw Error('Classification failed or missing');
if(e.ANALYZED_SHA!==e.GITHUB_SHA)throw Error('Wrong candidate SHA');
const deep=['C','D'].includes(e.RISK);
if(e.DEEP!==String(deep))throw Error('Inconsistent policy');
if((deep?e.FULL_RESULT:e.FAST_RESULT)!=='success')throw Error('Required validation did not succeed');
if((deep?e.FAST_RESULT:e.FULL_RESULT)!=='skipped')throw Error('Unexpected applicability state');
console.log(`${e.RISK}: required ${deep?'full':'fast'} validation succeeded; other path explicitly not applicable`);

if(deep&&e.DEMO_RESULT!=='success')throw Error('Critical integration missing or failed');
