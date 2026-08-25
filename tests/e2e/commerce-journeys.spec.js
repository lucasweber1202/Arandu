import { test, expect } from '@playwright/test';

/**
 * Jornada de compra com a política comercial aprovada.
 *
 * Enquanto `ARANDU_COMMERCIAL_READY` é falso — o estado da beta — o site
 * substitui "Reservar com curadoria" por um caminho de contato, porque o
 * servidor recusa `/api/reservations` de forma fechada. Prometer o fluxo ali
 * seria mentir para o comprador.
 *
 * Esta suíte cobre o outro estado: exige um build gerado com
 * ARANDU_COMMERCIAL_READY=true (ver `pretest:e2e:commerce`) e garante que o
 * fluxo de reserva continua correto — chave de idempotência por tentativa,
 * honeypot vazio e recusa do servidor visível — para quando a política for
 * aprovada.
 */

const CATALOG = {
  ok: true,
  mode: 'supabase',
  verifiedReady: true,
  release: 'e2e-commerce-fixture',
  items: [
    {
      id: 'obra-horizonte',
      title: 'Horizonte de Barro',
      artist_name: 'Ayla Nunes',
      technique: 'Óleo sobre linho',
      dimensions: '120 x 90 cm',
      price: 6400,
      price_label: 'R$ 6.400',
      status: 'available',
      summary: 'Paisagem de sertão em camadas de ocre.',
      tags: ['sertao', 'pintura'],
      certificate: true,
      created_at: '2026-05-01T12:00:00.000Z'
    }
  ]
};

/** Silencia as rotas de rede que não existem no servidor estático de teste. */
async function stubApi(page, { catalog = CATALOG } = {}) {
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
  await page.route('**/api/artists', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, verifiedReady: true, items: [] }) }));
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: false }) }));
  await page.route('**/api/public-config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
}

/** Resolve a barra de consentimento para liberar a interação com a página. */
async function acceptEssential(page) {
  const banner = page.locator('[data-privacy-banner]');
  if (await banner.count()) {
    await page.locator('[data-consent-essential]').click();
    await expect(banner).toHaveCount(0);
  }
}

// O aviso de beta some quando a compra abre; sem ele o cartão de obra precisa
// oferecer a reserva de volta.
test('com a compra aberta, o aviso de beta sai e a reserva volta', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);
  await expect(page.locator('[data-beta-banner]')).toHaveCount(0);
  await expect(page.locator('[data-card-artwork="obra-horizonte"] [data-reserve-artwork]')).toBeVisible();
  await expect(page.locator('[data-commerce-replaced]')).toHaveCount(0);
});

test('reserva envia chave de idempotência e trata recusa do servidor', async ({ page }) => {
  await stubApi(page);
  const idempotencyKeys = [];
  await page.route('**/api/reservations', async (route) => {
    idempotencyKeys.push(route.request().headers()['idempotency-key']);
    const payload = route.request().postDataJSON();
    // O honeypot precisa continuar sendo enviado vazio por um usuário real.
    expect(payload.website ?? '').toBe('');
    expect(payload.artwork_id).toBe('obra-horizonte');
    await route.fulfill({
      status: idempotencyKeys.length === 1 ? 503 : 201,
      contentType: 'application/json',
      body: JSON.stringify(idempotencyKeys.length === 1
        ? { ok: false, error: 'O banco de produção ainda não está configurado.' }
        : { ok: true, stored: true })
    });
  });

  await page.goto('/comprar-arte.html');
  await acceptEssential(page);
  await page.locator('[data-card-artwork="obra-horizonte"] [data-reserve-artwork]').click();

  const dialog = page.locator('[data-reserve-modal] [role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Horizonte de Barro');

  await page.locator('[data-reserve-form] input[name="name"]').fill('Pessoa Compradora');
  await page.locator('[data-reserve-form] input[name="whatsapp"]').fill('11999990000');
  await page.locator('[data-reserve-form] button[type="submit"]').click();

  // Falha do servidor precisa aparecer para a pessoa, não sumir em silêncio.
  await expect(page.locator('[data-reserve-status]')).toContainText('banco de produção');

  await page.locator('[data-reserve-form] button[type="submit"]').click();
  await expect(page.locator('[data-reserve-status]')).toContainText('Reserva registrada');

  expect(idempotencyKeys).toHaveLength(2);
  for (const key of idempotencyKeys) expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  // Tentativas distintas precisam de chaves distintas, senão o retry legítimo
  // seria recusado como replay pelo servidor.
  expect(new Set(idempotencyKeys).size).toBe(2);
});
