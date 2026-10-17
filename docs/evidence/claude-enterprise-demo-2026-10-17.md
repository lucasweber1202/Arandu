# Evidência — jornadas enterprise e Demo interativa (Claude), 17/10/2026

Base: `main` @ `47e8f42` (#203–#210). Branch: a branch gerenciada da sessão, reiniciada dessa `main`.
Nenhum arquivo de `api/**`, `lib/api/**`, `lib/finance/**`, `scripts/ci-demo/**`, SQL, rollback, manifesto,
workflows, `ops/**`, `docs/openapi/**`, `docs/IMPLEMENTATION_MATRIX.md` ou `docs/evidence/codex-*`;
`package.json`/lock intactos. Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local, backend real em
Docker). **Demo hospedada não validada.**

## Escopo
Lote 1 (ensaio da jornada, correção do maior risco restante), Lote 2 (Modo 2 interativo com gravações
reais verificadas após recarregar), Lote 6 (roteiro e contingências). Lotes 3–5 auditados por ensaio;
correções só onde houve defeito demonstrável.

## Defeitos reproduzidos e corrigidos

| # | Sev. | Onde / persona | Antes (`main`) | Depois | Arquivos |
| --- | --- | --- | --- | --- | --- |
| E1 | P1 | Implantação → Detalhe (Juliana) — passo 9 do roteiro | "Origem: contrato `<uuid>` · decisão `<uuid>`", "atualizado `<ISO>`", "data de referência 2026-10-17", "template acquiring:v1"; responsável desconhecido como UUID. Composto no servidor (`lib/finance/implementation-presenter.mjs`); o roteiro precisava evitar abrir o detalhe | Camada de apresentação dos registros (`ledger.js`) converte, sem mudar o contrato: contrato → nome do contrato carregado ("contrato Lumina Pay · Adquirência · vence 16 de set de 2028"), decisão → "decisão registrada", membro → nome, desconhecido → "pessoa não identificada"/"registro vinculado", ISO → data/hora legível, `template x:vN` → "modelo de plano vN". Vale para todos os módulos de registros (implantação, covenants, performance, spend, valor, qualificação, tarifas, oportunidades, extrações) — linhas, células, títulos e seções | `finance/src/views/ledger.js` |
| E4 | P1 | Implantação → Detalhe no celular 390 px (Juliana) | rodapé com 9 ações transbordava à esquerda ("Atualizar: Integração", "Registrar impedimento", "Cancelar plano" cortados) e ocupava ~metade da tela | ações quebram na largura do painel; no celular ocupam linha inteira e o rodapé rola (máx. 38% da altura) | `finance/style.css` |
| E2 | P2 | Qualquer tela com membro sem nome | "Analista · 49dd" (prefixo do identificador) | papel sem fragmento de id | `finance/src/views/shared.js` |
| E3 | P2 | Convite de provedor na RFQ | tipo ausente caía no enum cru | "tipo não informado" | `finance/src/views/rfq.js` |

Regressão nova: `tests/e2e/finance-implementations.spec.js` — "detalhe composto no servidor não mostra
identificador nem instante ISO…" (contrato pelo nome, "decisão registrada", "pessoa não identificada", sem
UUID, sem data ISO, sem `template x:vN`). **FAIL na `main`** (mostra o UUID cru), PASS com a correção.
`tests/e2e/finance-implementations.spec.js` — "detalhe com muitas ações: nenhum botão do rodapé fica fora da
tela" (8 marcos pendentes + impedimento). **FAIL na `main` no Pixel 7**, PASS com a correção.

Capturas reais (Demo local, Juliana, plano da Lumina): `impl-{desktop,mobile}-{before,after}.webp`.
Antes: `Origem: contrato a93dcbdd-… · decisão 90b3deb7-… · template acquiring:v1`. Depois:
`Origem: contrato Lumina Pay · Adquirência · vence 16 de set de 2028 · decisão registrada · … · modelo de plano v1`;
sem UUID/ISO, overflow 0 em 1440 e 390 px.

## Modo 2 — gravações reais (`scripts/demo/interactive.mjs`)
Só roda contra a Demo local (recusa outra URL). Cada operação pela interface; só conta se reaparece após
recarregar. **Resultado no backend real (desktop 1440): 5/5 PASS** (`interactive-result.json`, capturas
`interactive-*.webp`); a Demo foi resetada em seguida (`demo:local:reset`, 38/38).

| Op. | Persona | Ação | Verificação após recarregar |
| --- | --- | --- | --- |
| I1 | Juliana (gestora) | criar tarefa com responsável Rafael | tarefa na lista com Rafael |
| I2 | Juliana | concluir a tarefa | aparece em "Concluídas" |
| I3 | Juliana | registrar impedimento no plano da Lumina | impedimento no detalhe + "Resolver: …" |
| I4 | Helena (CFO) | aprovar a etapa pendente da nova linha | pedido em "Concluídas" |
| I5 | Juliana | (efeito) Painel | "Registrar decisão: Capital de giro — nova linha…" em "Precisa de você" |

Provedor: o seed não tem concorrência com coleta aberta para instituição; a escrita do provedor não é
demonstrável sem mudar a narrativa. Portal mostrado em leitura (isolamento verificado no `demo-baseline`).

