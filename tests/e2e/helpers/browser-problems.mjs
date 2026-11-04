// Diagnostic metadata only: never request bodies, headers, query values or cookies.
export function safeNetworkUrl(value) {
  try {
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol))return '[unknown-url]';
    const pathname=url.pathname.split('/').map(part=>{
      let decoded;try{decoded=decodeURIComponent(part);}catch{return '[redacted]';}
      return /@|[A-Za-z0-9_-]{24,}|[a-f0-9]{8}-[a-f0-9-]{27,}/i.test(decoded)?'[redacted]':part;
    }).join('/');
    return `${url.origin}${pathname}${url.search?'?[redacted]':''}`;
  } catch { return '[unknown-url]'; }
}
export function technicalError(value) {
  return String(value||'').match(/net::ERR_[A-Z_]+/)?.[0] || '[details redacted]';
}
export function watchBrowserProblems(page) {
  const problems=[];
  const requests=new Map();
  const metadata=request=>({url:safeNetworkUrl(request.url()),method:request.method(),resourceType:request.resourceType(),status:null,error:null});
  page.on('request',request=>{
    requests.set(request.url(),metadata(request));
    if(requests.size>200)requests.delete(requests.keys().next().value);
  });
  page.on('requestfailed',request=>{
    const record={...metadata(request),error:technicalError(request.failure()?.errorText)};
    requests.set(request.url(),record);
    // Preserve console assertions. This event also supplies metadata when the
    // browser reports the console failure without a useful resource location.
    if(record.error==='net::ERR_TOO_MANY_RETRIES')problems.push(JSON.stringify({kind:'requestfailed',...record}));
  });
  page.on('pageerror',error=>problems.push(JSON.stringify({kind:'pageerror',error:technicalError(error.message)})));
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const rawUrl=message.location()?.url;
    const request=requests.get(rawUrl);
    problems.push(JSON.stringify({kind:'console',url:safeNetworkUrl(rawUrl),method:request?.method||null,resourceType:request?.resourceType||null,status:request?.status??null,error:technicalError(message.text())}));
  });
  page.on('response',response=>{
    const record={...metadata(response.request()),status:response.status()};
    requests.set(response.url(),record);
    if(response.status()>=400 && new URL(response.url()).pathname.startsWith('/api/'))problems.push(JSON.stringify({kind:'response',...record}));
  });
  return problems;
}
