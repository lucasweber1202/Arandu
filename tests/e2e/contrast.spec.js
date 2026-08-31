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
 *
 * Gradiente não é motivo para desistir da medição. Ele declara as próprias
 * paradas de cor, então dá para medir o texto contra cada uma e cobrar a pior
 * — que é o pedaço onde a pessoa vai ler pior. Ignorar gradiente deixou passar
 * a legenda do preço da obra a 1.4:1: o bloco tem `#2b0c09 → #a83226` por
 * baixo, e uma regra de seção clara pintava o texto de marrom escuro.
 *
 * Imagem de fundo continua fora: aí não há cor declarada para comparar, e um
 * número inventado seria pior que nenhum.
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
  /**
   * Cor de um `linear-gradient` no ponto onde o texto está.
   *
   * Medir contra a pior parada da caixa inteira não diz nada: num gradiente de
   * 135° que vai do quase preto ao creme, um rótulo no canto superior esquerdo
   * está sobre o quase preto e nunca encosta no creme. O que vale é a cor sob
   * o elemento, e ela é calculável — o gradiente declara ângulo e paradas.
   */
  const corDoGradienteSob = (imagem, caixaDoFundo, caixaDoTexto) => {
    // `background-image` aceita lista de camadas, e a ÚLTIMA é a pintada por
    // baixo — é ela que dá o chão do texto. `.rect-hero` põe um brilho radial
    // sobre um linear escuro; ler as duas juntas produzia uma cor que não
    // existe em lugar nenhum da tela, e ler só a de cima descartava o chão.
    const camadas = [];
    let profundidade = 0;
    let inicio = 0;
    for (let indice = 0; indice < imagem.length; indice += 1) {
      const caractere = imagem[indice];
      if (caractere === '(') profundidade += 1;
      else if (caractere === ')') profundidade -= 1;
      else if (caractere === ',' && profundidade === 0) {
        camadas.push(imagem.slice(inicio, indice).trim());
        inicio = indice + 1;
      }
    }
    camadas.push(imagem.slice(inicio).trim());
    const base = camadas[camadas.length - 1];
    if (!base.startsWith('linear-gradient(') || !base.endsWith(')')) return null;
    const corpo = base.slice('linear-gradient('.length, -1);
    const grausDeclarados = corpo.match(/^\s*(-?[\d.]+)deg/);
    // Sem ângulo explícito o CSS usa 180deg (de cima para baixo).
    const graus = grausDeclarados ? Number(grausDeclarados[1]) : 180;
    const pedacos = corpo.replace(/^\s*-?[\d.]+deg\s*,/, '').split(/,(?![^(]*\))/);
    const paradas = [];
    pedacos.forEach((pedaco, indice) => {
      const cor = pedaco.match(/rgba?\([^)]*\)/);
      if (!cor) return;
      const posicao = pedaco.match(/([\d.]+)%/);
      paradas.push({
        cor: componentes(cor[0]),
        alfa: opacidade(cor[0]),
        posicao: posicao ? Number(posicao[1]) / 100 : indice / Math.max(1, pedacos.length - 1)
      });
    });
    if (paradas.length < 2) return null;

    // Projeção do centro do texto sobre o eixo do gradiente, em [0,1].
    const radianos = (graus - 90) * Math.PI / 180;
    const largura = caixaDoFundo.width || 1;
    const altura = caixaDoFundo.height || 1;
    const comprimento = Math.abs(largura * Math.cos(radianos)) + Math.abs(altura * Math.sin(radianos));
    const deslocamentoX = (caixaDoTexto.left + caixaDoTexto.width / 2) - (caixaDoFundo.left + largura / 2);
    const deslocamentoY = (caixaDoTexto.top + caixaDoTexto.height / 2) - (caixaDoFundo.top + altura / 2);
    const projecao = deslocamentoX * Math.cos(radianos) + deslocamentoY * Math.sin(radianos);
    const posicao = Math.max(0, Math.min(1, 0.5 + projecao / (comprimento || 1)));

    let anterior = paradas[0];
    let seguinte = paradas[paradas.length - 1];
    for (let indice = 0; indice < paradas.length - 1; indice += 1) {
      if (posicao >= paradas[indice].posicao && posicao <= paradas[indice + 1].posicao) {
        anterior = paradas[indice];
        seguinte = paradas[indice + 1];
        break;
      }
    }
    const vao = seguinte.posicao - anterior.posicao;
    const fracao = vao > 0 ? (posicao - anterior.posicao) / vao : 0;
    return {
      cor: anterior.cor.map((canalAnterior, eixo) => Math.round(canalAnterior + (seguinte.cor[eixo] - canalAnterior) * fracao)),
      alfa: anterior.alfa + (seguinte.alfa - anterior.alfa) * fracao
    };
  };

  /** Cor de cima com opacidade `alfa` sobre a cor de baixo. */
  const compor = (cima, alfa, baixo) => cima.map((canal, eixo) => Math.round(canal * alfa + baixo[eixo] * (1 - alfa)));

  // Devolve as cores de fundo candidatas. `null` significa "não dá para medir".
  const fundoDe = (elemento, caixaDoTexto) => {
    let no = elemento;
    while (no) {
      const estilo = getComputedStyle(no);
      const imagem = estilo.backgroundImage;
      if (imagem && imagem !== 'none') {
        // Imagem de fundo não declara cor: medir aqui seria inventar número.
        if (imagem.includes('url(')) return null;
        const camada = corDoGradienteSob(imagem, no.getBoundingClientRect(), caixaDoTexto);
        if (camada) {
          if (camada.alfa >= 0.995) return [camada.cor];
          // Véu translúcido: o que vale é o resultado da composição sobre o
          // que está embaixo. Ignorar isso media a cor errada — foi assim que
          // um rótulo vermelho escuro sobre véu marrom passou despercebido.
          const abaixo = no.parentElement ? fundoDe(no.parentElement, caixaDoTexto) : [[255, 255, 255]];
          if (!abaixo) return null;
          return abaixo.map((base) => compor(camada.cor, camada.alfa, base));
        }
        // Radial ou cônico: sem geometria simples para resolver. Antes de
        // subir, vale a cor sólida do próprio nó — `.proposal-hero` pinta
        // `rgb(77,16,12)` e desenha um brilho radial por cima, e ignorar a cor
        // de baixo fazia o texto claro parecer estar sobre a página inteira.
        if (estilo.backgroundColor && opacidade(estilo.backgroundColor) > 0.6) return [componentes(estilo.backgroundColor)];
        no = no.parentElement;
        continue;
      }
      if (estilo.backgroundColor && opacidade(estilo.backgroundColor) > 0.6) return [componentes(estilo.backgroundColor)];
      no = no.parentElement;
    }
    return [[255, 255, 255]];
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

    const fundos = fundoDe(elemento, caixa);
    if (!fundos) return;
    medidos += 1;

    // Sobre gradiente vale a pior parada: é onde a leitura fica mais difícil.
    const luzDoTexto = luminancia(componentes(estilo.color));
    const razao = Math.min.apply(null, fundos.map((fundo) => {
      const [claro, escuro] = [luzDoTexto, luminancia(fundo)].sort((a, b) => b - a);
      return (claro + 0.05) / (escuro + 0.05);
    }));
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
