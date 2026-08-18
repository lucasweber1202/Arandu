import fs from 'node:fs';

const issues = [];
let images = 0;
for (const file of fs.readdirSync('js').filter((name) => name.endsWith('.js'))) {
  const source = fs.readFileSync(`js/${file}`, 'utf8');
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    images += 1;
    const tag = match[0];
    for (const attribute of ['width=', 'height=', 'loading=', 'decoding=']) {
      if (!tag.includes(attribute)) issues.push(`js/${file}: imagem gerada sem ${attribute.slice(0, -1)}.`);
    }
  }
}
if (!images) issues.push('Nenhuma imagem dinâmica foi inventariada.');
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`Image performance gate: ${images} imagens dinâmicas com dimensões, loading e decoding explícitos.`);
