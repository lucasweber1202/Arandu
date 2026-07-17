import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const apiDirectory = path.resolve('api');
const files = fs.readdirSync(apiDirectory)
  .filter((file) => file.endsWith('.js'))
  .sort();
const issues = [];

for (const file of files) {
  try {
    const module = await import(`${pathToFileURL(path.join(apiDirectory, file)).href}?check=${Date.now()}`);
    if (typeof module.default !== 'function') issues.push(`${file}: export default não é um handler.`);
  } catch (error) {
    issues.push(`${file}: ${error.message}`);
  }
}

console.log('Arandu API Module Check');
console.log(`Módulos verificados: ${files.length}`);
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
