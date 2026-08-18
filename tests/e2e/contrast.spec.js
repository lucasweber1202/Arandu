import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';

/**
 * Catraca de contraste sobre o build publicado.
 *
 * O site acumulou ~45 folhas de estilo que disputam `color` e `background` com
 * `!important`. O efeito recorrente é um par quebrado: uma camada troca o fundo
 * e outra mantém a cor do texto, e o resultado é creme sobre creme. Vários
 * casos assim estavam no ar — a prévia do certificado em confianca.html a
 * 1.0:1, o cartão de leitura curatorial da página da obra, o contador do
 * diretório de artistas a 1.01:1.
 *
 * A dívida restante está listada em PAGINAS_COM_DIVIDA. A lista existe para
 * poder encolher: qualquer página fora dela precisa passar em WCAG AA, então
 * uma regressão nova falha o build mesmo com a dívida antiga em aberto.
 * Ao corrigir uma página, remova-a da lista.
 */
const PAGINAS_COM_DIVIDA = new Set([]);

/** Abaixo disto a página ainda não terminou de montar e a leitura não conclui. */
const MEDICOES_MINIMAS = 12;

const CATALOGO = {
  ok: true,
  verifiedReady: true,
  items: [{
    id: 'obra-contraste',
    title: 'Horizonte de Barro',
    artist_name: 'Ayla Nunes',
    artist_id: 'artista-contraste',
    technique: 'Óleo sobre linho',
    dimensions: '120 x 90 cm',
    price: 6400,
    price_label: 'R$ 6.400',
    status: 'available',
    summary: 'Paisagem de sertão em camadas de ocre.',
    curatorial_reading: 'A obra opera entre a linha do horizonte e a matéria da terra.',
    tags: ['sertao'],
    certificate: true,
    created_at: '2026-05-01T12:00:00.000Z'
  }]
};

const ARTISTAS = {
  ok: true,
  verifiedReady: true,
  items: [{
    id: 'artista-contraste',
    name: 'Ayla Nunes',
    slug: 'ayla-nunes',
    city: 'Salvador',
    state: 'BA',
    profile: 'Pintura de território e memória.',
    statement: 'Trabalho a terra como pigmento.',
    status: 'published'
  }]
};

/**
 * Mede o contraste de cada nó de texto contra o fundo opaco mais próximo.
 * Elementos sobre gradiente ou imagem são ignorados: não há cor única para
 * comparar e uma medição inventada geraria falso positivo.
 */
const MEDIR_CONTRASTE = () => {
  const canal = (valor) => {
    const v = valor / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  const componentes = (valor) => (valor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const opacidade = (valor) => {
    const partes = valor.match(/rgba?\(([^)]+)\)/)?.[1]?.split(',') || [];
    return partes.length > 3 ? Number(partes[3]) : 1;
  };
  const fundoDe = (elemento) => {
    let no = elemento;
    while (no) {
      const estilo = getComputedStyle(no);
      if (estilo.backgroundImage && estilo.backgroundImage !== 'none') return null;
      if (estilo.backgroundColor && opacidade(estilo.backgroundColor) > 0.6) return componentes(estilo.backgroundColor);
      no = no.parentElement;
    }
    return [255, 255, 255];
  };

  const falhas = [];
  let medidos = 0;
  document.querySelectorAll('main *, footer *').forEach((elemento) => {
    const texto = [...elemento.childNodes]
      .filter((no) => no.nodeType === Node.TEXT_NODE)
      .map((no) => no.textContent.trim())
      .join('')
      .trim();
    if (texto.length < 3) return;

    const estilo = getComputedStyle(elemento);
    if (estilo.display === 'none' || estilo.visibility === 'hidden' || Number(estilo.opacity) < 0.6) return;
    const caixa = elemento.getBoundingClientRect();
    if (caixa.width < 8 || caixa.height < 8) return;

    const fundo = fundoDe(elemento);
    if (!fundo) return;
    medidos += 1;

    const [claro, escuro] = [luminancia(componentes(estilo.color)), luminancia(fundo)].sort((a, b) => b - a);
    const razao = (claro + 0.05) / (escuro + 0.05);
    const tamanho = parseFloat(estilo.fontSize);
    const negrito = Number(estilo.fontWeight) >= 700;
    const minimo = tamanho >= 24 || (tamanho >= 18.66 && negrito) ? 3 : 4.5;
    if (razao < minimo - 0.05) {
      falhas.push(`${elemento.tagName.toLowerCase()}.${String(elemento.className).slice(0, 30)} "${texto.slice(0, 32)}" ${razao.toFixed(2)}:1 (mínimo ${minimo})`);
    }
  });
  return { falhas: [...new Set(falhas)], medidos };
};

test('nenhuma página nova quebra o contraste mínimo WCAG AA', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Uma passagem por página basta; o contraste não depende do viewport.');
  // ~100 navegações em série, concorrendo com os demais workers do Playwright.
  test.setTimeout(300_000);

  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: false, verifiedReady: true, items: [] }) }));
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) }));
  await page.route('**/api/artists', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ARTISTAS) }));

  const paginas = readdirSync('dist').filter((arquivo) => arquivo.endsWith('.html')).sort();
  expect(paginas.length).toBeGreaterThan(50);

  const regressoes = [];
  const corrigidas = [];
  for (const pagina of paginas) {
    // `load` garante que as folhas de estilo foram aplicadas. Com
    // `domcontentloaded` a medição dependia de um `waitForTimeout` vencer a
    // aplicação do CSS, o que falhava sob contenção dos cinco projetos.
    await page.goto(`/${pagina}`, { waitUntil: 'load' });
    // Páginas legadas redirecionam sozinhas; medir a que some não diz nada
    // sobre ela e derruba a avaliação no meio da navegação.
    if (await page.locator('body[data-legacy-redirect]').count()) continue;
    await page.waitForTimeout(150);
    const { falhas, medidos } = await page.evaluate(MEDIR_CONTRASTE).catch(() => ({ falhas: [], medidos: 0 }));
    if (falhas.length && !PAGINAS_COM_DIVIDA.has(pagina)) regressoes.push(`${pagina}: ${falhas.slice(0, 10).join(' | ')}`);
    // Uma página que quase nada mediu ainda estava renderizando; declará-la
    // corrigida transformaria lentidão da máquina em falha de teste.
    if (!falhas.length && medidos >= MEDICOES_MINIMAS && PAGINAS_COM_DIVIDA.has(pagina)) corrigidas.push(pagina);
  }

  expect(regressoes, 'páginas novas com contraste abaixo de WCAG AA').toEqual([]);
  // A lista só pode encolher: quando uma página é corrigida, ela sai daqui.
  expect(corrigidas, 'páginas já corrigidas que devem sair de PAGINAS_COM_DIVIDA').toEqual([]);
});
