import fs from 'node:fs';
import path from 'node:path';

// Diagnostics live outside dist and never alter chunking, loading or budgets.
export function bundleProfile() {
  return {
    name: 'arandu-bundle-profile',
    writeBundle(options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
      const bytes = chunk => fs.statSync(path.join(options.dir || 'dist', chunk.fileName)).size;
      const names = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
      const closure = (name, seen = new Set()) => {
        if (seen.has(name) || !names.has(name)) return seen;
        seen.add(name);
        for (const imported of names.get(name).imports) closure(imported, seen);
        return seen;
      };
      const records = chunks.map(chunk => ({
        file: chunk.fileName,
        bytes: bytes(chunk),
        entry: chunk.isEntry,
        dynamicEntry: chunk.isDynamicEntry,
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        staticClosureBytes: [...closure(chunk.fileName)].reduce((sum, name) => sum + bytes(names.get(name)), 0),
        modules: Object.entries(chunk.modules).map(([id, module]) => ({
          source: path.relative(process.cwd(), id).split(path.sep).join('/'),
          renderedLength: module.renderedLength
        })).sort((a, b) => b.renderedLength - a.renderedLength)
      })).sort((a, b) => b.bytes - a.bytes);
      const moduleChunks = new Map();
      for (const record of records) for (const module of record.modules) {
        if (!moduleChunks.has(module.source)) moduleChunks.set(module.source, []);
        moduleChunks.get(module.source).push(record.file);
      }
      fs.mkdirSync('reports', { recursive: true });
      fs.writeFileSync('reports/bundle-profile.json', JSON.stringify({
        formatVersion: 1,
        scope: 'vite-chunks-before-runtime-copy',
        totalJavascript: records.reduce((sum, record) => sum + record.bytes, 0),
        // check:build-size remains authoritative and also counts copied assets.
        limits: { totalJavascript: 800000, largestJavascript: 100000 },
        p14Target: 750000,
        duplicateModules: [...moduleChunks].filter(([, files]) => files.length > 1).map(([source, files]) => ({ source, files })),
        sourceGroups: {
          demoOnly: [...moduleChunks.keys()].filter(source => source.startsWith('finance/demo/')),
          thirdParty: [...moduleChunks.keys()].filter(source => source.includes('node_modules/')),
          virtual: [...moduleChunks.keys()].filter(source => source.includes('\u0000'))
        },
        chunks: records
      }, null, 2) + '\n');
    }
  };
}