## Validação (HEAD final desta branch, Demo local)
| Verificação | Resultado |
| --- | --- |
| `npm ci --include=optional` (Node 24.22.0), `check:all`, `build`, `check:design`, `check:demo-parity`, `check:financial-surface`, `check:financial-navigation`, `git diff --check` | PASS |
| `test:e2e:list` | 930 casos |
| `test:e2e` — Chromium desktop + Pixel 7 | 375 passed, 7 skipped |
| `test:e2e:presentation` — Chromium desktop + Pixel 7 | 125 passed, 19 skipped |
| `test:e2e:demo` (backend real) | desktop 6 + 1 skip; celular 6 + 1 skip. Uma execução desktop logo após capturas falhou por limite legítimo de requisições; repetida depois da janela: 6/6 |
| `demo:local:reset` | 38/38 checagens (antes e depois do Modo 2) |
| `scripts/demo/interactive.mjs` | 5/5 operações persistidas e verificadas após recarregar |
| Firefox, WebKit, iPhone | **NOT_RUN** localmente (só Chromium 1194); gate `presentation` do CI cobre |
| `test:database` | NOT_RUN — sem SQL |
| `design:capture` completo | NOT_RUN — capturas dirigidas às telas alteradas (antes/depois reais) para não esgotar a cota da API |

## Frentes auditadas sem defeito novo demonstrável
Onboarding (leitor e empresa sem RFQ: #207), tarefas e paginação (#210), comparação (sem vencedor;
"O Arandu não recomenda instituições"), portal do provedor (isolamento no `demo-baseline`), contratos e
renovação (ensaio de 12 etapas da #210, repetido aqui pelo `demo-baseline`).

## Riscos para 29/10
- Demo hospedada sem validação (Codex/M3).
- Limite legítimo da API (120 req/10 min por pessoa; login 12/10 min por IP): ensaios em sequência
  esgotam a cota; o roteiro manda logar antes e evitar recarregas seguidas.
- Modo 2 exige `npm run demo:local:reset` (≈15 min) antes de nova apresentação.

## Integração com a #211 (Codex) durante a revisão

A `main` recebeu a #211 (`dfba223`), integrada nesta branch por merge sem conflito. Ela entrega os dois
handoffs desta frente: o presenter da implantação passou a compor a origem em texto ("contrato <título> ·
Decisão registrada em …") e `GET implementations`/`GET covenants` aceitam `contract_id`. Ajustes desta
branch ao contrato novo:

- Atalhos do contrato: "Implantação deste contrato" e "Covenants e obrigações deste contrato" enviam
  `contract_id` (antes: instituição/entidade com aviso de recorte amplo).
- Implantação/Covenants ganham o filtro "Contrato"; o bloco de origem diz "Filtro aplicado: este contrato"
  quando o filtro exato está ativo e volta a avisar sobre outros contratos quando a pessoa o remove.
- Filtro vindo de link para contrato fora da lista carregada não se perde em silêncio ("Contrato do link").
- A proteção de texto em `ledger.js` continua como defesa (sem efeito sobre texto já legível); a regressão
  agora simula diretamente uma resposta com identificador/ISO.
- Roteiro: passos 9–10 usam os novos atalhos; removidas as ressalvas "da mesma instituição".

Validação no HEAD integrado com a #211 (`0488906`): `check:all` PASS; `test:e2e` Chromium desktop + Pixel 7
377 passed / 7 skipped; `test:e2e:list` 935; `check:financial-surface`/`navigation` PASS;
`test:e2e:presentation` 125 passed / 19 skipped; `git diff --check` PASS. Demo recriada do zero
(`demo:down` + `demo:setup`, 38/38) depois que o daemon Docker do ambiente caiu (falha de infraestrutura:
login 503 `auth_unavailable` com Supabase fora; nenhuma relação com o código). Backend real com a API da
#211: `demo-baseline` desktop 6/6 + 1 skip, celular 6/6 + 1 skip; ensaio das 12 etapas 12/12
(`rehearsal-desktop-after-211.json`), incluindo implantação e covenants abertos por `contract_id`.
`scripts/demo/interactive.mjs` não foi reexecutado após a #211 (não usa os atalhos alterados; última
execução 5/5).

## Handoffs ao Codex (estado após a #211)
Os itens P2 (presenter) e P3 (`contract_id`) abaixo foram **entregues na #211** e consumidos aqui.

## Handoffs ao Codex
| Prior. | Endpoint / módulo | Esperado | Por quê |
| --- | --- | --- | --- |
| P2 | `lib/finance/implementation-presenter.mjs` | compor "Origem" com texto (título do contrato, "decisão registrada em …"), data legível e "Não informado" para responsável sem nome; `template_version` com rótulo | a interface agora protege a tela, mas a fonte deve ser legível para export/API pública |
| P3 | `GET implementations`, `GET covenants` | `contract_id` opcional | atalho do contrato hoje filtra por instituição/entidade (a tela declara) |
| P3 (Claude, próxima rodada) | `scripts/demo/dataset.mjs` | uma concorrência com coleta aberta para um provedor | permitiria demonstrar envio real de proposta no Modo 2 |

## Rollback
Reverter a PR (interface, testes, script de ensaio e documentos). Nenhum dado, contrato de API ou migration.
