# Bundle headroom — previews financeiros

Medição local em 04/10/2026, baseline `pilot` `7a0a839776bdaf1e95e6a67505f5f49289c51a59`.

O preview financeiro deixa de habilitar implicitamente o sandbox. O projeto
independente `arandu-demo`, `build:demo`, os previews com `ARANDU_DEMO_MODE=true`
e a apresentação com `ARANDU_PRESENTATION_MODE=true` continuam habilitando a
demonstração. Ambientes com Supabase próprio continuam recusando o sandbox.
Nenhuma rota financeira, transporte, renderer ou função de domínio foi removida.

| Build | JS total | Maior chunk | Margem até 800.000 |
| --- | ---: | ---: | ---: |
| Preview anterior, sandbox implícito | 798.135 | 88.484 | 1.865 |
| Preview financeiro, sandbox explícito | 426.007 | 82.324 | 373.993 |
| Demo independente / preview demonstrativo explícito | 798.135 | 88.484 | 1.865 |

**A demo ainda precisa de headroom próprio.** Esta mudança separa superfícies;
não reduz os 798.135 bytes do build demonstrativo. A meta de 750 KB é atendida
pelo preview financeiro. Não se deve acrescentar P1.4 ao sandbox legado para
consumir sua margem residual; ele já não é a demonstração canônica.

Os limites de JS total (800.000) e maior chunk (100.000), module semantics,
preload, thresholds de desempenho, retries e browsers permanecem iguais.
O CI mantém a verificação de preview demonstrativo explícito e acrescenta a
verificação de preview financeiro sem páginas ou motor fictício.

## Reprodução

```bash
VERCEL_ENV=preview npm run build
npm run check:build-size
node scripts/test-demo-mode.mjs --dist
npm run check:dist-assets

ARANDU_DEMO_MODE=true VERCEL_ENV=preview npm run build
npm run check:build-size
node scripts/test-demo-mode.mjs --dist --expect-demo

npm run build:demo
npm run check:build-size
```

Cada build escreve `reports/bundle-profile.json`, fora de `dist`, com bytes
reais dos chunks publicados, imports estáticos/dinâmicos, entrypoints, closure
estática sem contagem dupla, módulos duplicados e grupos demo/terceiros/virtuais.
`renderedLength` é um sinal de atribuição do bundler, não um tamanho minificado
exato por módulo. O `check:build-size` segue sendo a medição autoritativa: ele
inclui também os assets copiados depois do Vite. O perfil é diagnóstico e não
altera chunking ou execução.

O maior chunk anterior (`workspace`, 88.484 bytes) pertence à demo. `company`
(~82 KB) agrega contratos, relacionamento, integrações e SSO. `rfq` (~80 KB)
agrega RFQ e policy. O chunk chamado `preload-helper` contém também `products`
e `core`; seu nome não implica que todo seu tamanho seja runtime de preload.
Os módulos de demo desaparecem do preview financeiro e já estavam ausentes
da produção financeira. Esses são os próximos candidatos a divisão por
capability para reduzir downloads por rota, independentemente do teto total.

Desempenho WebKit p95, mobile startup e E2E precisam ser verificados pelos
jobs `validate` e `presentation` no HEAD da PR. Build e testes de fronteira
locais não substituem esses resultados.

## Hard limit × healthy operating envelope (Guideline v3 §24) — 05/10/2026

Medição local da baseline de reconciliação v3 (`pilot@d828a44` + Vite 8.3.2), com
`ARANDU_SITE_URL` igual ao CI. O **hard limit** é o que `check:build-size` aplica e
**não foi alterado**. O **healthy operating envelope** proposto aqui é ≥ 10% de margem
sobre cada hard limit (JS total ≤ 720.000; maior chunk ≤ 90.000): abaixo dele, nova
capability de peso material precisa trazer modularização, lazy loading, split de
superfície ou remoção de duplicação (v3 §24.2).

| Build | JS total | Margem até 800.000 | Margem % | Maior chunk | Margem até 100.000 | Dentro do envelope? |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Produção/preview financeiro (`npm run build`) | 426.174 | 373.826 | 46,7% | 82.324 (`company`) | 17.676 (17,7%) | sim |
| Demo independente (`npm run build:demo`) | 799.005 | **995** | **0,12%** | 89.125 | 10.875 (10,9%) | **não** |

