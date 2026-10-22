// Explicit browser test: run after installing Chromium from package-lock.json.
// Not a replacement for the anonymous proof against the public domain.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { tabToLink } from './publication-proof.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<button>Primeiro</button><a href="#destino">Continuar</a>');
  const link = page.locator('a');
  await tabToLink(page, link);
  assert.equal(await link.evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#destino');

  await page.setContent('<button>Primeiro</button><a tabindex="-1" href="#destino">Inacessível</a>');
  await page.locator('a').focus();
  assert.equal(await page.locator('a').evaluate(e => e === document.activeElement), true,
    'baseline programmatic focus accepts the inaccessible link');
  await page.locator('button').focus();
  await assert.rejects(tabToLink(page, page.locator('a')), /unreachable by Tab/);

  await page.setContent('<button>Preso</button><a href="#destino">Continuar</a>');
  await page.evaluate(() => document.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.querySelector('button').focus(); }
  }));
  await assert.rejects(tabToLink(page, page.locator('a')), /unreachable by Tab/);
  console.log(`Publication keyboard: real Tab/Enter, tabindex=-1 and focus trap passed; Chromium ${browser.version()}.`);
} finally { await browser.close(); }
