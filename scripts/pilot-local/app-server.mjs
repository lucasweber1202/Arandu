// Servidor local no formato da Vercel para exercitar o Arandu real contra o
// Supabase local desta pasta: `dist/` estático + funções de `api/`, com a mesma
// regra de roteamento de vercel.json (arquivo próprio → função; dois ou mais
// segmentos → api/[...path].js via rewrite). Só para ensaio local.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const dist = path.join(root, 'dist');
const certDir = process.env.PILOT_LOCAL_CERT_DIR || path.join(root, 'scripts/pilot-local/.state');
const port = Number(process.env.PILOT_LOCAL_APP_PORT || 4443);
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };
const functions = new Set(fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js') && !f.startsWith('[')).map((f) => f.slice(0, -3)));
const cache = new Map();
async function load(file) {
  if (!cache.has(file)) cache.set(file, (await import(pathToFileURL(path.join(root, 'api', file)).href)).default);
  return cache.get(file);
}
const rewrites = (vercel.rewrites || []).filter((r) => !r.source.startsWith('/api/'));

https.createServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }, async (req, res) => {
  try {
    const url = new URL(req.url, `https://localhost:${port}`);
    let pathname = url.pathname;
    const rewrite = rewrites.find((r) => r.source === pathname);
    if (rewrite) pathname = rewrite.destination;
    if (pathname.startsWith('/api/')) {
      const segments = pathname.slice(5).split('/').filter(Boolean);
      const own = segments.length === 1 && functions.has(segments[0]);
      const handler = await load(own ? `${segments[0]}.js` : '[...path].js');
      return await handler(req, res);
    }
    let file = path.join(dist, decodeURIComponent(pathname));
    if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(dist, '404.html'))); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error('app-server', error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(port, () => console.log(`Arandu local pilot app: https://localhost:${port}`));
