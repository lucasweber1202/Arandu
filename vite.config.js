import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', 'dist']);

function collectHtmlFiles(dir = root) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (ignoredDirs.has(entry)) continue;
      files.push(...collectHtmlFiles(fullPath));
      continue;
    }

    if (extname(entry) === '.html') files.push(fullPath);
  }

  return files;
}

const htmlInputs = Object.fromEntries(
  collectHtmlFiles().map((file) => {
    const name = relative(root, file).replace(/\.html$/, '').split(sep).join('/');
    return [name, file];
  })
);

export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: htmlInputs
    }
  }
});