Variação frente à medição da #125 (05/10, Vite 8.3.1): financeiro 426.007 → 426.174
(+167); demo 798.838 → 799.005 (+167) — o delta é do Vite 8.3.2, não de código do produto.

**Technical capacity risk (demo).** A demo independente está 995 bytes abaixo do hard
limit de JS total. Qualquer acréscimo ao sandbox legado ou à demo — inclusive P1.4 — falha o
CI. Ação recomendada, fora desta rodada: dividir `workspace`/central de comando por rota ou
aposentar o sandbox legado quando a demo canônica (Supabase DEMO) existir. **Não** aumentar o
limite para fazer CI passar. O build financeiro, que é o que vai para Pilot/Produção, tem
folga confortável.

## Consolidação `main` canônica — 06/10/2026 (modelo vigente)

Medição local (`ARANDU_SITE_URL` como no CI, Vite 8.3.2) da árvore consolidada
(`pilot@2241d3b` + #135). Antes = árvore consolidada sem as mudanças desta rodada.

**Causa do problema.** `check:build-size` somava todo JS do `dist` contra um único
teto de 800.000 bytes. No build do sandbox legado esse total é o **produto**
(o mesmo publicado em Oficial, Staging e Demo canônica) **mais** a camada do
sandbox (`finance/demo/**`, nunca carregada fora de `/demo`). Com 331 bytes de
margem, as capabilities novas eram retiradas do build demonstrativo
(`productionOnly` e `...(__ARANDU_DEMO__ ? {} : {...})` em `finance/app.js`) —
o teto agregado produzia divergência de produto. E o total não media o que o
usuário baixa: abrir Tarefas carregava 292 KB porque `company.js` importava
estaticamente contratos, relacionamento, policy, integrações e SSO.

**Correção arquitetural (sem relaxar o hard limit do produto):**

1. Code splitting por capability em `finance/src/views/company.js`: cada tela
   carrega sob demanda só o módulo que usa; `lazyDocuments` saiu de `rfq.js`
   (que puxava RFQ + policy) para `shared.js`.
2. As seis telas pós-contrato existem em **todo** build (não há mais exclusão por
   modo de build).
3. `scripts/build-size.mjs` mede duas superfícies e as rotas:

| Métrica | Hard limit | Mudança |
| --- | ---: | --- |
| `javascript` — superfície de **produto**, em todo build | 800.000 | **inalterado** (agora também no build do sandbox) |
| `sandboxJavascript` — chunks 100% `finance/demo/**` | 330.000 | **novo, congelado** no medido (327.597): o sandbox não cresce; sai inteiro quando `arandu-demo` migrar |
| `largestRouteJavascript` — união do fechamento estático do app + tela | 250.000 | **novo**; a baseline (294.754, `company`) teria falhado |
| `largestJavascript`, `css`, `largestCss`, `total`, `largestImage` | iguais | inalterados |
| aviso acima de 90% de qualquer limite | — | novo (envelope saudável, §24.1) |

Justificativa da separação: o teto agregado misturava duas superfícies com
ciclos de vida opostos (produto, que cresce com o roadmap; sandbox legado,
congelado e com aposentadoria decidida). Nenhum byte de produto ganhou folga:
o produto continua com 800.000, agora verificado inclusive no build do sandbox,
e o sandbox perdeu a capacidade de crescer. O total do build do sandbox passa a
ser ≤ 800.000 + 330.000 por construção — declarado aqui, não silencioso.

| Build | Produto JS (antes → depois) | Sandbox JS | Maior rota (antes → depois) |
| --- | ---: | ---: | ---: |
| Produto (`npm run build`: Oficial, Staging, Demo canônica) | 429.626 → 434.083 (54% do limite) | 0 | 294.754 `company` → 212.021 `rfq` |
| Sandbox legado (`npm run build:demo`) | 472.072 → 478.349 | 327.597 (99% do congelado, aviso esperado) | 294.754 → 212.021 |

Rotas (build de produto, depois): `rfq` 208.624 · `company` 152.730 (era 292.000) ·
`provider` 151.272 · `passport` 142.223 (era 220.000) · `dashboard` 129.072 ·
telas pós-contrato ≈ 88.300 cada. Teste: `scripts/test-build-size.mjs`
(em `check:platform`).

Próximos candidatos: `rfq.js` importa `policy.js` (48 KB) estaticamente; a
demo canônica (`ARANDU_ENV=demo`) já usa o build de produto, com 366 KB de margem.
