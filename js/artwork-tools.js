/**
 * Ferramentas de acervo: leitura objetiva e comparação.
 *
 * Os dois assuntos vivem no mesmo arquivo de propósito. A página da obra
 * precisa dos dois, e `obra.html` já opera no limite do orçamento de
 * requisições da suíte de performance — dois arquivos separados estouravam o
 * teto de 45 pedidos. Um módulo, dois objetos globais.
 */

/* ---------------------------------------------------------------------------
 * Leitura objetiva de obra e de artista.
 *
 * Tudo aqui é aritmética sobre os campos que o próprio catálogo publica —
 * dimensão, preço, técnica, edição, status. Nada é estimativa de mercado,
 * avaliação ou projeção de valorização: a Arandu não publica esse dado, e
 * inventá-lo seria enganar quem está decidindo uma compra. Quando um campo
 * falta, a linha correspondente simplesmente não aparece.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  function numero(valor) {
    if (typeof valor === 'number' && isFinite(valor)) return valor;
    var texto = String(valor == null ? '' : valor).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    var convertido = Number.parseFloat(texto);
    return isFinite(convertido) ? convertido : null;
  }

  function moeda(valor) {
    var n = numero(valor);
    return n === null ? null : MOEDA.format(n);
  }

  /**
   * "120 x 100 cm" -> { largura: 120, altura: 100, areaCm2: 12000 }.
   * Aceita vírgula decimal e um terceiro eixo (profundidade), que entra no
   * resultado mas fica fora da área — área de parede é o que orienta a escala.
   */
  function dimensoes(texto) {
    var bruto = String(texto == null ? '' : texto);
    var achados = bruto.match(/\d+(?:[.,]\d+)?/g);
    if (!achados || achados.length < 2) return null;
    var eixos = achados.slice(0, 3).map(function (item) { return Number.parseFloat(item.replace(',', '.')); });
    if (eixos.some(function (item) { return !isFinite(item) || item <= 0; })) return null;
    var resultado = { largura: eixos[0], altura: eixos[1], areaCm2: eixos[0] * eixos[1] };
    if (eixos.length > 2) resultado.profundidade = eixos[2];
    return resultado;
  }

  // Faixas escolhidas pela leitura de parede, não por estatística do acervo:
  // até meio metro de lado a obra convive com estante e nicho; acima de 8.000
  // cm² ela passa a pedir parede própria e distância de observação.
  function escala(areaCm2) {
    if (!isFinite(areaCm2) || areaCm2 <= 0) return null;
    if (areaCm2 <= 2500) return { chave: 'pequena', rotulo: 'Escala pequena', nota: 'Convive com estante, nicho e parede compartilhada.' };
    if (areaCm2 <= 8000) return { chave: 'media', rotulo: 'Escala média', nota: 'Funciona como peça principal de uma parede comum.' };
    return { chave: 'grande', rotulo: 'Escala grande', nota: 'Pede parede própria e distância para ser lida inteira.' };
  }

  /** Preço por metro quadrado de superfície — comparável entre obras de tamanhos diferentes. */
  function precoPorMetroQuadrado(preco, areaCm2) {
    var valor = numero(preco);
    if (valor === null || !isFinite(areaCm2) || areaCm2 <= 0) return null;
    return valor / (areaCm2 / 10000);
  }

  function mediana(lista) {
    if (!lista.length) return null;
    var ordenada = lista.slice().sort(function (a, b) { return a - b; });
    var meio = Math.floor(ordenada.length / 2);
    return ordenada.length % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2;
  }

  /**
   * Onde o preço desta obra cai dentro do acervo publicado. É uma posição
   * relativa ao que está no ar hoje, não um julgamento de valor — o rótulo diz
   * isso com todas as letras.
   */
  function posicaoDePreco(preco, catalogo) {
    var valor = numero(preco);
    if (valor === null) return null;
    var precos = (catalogo || []).map(function (item) { return numero(item.price); }).filter(function (item) { return item !== null; });
    if (precos.length < 4) return null;
    var abaixo = precos.filter(function (item) { return item < valor; }).length;
    var percentil = Math.round((abaixo / precos.length) * 100);
    var rotulo = percentil <= 33 ? 'Entre as mais acessíveis do acervo'
      : percentil <= 66 ? 'Na faixa intermediária do acervo'
        : 'Entre as mais altas do acervo';
    return { percentil: percentil, rotulo: rotulo, total: precos.length, minimo: Math.min.apply(null, precos), maximo: Math.max.apply(null, precos) };
  }

  function textoDeLista(lista, limite) {
    var itens = (Array.isArray(lista) ? lista : []).filter(Boolean).slice(0, limite || 6);
    return itens.length ? itens.join(' · ') : null;
  }

  /**
   * Linhas prontas para a ficha de leitura da obra. Cada uma só existe se o
   * dado existir; nenhuma é preenchida com valor padrão.
   */
  function analisarObra(obra, catalogo) {
    if (!obra) return { linhas: [], escala: null };
    var medida = dimensoes(obra.dimensions);
    var linhas = [];
    var classe = medida ? escala(medida.areaCm2) : null;

    if (medida) {
      linhas.push({
        rotulo: 'Superfície',
        valor: (Math.round(medida.areaCm2) / 10000).toFixed(2).replace('.', ',') + ' m²',
        nota: medida.largura + ' × ' + medida.altura + ' cm'
      });
    }
    if (classe) linhas.push({ rotulo: 'Leitura de escala', valor: classe.rotulo, nota: classe.nota });

    var porMetro = medida ? precoPorMetroQuadrado(obra.price, medida.areaCm2) : null;
    if (porMetro !== null) {
      linhas.push({
        rotulo: 'Preço por m² de superfície',
        valor: moeda(Math.round(porMetro)),
        nota: 'Aritmética sobre preço e dimensão publicados, para comparar obras de tamanhos diferentes.'
      });
    }

    var posicao = posicaoDePreco(obra.price, catalogo);
    if (posicao) {
      linhas.push({
        rotulo: 'Posição de preço no acervo',
        valor: posicao.rotulo,
        nota: 'Comparado com as ' + posicao.total + ' obras publicadas hoje, de ' + moeda(posicao.minimo) + ' a ' + moeda(posicao.maximo) + '.'
      });
    }

    if (obra.edition) linhas.push({ rotulo: 'Edição', valor: String(obra.edition), nota: /única/i.test(String(obra.edition)) ? 'Exemplar único: não há outra tiragem desta obra.' : 'Tiragem limitada e numerada.' });
    if (obra.year) linhas.push({ rotulo: 'Ano', valor: String(obra.year), nota: null });
    if (obra.technique) linhas.push({ rotulo: 'Técnica', valor: String(obra.technique), nota: null });

    var ambientes = textoDeLista(obra.spaces || obra.recommendedFor);
    if (ambientes) linhas.push({ rotulo: 'Ambientes indicados pela curadoria', valor: ambientes, nota: null });

    return { linhas: linhas, escala: classe, medida: medida, posicao: posicao };
  }

  /** Retrato do artista a partir das obras dele que estão publicadas. */
  function analisarArtista(artista, catalogo) {
    var lista = (catalogo || []).filter(function (item) {
      if (!artista) return false;
      if (artista.id && (item.artistId === artista.id || item.artist_id === artista.id)) return true;
      return Boolean(artista.name) && item.artist === artista.name;
    });
    if (!lista.length) return { obras: 0, linhas: [] };

    var precos = lista.map(function (item) { return numero(item.price); }).filter(function (item) { return item !== null; });
    var disponiveis = lista.filter(function (item) { return /dispon/i.test(String(item.status || '')); }).length;
    var linhas = [];

    linhas.push({ rotulo: 'Obras publicadas', valor: String(lista.length), nota: disponiveis + ' disponível' + (disponiveis === 1 ? '' : 'is') + ' para conversa hoje.' });

    if (precos.length) {
      var minimo = Math.min.apply(null, precos);
      var maximo = Math.max.apply(null, precos);
      linhas.push({
        rotulo: 'Faixa de preço',
        valor: minimo === maximo ? moeda(minimo) : moeda(minimo) + ' a ' + moeda(maximo),
        nota: precos.length > 2 ? 'Mediana de ' + moeda(Math.round(mediana(precos))) + '.' : null
      });
    }

    var linguagens = textoDeLista([...new Set(lista.map(function (item) { return item.type || item.language; }).filter(Boolean))]);
    if (linguagens) linhas.push({ rotulo: 'Linguagens no acervo', valor: linguagens, nota: null });

    var tecnicas = textoDeLista([...new Set(lista.map(function (item) { return item.technique; }).filter(Boolean))], 4);
    if (tecnicas) linhas.push({ rotulo: 'Técnicas', valor: tecnicas, nota: null });

    var lugar = [artista && artista.city, artista && artista.state || artista && artista.region].filter(Boolean).join(' · ');
    if (lugar) linhas.push({ rotulo: 'Território', valor: lugar, nota: null });

    return { obras: lista.length, disponiveis: disponiveis, lista: lista, linhas: linhas };
  }

  window.AranduAnalysis = Object.freeze({
    dimensoes: dimensoes,
    escala: escala,
    moeda: moeda,
    numero: numero,
    mediana: mediana,
    precoPorMetroQuadrado: precoPorMetroQuadrado,
    posicaoDePreco: posicaoDePreco,
    analisarObra: analisarObra,
    analisarArtista: analisarArtista
  });
})();

