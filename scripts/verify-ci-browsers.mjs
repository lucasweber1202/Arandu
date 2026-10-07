import { chromium, firefox, webkit } from '@playwright/test';

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try {
    browser = await engine.launch({ headless: true, timeout: 30000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.setContent('<!doctype html><title>Arandu browser preparation</title><p>ready</p>');
    if (await page.locator('p').textContent() !== 'ready') throw new Error('Page renderer did not respond.');
    console.log(`BROWSER_PREPARATION_OK ${name} ${browser.version()}`);
  } catch (error) {
    console.error(`BROWSER_PREPARATION_FAILED ${name}: ${error.message}`);
    process.exitCode = 1;
    break;
  } finally {
    if (browser) await browser.close();
  }
}
