import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

const folders = ['js', 'data', 'assets'];

function copyDir(source, target) {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });

  for (const entry of readdirSync(source)) {
    const sourcePath = join(source, entry);
    const targetPath = join(target, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!existsSync(dist)) {
  throw new Error('Pasta dist não encontrada. Rode vite build antes de copiar assets.');
}

for (const folder of folders) {
  copyDir(join(root, folder), join(dist, folder));
  console.log(`Copiado: ${folder} -> dist/${folder}`);
}
