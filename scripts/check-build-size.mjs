import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist';
if (!fs.existsSync(dir)) {
  console.error('dist ausente');
  process.exit(1);
}

const files = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push({ name: full, size: fs.statSync(full).size });
  }
}
walk(dir);

const ext = (name) => path.extname(name).toLowerCase();
const js = files.filter((file) => ['.js', '.mjs'].includes(ext(file.name)));
const css = files.filter((file) => ext(file.name) === '.css');
const images = files.filter((file) => ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'].includes(ext(file.name)));
const sum = (items) => items.reduce((n, item) => n + item.size, 0);
const max = (items) => items.reduce((n, item) => Math.max(n, item.size), 0);

const metrics = {
  total: sum(files),
  javascript: sum(js),
  css: sum(css),
  largestJavascript: max(js),
  largestCss: max(css),
  largestImage: max(images)
};
const limits = {
  total: 3000000,
  javascript: 800000,
  css: 650000,
  largestJavascript: 100000,
  // A cascata canônica substitui 26 requests históricos; o limite por arquivo
  // cresce apenas para ela, enquanto o budget CSS total continua inalterado.
  largestCss: 170000,
  largestImage: 750000
};

let failed = false;
console.log('Arandu Build Size Check');
for (const key of Object.keys(limits)) {
  console.log(`${key}: ${metrics[key]} / ${limits[key]} bytes`);
  if (metrics[key] > limits[key]) failed = true;
}
if (failed) process.exit(1);