/* ---------------------------------------------------------------------------
 * Comparação de obras.
 *
 * A página comparar-obras.html existia com o gancho `data-compare-runtime` e a
 * chave `arandu.compare.v1`, mas todos os seis scripts que tocavam nessa chave
 * eram carregados por zero páginas: não havia como pôr uma obra na comparação,
 * e a página abria vazia para sempre. Este é o código que faltava, e é o único
 * dono da chave.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var CHAVE = 'arandu.compare.v1';
  var LIMITE = 4;
  var eventos = 'arandu:compare-changed';

  function escapar(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>'"]/g, function (caractere) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[caractere];
    });
  }

  function ler() {
    try {
      var bruto = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(bruto) ? bruto.filter(function (item) { return item && item.id; }).slice(0, LIMITE) : [];
    } catch { return []; }
  }

  function gravar(lista) {
    try { localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, LIMITE))); } catch { /* cota cheia ou modo privado */ }
    document.dispatchEvent(new CustomEvent(eventos, { detail: { total: lista.length } }));
  }

  /** Registro compacto: o suficiente para a tabela abrir sem depender da rede. */
  function compactar(obra) {
    return {
      id: String(obra.id),
      title: obra.title || 'Obra',
      artist: obra.artist || obra.artist_name || '',
      artistId: obra.artistId || obra.artist_id || '',
      type: obra.type || obra.language || '',
      technique: obra.technique || '',
      dimensions: obra.dimensions || '',
      year: obra.year || '',
      edition: obra.edition || '',
      status: obra.status || '',
      certificate: obra.certificate === true,
      price: obra.price,
      priceLabel: obra.priceLabel || obra.price_label || '',
      thumb: obra.thumb || '',
      image: obra.mainImage || obra.main_image_url || obra.image_url || '',
      url: obra.url || ('obra.html?id=' + encodeURIComponent(obra.id))
    };
  }

  function tem(id) { return ler().some(function (item) { return item.id === String(id); }); }

  function alternar(obra) {
    var lista = ler();
    var indice = lista.findIndex(function (item) { return item.id === String(obra.id); });
    if (indice >= 0) { lista.splice(indice, 1); gravar(lista); return { adicionada: false, cheia: false }; }
    if (lista.length >= LIMITE) return { adicionada: false, cheia: true };
    lista.push(compactar(obra));
    gravar(lista);
    return { adicionada: true, cheia: false };
  }

  function remover(id) { gravar(ler().filter(function (item) { return item.id !== String(id); })); }
  function limpar() { gravar([]); }

  // --- Botões de comparar, onde quer que estejam --------------------------
  //
  // O catálogo, a página da obra e a seleção montam cartões em momentos
  // diferentes, então a escuta é delegada no documento e o estado dos botões é
  // reconciliado a cada mudança, em vez de cada tela cuidar do próprio botão.

  function dadosDoBotao(botao) {
    return {
      id: botao.getAttribute('data-compare-artwork'),
      title: botao.getAttribute('data-compare-title') || '',
      artist: botao.getAttribute('data-compare-artist') || '',
      artistId: botao.getAttribute('data-compare-artist-id') || '',
      type: botao.getAttribute('data-compare-type') || '',
      technique: botao.getAttribute('data-compare-technique') || '',
      dimensions: botao.getAttribute('data-compare-dimensions') || '',
      year: botao.getAttribute('data-compare-year') || '',
      edition: botao.getAttribute('data-compare-edition') || '',
      status: botao.getAttribute('data-compare-status') || '',
      certificate: botao.getAttribute('data-compare-certificate') === 'true',
      price: Number(botao.getAttribute('data-compare-price')) || undefined,
      priceLabel: botao.getAttribute('data-compare-price-label') || '',
      thumb: botao.getAttribute('data-compare-thumb') || '',
      image: botao.getAttribute('data-compare-image') || '',
      url: botao.getAttribute('data-compare-url') || ''
    };
  }

  function sincronizarBotoes() {
    var atuais = ler();
    document.querySelectorAll('[data-compare-artwork]').forEach(function (botao) {
      var dentro = atuais.some(function (item) { return item.id === botao.getAttribute('data-compare-artwork'); });
      botao.setAttribute('aria-pressed', dentro ? 'true' : 'false');
      botao.classList.toggle('is-comparing', dentro);
      var rotulo = botao.querySelector('[data-compare-label]');
      if (rotulo) rotulo.textContent = dentro ? 'Comparando' : 'Comparar';
      if (!botao.getAttribute('title')) botao.setAttribute('title', 'Adicionar à comparação');
    });
  }

  document.addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-compare-artwork]');
    if (!botao) return;
    evento.preventDefault();
    var resultado = alternar(dadosDoBotao(botao));
    if (resultado.cheia) avisar('A comparação já tem ' + LIMITE + ' obras. Remova uma para incluir outra.');
    sincronizarBotoes();
  });

  function avisar(texto) {
    var caixa = document.querySelector('[data-compare-aviso]');
    if (!caixa) return;
    caixa.textContent = texto;
    caixa.hidden = false;
  }

  // --- Barra de comparação -------------------------------------------------
  //
  // Fica acima do botão do assistente, nunca ao lado dele, e some enquanto a
  // barra de privacidade estiver na tela: cobrir a escolha de consentimento já
  // foi defeito aqui antes.

  function barra() {
    var existente = document.querySelector('[data-compare-bar]');
    var lista = ler();
    var consentindo = Boolean(document.querySelector('[data-privacy-banner]'));
    var naPropriaPagina = Boolean(document.querySelector('[data-compare-runtime]'));

    if (!lista.length || consentindo || naPropriaPagina) {
      if (existente) existente.remove();
      return;
    }
    var caixa = existente || document.createElement('aside');
    caixa.className = 'compare-bar';
    caixa.setAttribute('data-compare-bar', 'true');
    caixa.setAttribute('role', 'region');
    caixa.setAttribute('aria-label', 'Comparação de obras');
    caixa.innerHTML = '<p class="compare-bar-count"><strong>' + lista.length + '</strong> '
      + (lista.length === 1 ? 'obra na comparação' : 'obras na comparação') + '</p>'
      + '<ul class="compare-bar-list">' + lista.map(function (item) {
        return '<li><span>' + escapar(item.title) + '</span><button type="button" data-compare-remove="' + escapar(item.id)
          + '" aria-label="Tirar ' + escapar(item.title) + ' da comparação">Tirar</button></li>';
      }).join('') + '</ul>'
      + '<div class="compare-bar-actions"><a class="cta" href="comparar-obras.html">Comparar agora</a>'
      + '<button type="button" data-compare-clear>Limpar</button></div>';
    if (!existente) document.body.appendChild(caixa);
  }

  document.addEventListener('click', function (evento) {
    var remove = evento.target.closest('[data-compare-remove]');
    if (remove) { remover(remove.getAttribute('data-compare-remove')); sincronizarBotoes(); return; }
    if (evento.target.closest('[data-compare-clear]')) { limpar(); sincronizarBotoes(); }
  });

  // --- Tabela da página de comparação -------------------------------------

  function celulaDeMidia(item) {
    if (item.image) {
      return '<img class="compare-media" src="' + escapar(item.image) + '" alt="" loading="lazy" decoding="async" width="320" height="240">';
    }
    return '<span class="compare-media ' + escapar(item.thumb || 'thumb-terra') + '" aria-hidden="true"></span>';
  }

  function linhasDaTabela(lista) {
    var analise = window.AranduAnalysis;
    return [
      ['Artista', function (item) { return item.artist || null; }],
      ['Linguagem', function (item) { return item.type || null; }],
      ['Técnica', function (item) { return item.technique || null; }],
      ['Dimensões', function (item) { return item.dimensions || null; }],
      ['Superfície', function (item) {
        var medida = analise && analise.dimensoes(item.dimensions);
        return medida ? (Math.round(medida.areaCm2) / 10000).toFixed(2).replace('.', ',') + ' m²' : null;
      }],
      ['Escala', function (item) {
        var medida = analise && analise.dimensoes(item.dimensions);
        var classe = medida && analise.escala(medida.areaCm2);
        return classe ? classe.rotulo : null;
      }],
      ['Ano', function (item) { return item.year || null; }],
      ['Edição', function (item) { return item.edition || null; }],
      ['Certificado', function (item) { return item.certificate ? 'Certificado Arandu' : null; }],
      ['Disponibilidade', function (item) { return item.status || null; }],
      ['Preço', function (item) { return item.priceLabel || (analise ? analise.moeda(item.price) : null); }],
      ['Preço por m²', function (item) {
        var medida = analise && analise.dimensoes(item.dimensions);
        var porMetro = medida && analise.precoPorMetroQuadrado(item.price, medida.areaCm2);
        return porMetro ? analise.moeda(Math.round(porMetro)) : null;
      }]
    ].filter(function (linha) {
      // Linha em que nenhuma das obras tem dado não vira linha vazia na tabela.
      return lista.some(function (item) { return linha[1](item); });
    });
  }

  function renderizarPagina() {
    var alvo = document.querySelector('[data-compare-runtime]');
    if (!alvo) return;
    var lista = ler();

    if (!lista.length) {
      alvo.innerHTML = '<div class="op-empty"><strong>Nenhuma obra na comparação</strong>'
        + '<span>Abra o acervo e use "Comparar" em até ' + LIMITE + ' obras. A comparação fica guardada neste navegador.</span>'
        + '<div class="arandu-rescue-actions"><a href="comprar-arte.html">Ver o acervo</a><a href="minha-selecao.html">Abrir minha seleção</a></div></div>';
      return;
    }

    var linhas = linhasDaTabela(lista);
    alvo.innerHTML = '<div class="compare-scroller"><table class="compare-table">'
      + '<caption class="visually-hidden">Comparação entre ' + lista.length + ' obras do acervo</caption>'
      + '<thead><tr><th scope="col">Obra</th>' + lista.map(function (item) {
        return '<th scope="col"><a href="' + escapar(item.url) + '">' + celulaDeMidia(item)
          + '<strong>' + escapar(item.title) + '</strong></a>'
          + '<button type="button" class="compare-drop" data-compare-remove="' + escapar(item.id) + '">Tirar da comparação</button></th>';
      }).join('') + '</tr></thead>'
      + '<tbody>' + linhas.map(function (linha) {
        var valores = lista.map(function (item) { return linha[1](item); });
        // Quando as obras divergem numa característica, a linha inteira é
        // marcada: é a diferença que ajuda a decidir, não a coincidência.
        var diverge = new Set(valores.map(function (valor) { return String(valor); })).size > 1;
        return '<tr' + (diverge ? ' class="is-different"' : '') + '><th scope="row">' + escapar(linha[0]) + '</th>'
          + valores.map(function (valor) { return '<td>' + (valor ? escapar(valor) : '<span class="compare-vazio">não informado</span>') + '</td>'; }).join('')
          + '</tr>';
      }).join('') + '</tbody></table></div>'
      + '<div class="compare-actions"><a class="cta" href="minha-selecao.html">Levar para a seleção</a>'
      + '<a class="cta secondary" href="contato.html">Pedir leitura da curadoria</a>'
      + '<button type="button" class="cta secondary" data-compare-clear>Limpar comparação</button></div>';
  }

  function atualizar() { sincronizarBotoes(); barra(); renderizarPagina(); }

  document.addEventListener(eventos, atualizar);
  document.addEventListener('DOMContentLoaded', atualizar);

  // O catálogo, a obra e o artista montam os cartões depois que a resposta da
  // API chega, muito depois de DOMContentLoaded. Sem observar a inserção, os
  // botões nasciam sem estado: uma obra já em comparação aparecia como se não
  // estivesse, e `aria-pressed` nem existia para quem navega por leitor de tela.
  if (typeof MutationObserver === 'function') {
    var pendente = false;
    new MutationObserver(function (mutacoes) {
      if (pendente) return;
      var apareceu = mutacoes.some(function (mutacao) {
        return Array.prototype.some.call(mutacao.addedNodes, function (no) {
          return no.nodeType === 1 && (no.matches?.('[data-compare-artwork]') || no.querySelector?.('[data-compare-artwork]'));
        });
      });
      if (!apareceu) return;
      pendente = true;
      requestAnimationFrame(function () { pendente = false; sincronizarBotoes(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  // A escolha de privacidade remove a barra de consentimento do documento; a
  // barra de comparação só pode aparecer depois disso.
  document.addEventListener('click', function (evento) {
    if (evento.target.closest('[data-consent-essential], [data-consent-accept], [data-consent-reject]')) setTimeout(barra, 0);
  });
  if (document.readyState !== 'loading') atualizar();

  window.AranduCompare = Object.freeze({
    LIMITE: LIMITE,
    lista: ler,
    tem: tem,
    alternar: alternar,
    remover: remover,
    limpar: limpar,
    atualizar: atualizar
  });
})();
