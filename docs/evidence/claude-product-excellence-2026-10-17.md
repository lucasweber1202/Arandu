# Evidência — product excellence e robustez da Demo de 29/10 (Claude), 17/10/2026

Base: `main` @ `e459f90` (#212–#216). Branch: a branch gerenciada da sessão, reiniciada dessa `main`.
Área exclusiva: `finance/**` (superfície atual), `tests/e2e/**`, `scripts/demo/readiness.mjs`, `docs/demo/**` e este
documento. **Nenhum** arquivo de `api/**`, `lib/api/**`, `lib/finance/**`, SQL/migrations/RLS/Auth/Storage,
`tests/database/**`, `lib/runtime-mode.mjs`, `lib/deployment-topology.mjs`, scripts Vercel/recovery, workflows,
`package.json`/lock, `docs/IMPLEMENTATION_MATRIX.md` ou arquivos do Codex.

## Estado por categoria

| Categoria | O quê |
| --- | --- |
| IMPLEMENTED | as 6 correções abaixo, preflight evoluído, roteiro com recuperação por operação |
| LOCAL_VALIDATED | regressões (7 FAIL na `main`, PASS aqui); `check:all`, `build`, design/parity/surface/navigation, `git diff --check`; `test:e2e` 425 passed + 7 skipped (antes da atualização do teste de valor; depois, 10/10 no arquivo); `test:e2e:presentation` 125 passed + 19 skipped (Chromium desktop + Pixel 7); Demo local com backend real: preflight PRONTO/PRONTO, Modo 2 9/9, preflight detecta Demo usada, reset 39/39, `test:e2e:demo` desktop 6 + 1 skip e celular 6 + 1 skip |
| CI_VALIDATED | quatro gates no HEAD da PR — ver PR |
| HOSTED_VALIDATED | **nenhum**. Demo hospedada não validada |
| BLOCKED | nada bloqueia esta PR; handoffs abaixo |
| NOT_RUN | Firefox, WebKit e iPhone localmente (só Chromium; o gate `presentation` cobre); `test:database` (sem SQL) |

## Defeitos reproduzidos e corrigidos

| # | Prior. | Onde / persona | Antes (`main`) | Depois | Regressão |
| --- | --- | --- | --- | --- | --- |
| P1 | **P0** | Qualquer tela da empresa quando `members` falha | Falha virava lista vazia: a pessoa aparecia **sem papel** (controles de gestão somem, avisos de "seu papel não permite") — falsa falta de permissão | A tela diz que não carregou, com repetição; nada de papel inventado | `finance-procurement`: "membros que não carregam…" |
| P2 | **P0** | Solicitação → Aprovações, ao escolher a proposta | Prévia da policy com falha (5xx/rede) caía no modo "aprovadores em ordem": o pedido podia sair **sem as etapas da policy** | Erro no formulário, "Tentar novamente"; envio recusado localmente ("nada foi enviado") até a policy ser conferida. 404 (ambiente sem policies) mantém o modo legado | `finance-policy`: "prévia da policy que falha…" |
| P3 | **P0** | Aprovar/devolver/rejeitar — aprovador cujo acesso foi revogado (contrato #215: `forbidden` na escrita) | Toast de erro e **botões reabertos**, convidando a repetir uma ação que nunca vai passar (captura `approval-revoked-before.png`) | "Você não pode mais decidir este pedido… Nada foi registrado." + Recarregar; botões removidos (`approval-revoked-after*.png`) | `finance-policy`: "aprovador que perdeu o acesso…" |
| P4 | **P0** | Aprovar sem resposta do servidor (rede/5xx) | Botões reabertos: voto às cegas | "Não confirmamos se a sua decisão foi registrada" + "Conferir o pedido" | `finance-policy`: "voto sem resposta…" |
| P5 | **P0** | Formulários de registro (implantação, covenants, valor, tarifas, performance…: `formDrawer`) e pedido de aprovação, com resposta incerta | "Registrar" voltava ativo; sem chave idempotente, um segundo clique podia **duplicar** impedimento/aceite/estimativa | Botão trava em "Confira antes de repetir"; dados ficam visíveis; "Fechar e conferir a lista" relê a lista; recusa explícita (4xx) continua editável | `finance-implementations` (2), `finance-policy` ("pedido de aprovação sem resposta…"), `finance-value` (expectativa antiga atualizada ao contrato novo) |
| P6 | P1 | Sessão expirada em formulários com erro em linha (registros, pedido de aprovação) | Só a mensagem, sem caminho | Link "Entrar em outra aba" (o formulário continua preenchido); 401 é recusa explícita → "nada foi registrado" é verdade; perda de comunicação continua "não confirmamos" | `finance-policy` |
| PF | P0 (Demo) | Preflight com Supabase fora do ar | Sugeria `npm run demo:local:reset` ("Modo interativo já usado") e mostrava "HTTP undefined" | Para no primeiro bloqueio: demais checagens NÃO EXECUTADAS, causa = serviço fora; "não é caso de reset" | execução real (Supabase parado) |
| PS | P0 (Demo) | Smoke do preflight, provedores | `assignments` sem `organization_id` → 400 após #215 | Lê a organização provedora primeiro; checa `buyer_name` (AVISO se schema antigo) | execução real |

Cobertura nova que já passava na `main`: `buyer_name` longo em 320 px sem rolagem horizontal e uma vez por cartão;
recusa 4xx no formulário de registro continua editável.

## Preflight (`bash scripts/demo/local.sh readiness --smoke`)

Acrescentado: Storage, Orbe já respondeu (base da comparação parcial), Meridian ainda apta (convite ativo e coleta
aberta), `buyer_name` no portal, curto-circuito com serviço essencial fora. Resultados reais:
`claude-product-excellence-2026-10-17/readiness-fresh.md` (Demo recém-montada: **leitura PRONTO, interativo PRONTO**)
e `readiness-after-modo2.md` (depois do Modo 2: seed 36/39, Meridian já enviou, CFO já aprovou → **NÃO PRONTO**, aponta
reset). Supabase parado: "Demais checagens — não executadas: serviço essencial fora do ar…".

## Persistência (Modo 2, backend real)

`scripts/demo/interactive.mjs`, build desta branch, Demo recém-montada: **9/9 operações persistidas e verificadas após
recarregar** (`interactive-result.json`). Em seguida, `npm run demo:local:reset` explícito.

## Requisições

Sem mudança de volume nesta rodada (medição da #216: 77 na jornada da gestora, sem repetidas nem polling). As correções
P3–P5 **reduzem** chamadas em falha: nada é reenviado às cegas.

## Roteiro

`docs/demo/PRESENTATION_2026-10-29.md`: tabela "Se uma operação do Modo 2 falhar" (persistiu? seguro repetir? o que
fazer, por operação), mapa dos 20 pontos do ciclo para os passos existentes (a estrutura de 16 etapas foi mantida) e
plano B para falha de login, backend indisponível e navegador.

## Handoffs ao Codex

| ID | Prior. | Persona / tela | Endpoint | Atual | Necessário | Teste |
| --- | --- | --- | --- | --- | --- | --- |
| H-5 | P2 | Gestora — registros de implantação, covenants, valor | `POST implementations/*`, `covenants/*`, `value` | sem chave idempotente: resultado incerto exige conferência manual | `idempotency_key` opcional (como em tarefas), devolvendo o registro existente na repetição | `finance-implementations`: "registro sem resposta…" |
| H-6 | P3 | Aprovador | `POST approvals/act` | voto incerto não é reconciliável pela resposta | (opcional) chave idempotente ou leitura do voto do próprio usuário | `finance-policy`: "voto sem resposta…" |
| H-4 | P2 | Todas | 429 | sem `Retry-After`/`code` (inalterado) | idem #216 | — |

## Riscos e restrições

- Demo hospedada não validada; nada aqui prova Preview/Production.
- Falha de `members` agora bloqueia a tela da empresa (antes degradava em silêncio). Se `members` cair, a pessoa vê o
  erro e repete — escolha deliberada para não mostrar permissões falsas.
- Cota legítima da API: prontidão, reset e ensaio separados por ~10 min.

## O que ainda falta

Firefox/WebKit/iPhone locais; validação hospedada (Codex/M3); H-5/H-6 para eliminar a conferência manual.

## Rollback

Reverter a PR (interface, testes, preflight e documentos). Nenhum contrato de API, dado ou migration.
