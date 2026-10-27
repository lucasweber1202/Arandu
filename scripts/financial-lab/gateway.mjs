import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const routes = [['/rest/v1',3019],['/auth/v1',9919],['/storage/v1',5019]];
const dir=process.env.PILOT_LOCAL_CERT_DIR;
const services={'/rest/v1':['rest',3000],'/auth/v1':['auth',9999],'/storage/v1':['storage',5000]};
https.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),cert:fs.readFileSync(path.join(dir,'cert.pem'))},(req,res)=>{
 const hit=routes.find(([prefix])=>req.url.startsWith(prefix+'/')||req.url===prefix);
 if(!hit){res.writeHead(404);res.end();return;}
 const upstream=http.request({host:services[hit[0]][0],port:services[hit[0]][1],path:req.url.slice(hit[0].length)||'/',method:req.method,headers:{...req.headers,host:`127.0.0.1:${hit[1]}`,'x-forwarded-proto':'https','x-forwarded-host':'localhost:8459','x-forwarded-prefix':hit[0]}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
 upstream.on('error',()=>{res.writeHead(502);res.end('Local backend unavailable');});req.pipe(upstream);
}).listen(8459,'127.0.0.1');
