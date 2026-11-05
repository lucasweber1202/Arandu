import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
// Peso REAL de JavaScript por jornada (cache frio e quente) contra a baseline
// versionada em docs/perf/journey-js-baseline.json. Usa CDP (cobertura V8 e
// métricas de script), por isso só em Chromium; o script sobe seu próprio
// servidor com o cache de produção (assets imutáveis), API simulada.
test('jornadas principais dentro da baseline de JavaScript', async ({}, testInfo) => {
  // Uma medição por execução: CDP só no Chromium; o perfil desktop é o de referência.
  test.skip(testInfo.project.name !== 'chromium-desktop', 'medição via CDP no Chromium desktop');
  test.setTimeout(300000);
  let output = '';
  try {
    output = execFileSync(process.execPath, ['scripts/perf/measure-journeys.mjs', '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(`${error.stdout || ''}\n${error.stderr || ''}`);
  }
  expect(output).toContain('journey-js: dentro da baseline');
});
