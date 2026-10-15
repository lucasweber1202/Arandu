# Evidência — lote de produto (Claude), 15/10/2026

Base: `main` @ `57afa792` (#195). Branch: `claude/cool-davinci-pcc8gq`.
Ambiente: Demo canônica **local** (`npm run demo:setup`: Supabase real em
Docker — Postgres, GoTrue, PostgREST, Storage — e o app desta branch com
`ARANDU_ENV=demo`, semeado com a Vitta Foods por `scripts/demo/seed.mjs`).
Nenhum Supabase hospedado, segredo, deploy, migration, API ou workflow foi
tocado. Estados: **PASS**, **FAIL**, **NOT RUN**.

Nada aqui eleva maturidade além de M1 + validação local: a evidência é de
renderização local e E2E com API simulada; CI no HEAD da PR é o próximo passo
(M2). A Demo hospedada continua condicionada ao cutover (guideline §36.4).

## Método

1. `npm run check:all` e `npm run build` na base (PASS).
2. `npm run design:capture -- --label=before` contra a Demo local (46 capturas,
   desktop 1440 px e celular 390 px, overflow 0).
3. Varredura renderizada própria (Chromium) de 26 telas da empresa, as cinco abas
   das quatro solicitações semeadas e o portal do provedor, procurando UUID,
   timestamp ISO, `null`/`undefined`/`NaN` e enums em inglês no texto visível,
   overflow horizontal e erros de página.
4. Leitura das capturas e do código das views envolvidas.

## Defeitos comprovados e correções

| ID | Sev. | Jornada / quem | Problema observado (Demo local) | Correção | Teste de regressão |
| --- | --- | --- | --- | --- | --- |
| UX-D1 | P2 | Painel, busca (Ctrl+K) — comprador | Contrato de garantia (Atlas Bank, fiança locatícia) aparecia como **"guarantee"**: `productLabel(..., { short: true })` só conhecia crédito e adquirência e devolvia o código da categoria. Constitution §1.5/§35.6: enum na tela é bug. | `productLabel` cobre todas as categorias de contrato (`lib/finance/contract-terms.mjs`) e nunca devolve o código. | `painel e contratos contam os mesmos dias…` (falha no código anterior) |
| UX-D2 | P2 | Painel × Contratos — comprador | O mesmo contrato mostrava **85 dias** no Painel e **"vence em 84 dias"** em Contratos (idem 310/309 e 700/699). A página usava `days_to_end` da API, que arredonda `(fim − agora)` e perde um dia à tarde (UTC); o Painel conta dias de calendário. Rótulos contraditórios entre telas. | Contratos passa a contar pelo calendário de quem lê (`daysUntil(ends_on)`), a mesma conta do Painel; o Painel usa o mesmo texto ("vence em N dias") em vez de um número solto ao lado de "decidir até". | idem + `cartão do contrato: N dia(s)…` reescrito para enviar `days_to_end` errado de propósito |
| UX-D3 | P3 | Painel — comprador | Concorrência **em avaliação** aparecia com o prazo de resposta em vermelho ("há 3 dias"), sugerindo atraso; a coleta já estava encerrada. | Em avaliação, a linha diz "coleta encerrada", sem tom de urgência. | idem |
| UX-D4 | P3 | Painel, Contratos — comprador | Datas sem ano em marcos de outro ano ("janela abre 17 de mai" para 2028; legenda "Início 15 de set … Vencimento 14 de set" num contrato de dois anos). | `formatDate(..., { withYear: 'auto' })`: ano omitido só no ano corrente. | captura |
| UX-D5 | P2 | Comparação — comprador, aprovador | A versão 2 do Atlas Bank mudou **5 condições** (taxa 1,29% → 1,24%, spread, CET, tarifas, custo total), mas a matriz só mostrava isso com o filtro "Alterações de versão" ou abrindo "Origem e contexto" célula a célula. Cobertura de cada proposta (quantas condições comparáveis foram informadas) não aparecia. | Célula alterada marcada com sinal neutro de informação ("Alterado na v2 · antes: 1,29%") no desktop e no celular; cabeçalho com "N de M condições comparáveis informadas" e "N condições mudaram desde a v1". Consulta da versão anterior não carrega a marca. Nenhuma ordem, cor de "melhor" ou valor inferido. | `comparação: condição alterada…` (falha no código anterior) |
| UX-D6 | P3 | Comparação — comprador | Texto técnico na primeira leitura ("Recorte: até 500 propostas… 2.000 versões") e filtros sem rótulo visível. | Recorte e regras de leitura em "Como ler esta comparação" (sob demanda); rótulos visíveis "Mostrar" e "Detalhe". | idem |
| UX-D7 | P2 | Decisão — comprador (§36.2) | Quando o servidor recusava a decisão (409 `proposal_version_changed`), a tela recarregava e mostrava o formulário igual ao anterior: a pessoa não via o que tinha mudado e podia reenviar a outra versão no mesmo clique, sem nova confirmação explícita. | A aba Decisão mostra o alerta "A proposta de X mudou para a versão N enquanto você decidia. Nada foi registrado.", a lista campo a campo (antes → agora, da versão anterior que a API já devolve), mantém a proposta selecionada e **bloqueia** a nova tentativa até a pessoa marcar "Revisei as condições da versão N…". A escolha continua humana; nenhuma proposta é trocada automaticamente. | `decisão com versão alterada pelo provedor…` (falha no código anterior) |
| UX-D8 | P3 | Portal do provedor; próximo passo; seleção — todos | Resíduos da identidade antiga: gradiente lavanda no "Sua próxima ação" do provedor (§2 proíbe gradiente decorativo) e lavandas fora dos tokens em seleção de cartões, avisos não lidos, comentários visíveis ao provedor e contrato em foco. | Superfícies planas com tokens petróleo/informação. `check:design` agora recusa as lavandas antigas e qualquer gradiente fora da lista funcional (carregamento, listras da janela de renovação, barra fixa de envio). | `scripts/check-design-tokens.mjs` (mutação: gradiente e lavanda injetados → FAIL) |
| UX-D10 | P2 | Sair — todos (pendência apontada pela #196, AUTH-1) | `finance/src/shell.js` ignorava a resposta do logout: com `503 auth_logout_unconfirmed` (revogação global não confirmada pelo Auth) a pessoa ia ao login como se tivesse saído de tudo. | Resposta não `ok` ou falha de rede leva a `/login.html?saida=nao-confirmada`, que mostra um alerta com o que fazer (entrar e sair de novo; administrador encerra as sessões). Nenhuma mudança na API. | `sair: resposta 503…` (falha no código anterior) e `sair: resposta 200…` |
| UX-D9 | P3 | Painel — comprador | Seis cartões iguais de "Inteligência de valor" vinham antes de "Concorrências em andamento" (Constitution §1.3, trabalho antes de painel). | Ordem: precisa de você → processos em andamento → indicadores → atividade. | captura |

## Antes / depois (Demo canônica local, Chromium)

Capturas em `docs/evidence/claude-product-2026-10-15/` (rótulo "Demonstração —
dados fictícios da Vitta Foods"). As 46 capturas completas de
`design:capture` (`before`/`after`) ficam em `reports/design/` (não versionado).

| Tela | Antes | Depois |
| --- | --- | --- |
| Painel 1440 px | `dashboard-before.webp` | `dashboard-after.webp` |
| Contratos 1440 px | `contracts-before.webp` | `contracts-after.webp` |
| Comparação 1440 px | `comparison-before.webp` | `comparison-after.webp` |
| Comparação 390 px | — | `comparison-mobile-after.webp` |
| Portal do provedor 1440 px | `provider-before.webp` | `provider-after.webp` |

Checklist Constitution §15: hierarquia (trabalho antes de indicadores), alinhamento
(numerais tabulares mantidos), contraste (tokens AA medidos por `check:design`),
densidade (marca de versão em 11 px dentro da célula), overflow (0 em 1440 e 390 px
nas telas alteradas), estados (vazio/erro/sem permissão inalterados), teclado
(filtros com rótulo; checkbox de confirmação focado quando falta), celular
(marca de versão e cobertura no seletor de pares).

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm run check:all` (base e final) | PASS / PASS |
| `npm run build` | PASS |
| `npm run check:design` (com mutação negativa) | PASS; FAIL esperado com gradiente/lavanda injetados |
| E2E `npm run test:e2e` (21 specs) — Chromium desktop + Pixel 7 | PASS: 306 passed, 7 skipped por desenho; 3 falhas `ENOENT` de trace quando duas execuções locais dividiram `test-results/` passaram ao repetir isoladas (133/133 nas três specs) |
| E2E novos contra o código anterior (stash) | 3/3 FAIL, como esperado |
| `npm run test:e2e:demo` contra a Demo local | PASS: 5 + 1 skip (desktop) e 5 + 1 skip (celular), o mesmo perfil do CI de referência; o skip é o pool de visitantes, por desenho. Rodando os dois projetos seguidos logo após capturas, o celular bate no limite legítimo de requisições do app local ("Muitas tentativas"); com o app reiniciado entre projetos, ambos passam |
| `npm run design:capture` before/after | 46 + 46 capturas, overflow 0, sem tela de erro (a primeira tentativa do `after` pegou o limite de requisições em 2 telas do celular; repetida com o app reiniciado) |
| Firefox e WebKit | **NOT RUN** — só o Chromium 1194 está instalado no container; a versão do `@playwright/test` espera outro build e o projeto proíbe `playwright install` aqui. Rodam no job `presentation`/`validate` do CI. |
| `npm run test:database` | **NOT RUN** — sem SQL nesta PR |

## Dependências registradas para o backend (não implementadas aqui)

| Endpoint | Entrada | Esperado | Atual | Impacto | Sev. |
| --- | --- | --- | --- | --- | --- |
| `GET /api/finance/overview` → `contracts[].days_to_end` (`withRenewalWindow`, `lib/api/domains/finance.mjs`) | contrato com `ends_on` = hoje + 85 | 85 (dias de calendário, como `daysUntil` e as RPCs `ends_on - p_day`) | `Math.round((fim UTC − agora)/dia)`: 84 a partir das 12h UTC | Telas que usam o campo divergem do Painel e das oportunidades; a interface deixou de depender dele. Corrigir no domínio mantém consumidores externos coerentes. | P3 |
| Portal do provedor: `assignments[].history` | proposta com 2 versões | termos por versão (ou diff) para o provedor ver o que mudou entre as próprias versões | só `version`, `submitted_at`, `note`, `rfq_revision` | O provedor depende da nota livre para lembrar o que mudou; a tela não inventa o diff. | P3 |

## Observado e não alterado

- "Atividade recente" na Demo mostra os eventos do pós-contrato como "agora":
  o seed grava esses objetos com o horário real de propósito (são imutáveis e não
  são reposicionados, `scripts/demo/seed.mjs`). Reposicionar só os eventos criaria
  trilha incoerente com os objetos; fica como está.
- O Painel dispara muitas leituras; varreduras rápidas da Demo atingem o limite
  legítimo de requisições ("Muitas tentativas"). Não é defeito de UX em uso normal.
- Subagentes não foram usados: as correções tocavam a mesma folha de estilo e
  `shared.js`; dividir criaria conflito sem ganho.
