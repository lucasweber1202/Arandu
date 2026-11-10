// Test-only compatibility fixture. Does not modify the active deployment topology.
// The old Pilot checks are still exercised against a throwaway copy of the old policy;
// current shipping code must deny Pilot access to the now-assigned Demo ref.
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const DEMO = 'offgpyysgdhfemjlchod';
export function createHistoricalPilotFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'arandu-historical-pilot-'));
  try {
    cpSync(new URL('../lib/', import.meta.url), join(dir, 'lib'), { recursive: true });
    mkdirSync(join(dir, 'api')); mkdirSync(join(dir, 'scripts'));
    cpSync(new URL('../api/health.js', import.meta.url), join(dir, 'api/health.js'));
    cpSync(new URL('./check-finance-env.mjs', import.meta.url), join(dir, 'scripts/check-finance-env.mjs'));
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const path = join(dir, 'lib/deployment-topology.mjs');
    const source = readFileSync(path, 'utf8');
    const current = `  demo: Object.freeze(['${DEMO}']), production: Object.freeze([]),\n  pilot: Object.freeze([]),`;
    const previous = `  demo: Object.freeze([]), production: Object.freeze([]),\n  pilot: Object.freeze(['${DEMO}']),`;
    if (!source.includes(current)) throw new Error('topology is not assigned to Demo — historical fixture refusing');
    writeFileSync(path, source.replace(current, previous));
    return {
      dir,
      module: (name) => import(pathToFileURL(join(dir, name)).href),
      cleanup: () => rmSync(dir, { recursive: true, force: true })
    };
  } catch (error) { rmSync(dir, { recursive: true, force: true }); throw error; }
}
