import { test, expect } from '@playwright/test';

const PAGES = [
  '/',
  '/comprar-arte.html',
  '/obra.html',
  '/artistas.html',
  '/artista.html',
  '/encontrar-arte.html',
  '/login.html'
];

const BUDGET = Object.freeze({
  requests: 45,
  transferredBytes: 2_500_000,
  lcpMs: 5_000,
  cls: 0.2,
  tbtMs: 1_000
});

test.describe('laboratory performance budgets', () => {
  for (const route of PAGES) {
    test(`${route} respeita requests, bytes e Core Web Vitals de laboratório`, async ({ page, browserName }) => {
      await page.addInitScript(() => {
        window.__aranduLabMetrics = { lcp: null, cls: 0, longTasks: 0 };
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length) window.__aranduLabMetrics.lcp = entries.at(-1).startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {}
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__aranduLabMetrics.cls += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) window.__aranduLabMetrics.longTasks += Math.max(0, entry.duration - 50);
          }).observe({ type: 'longtask', buffered: true });
        } catch {}
      });

      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const navigation = performance.getEntriesByType('navigation')[0];
        return {
          requests: resources.length + (navigation ? 1 : 0),
          transferredBytes: Math.round(
            resources.reduce((total, entry) => total + (entry.transferSize || entry.encodedBodySize || 0), 0)
              + (navigation?.transferSize || navigation?.encodedBodySize || 0)
          ),
          lcpMs: window.__aranduLabMetrics?.lcp ?? null,
          cls: window.__aranduLabMetrics?.cls ?? null,
          tbtMs: window.__aranduLabMetrics?.longTasks ?? null
        };
      });
      console.log(JSON.stringify({ kind: 'arandu-lab-performance', browserName, route, ...metrics }));

      expect(metrics.requests, 'request budget').toBeLessThanOrEqual(BUDGET.requests);
      expect(metrics.transferredBytes, 'transfer budget').toBeLessThanOrEqual(BUDGET.transferredBytes);
      if (metrics.lcpMs !== null) expect(metrics.lcpMs, 'laboratory LCP').toBeLessThanOrEqual(BUDGET.lcpMs);
      if (metrics.cls !== null) expect(metrics.cls, 'laboratory CLS').toBeLessThanOrEqual(BUDGET.cls);
      if (metrics.tbtMs !== null) expect(metrics.tbtMs, 'laboratory TBT proxy').toBeLessThanOrEqual(BUDGET.tbtMs);
    });
  }
});
