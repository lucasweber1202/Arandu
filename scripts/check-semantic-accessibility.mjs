import fs from 'node:fs';

const issues = [];
let controls = 0;
for (const file of fs.readdirSync('.').filter((name) => name.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  const ids = [...html.matchAll(/\bid=["']([^"']+)/gi)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    if (ids.filter((value) => value === id).length > 1) issues.push(`${file}: id duplicado "${id}".`);
  }
  const labels = new Set([...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)/gi)].map((match) => match[1]));
  for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = match[0];
    if (/\btype=["']hidden/i.test(tag)) continue;
    controls += 1;
    const id = tag.match(/\bid=["']([^"']+)/i)?.[1];
    const name = tag.match(/\bname=["']([^"']+)/i)?.[1];
    const prefix = html.slice(0, match.index);
    const nested = prefix.lastIndexOf('<label') > prefix.lastIndexOf('</label>');
    if (!id) issues.push(`${file}: controle sem id.`);
    if (!name) issues.push(`${file}: controle sem name.`);
    if (id && !labels.has(id) && !nested) issues.push(`${file}: controle ${id} sem label semântico.`);
  }
  if (/<main\b/i.test(html)) {
    if (!/<main\b[^>]*\bid=["']conteudo-principal["']/i.test(html)) issues.push(`${file}: main sem landmark estável.`);
    if (!/class=["'][^"']*\bskip-link\b/i.test(html)) issues.push(`${file}: sem skip link no source.`);
  }
}
const runtime = fs.readFileSync('js/platform-runtime.js', 'utf8');
if (runtime.includes('labelFormFields') || runtime.includes('arandu-field-label')) {
  issues.push('platform-runtime.js voltou a reparar labels que pertencem ao HTML fonte.');
}
if (issues.length) {
  issues.slice(0, 50).forEach((issue) => console.error(`- ${issue}`));
  console.error(`Total: ${issues.length}`);
  process.exit(1);
}
console.log(`Semantic accessibility gate: ${controls} controles com id, name e label no source.`);
