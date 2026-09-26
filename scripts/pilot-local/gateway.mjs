import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
const routes = [['/rest/v1', 3000], ['/auth/v1', 9999], ['/storage/v1', 5000]];
https.createServer({ key: fs.readFileSync(new URL('.state/key.pem', import.meta.url)), cert: fs.readFileSync(new URL('.state/cert.pem', import.meta.url)) }, (req, res) => {
  const hit = routes.find(([prefix]) => req.url.startsWith(prefix + '/') || req.url === prefix);
  if (!hit) { res.writeHead(404); return res.end('no route'); }
  const path = req.url.slice(hit[0].length) || '/';
  const upstream = http.request({ host: '127.0.0.1', port: hit[1], path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${hit[1]}`, 'x-forwarded-proto': 'https', 'x-forwarded-host': 'localhost:8443', 'x-forwarded-prefix': hit[0] } }, (up) => {
    const headers = { ...up.headers, 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS' };
    res.writeHead(up.statusCode, headers); up.pipe(res);
  });
  upstream.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS' }); upstream.destroy(); return res.end(); }
  req.pipe(upstream);
}).listen(8443, () => console.log('gateway https://localhost:8443'));
