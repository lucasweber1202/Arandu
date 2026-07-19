#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT || 4173);
const host = '127.0.0.1';
const mime = new Map([
  ['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],['.svg','image/svg+xml'],['.png','image/png'],['.jpg','image/jpeg'],
  ['.jpeg','image/jpeg'],['.webmanifest','application/manifest+json'],['.xml','application/xml; charset=utf-8'],['.txt','text/plain; charset=utf-8']
]);

if (!fs.existsSync(root)) {
  console.error('dist ausente. Rode npm run build antes de iniciar o servidor de teste.');
  process.exit(1);
}

function resolveFile(urlValue) {
  const pathname = decodeURIComponent(new URL(urlValue, 'http://localhost').pathname);
  const candidate = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (!path.extname(candidate) && fs.existsSync(`${candidate}.html`)) return `${candidate}.html`;
  return null;
}

const server = http.createServer((req, res) => {
  if (!['GET','HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok:false, error:'Método não permitido.' }));
    return;
  }
  const file = resolveFile(req.url || '/');
  if (!file) {
    const api = new URL(req.url || '/', 'http://localhost').pathname.startsWith('/api/');
    res.writeHead(404, { 'Content-Type': api ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' });
    res.end(api ? JSON.stringify({ ok:false, mode:'test-static', error:'API não simulada.' }) : 'Não encontrado');
    return;
  }
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
});

server.listen(port, host, () => console.log(`Arandu test server: http://${host}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
