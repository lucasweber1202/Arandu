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
