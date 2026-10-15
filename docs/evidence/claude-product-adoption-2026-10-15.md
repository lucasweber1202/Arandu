# Evidência — adoção e ciclo de vida (Claude), 15/10/2026 — terceira rodada

Base: `main` @ `0aeb2e6c93bc0abbd1f4b4fc8ce91b62171fcaf5` (#198 e #199 integradas; ancestralidade de
`3ca0e23` em `origin/main` conferida com `git merge-base --is-ancestor`). Branch: a branch gerenciada da
sessão (`claude/wonderful-shannon-is91mw`), reiniciada a partir dessa `main` porque a PR anterior dela
(#199) já foi integrada — nenhum commit antigo foi reaproveitado. Checkout exclusivo do container; nenhuma
worktree, banco, porta ou diretório de capturas do Codex é compartilhado.

Nenhum arquivo de `api/**`, `lib/api/**`, outros `lib/finance/**`, SQL, workflows, `package.json`, matriz
ou topologia foi alterado. Estados: **PASS**, **FAIL**, **NOT RUN**. Maturidade: M1 + LOCAL_VALIDATED;
nada aqui é M3. Testes de persona automatizados **não** são pesquisa com usuários (§35.13).

## Priorização (§35.19)

| Persona / jornada | Obstáculo | Evidência | Dado real? | Decisão |
| --- | --- | --- | --- | --- |
| Instituição financeira — Jornada C (passos 8–10: versão enviada, histórico, nova versão) | O histórico do portal mostrava só "Versão N · data · nota". O provedor não via **as condições** que enviou em cada versão nem o que mudou entre elas; dependia da nota livre para lembrar. | Código anterior: `history` renderizado sem termos; E2E novo falha na base | Sim: a #198 passou a devolver `history[].terms` (snapshot imutável) e `rfq_revision` | **Implementado** |
| Gerente financeiro — Jornada A (primeiro valor) | Depois da primeira solicitação, "Primeiros passos" some; o cartão de contratos do Painel dizia "Contratos registrados **depois de uma decisão** aparecem aqui", sem ação — negava o caminho de registrar o contrato que a empresa já tem. | E2E novo falha na base | Sim: `contract-import` existe; o formulário já abre por `?acao=registrar-contrato` | **Implementado** |
| Gerente/controller — Jornada D (responsável da tarefa) | `fin_tasks` não tem responsável | Leitura da API e do SQL | **Não** | Não implementado: nenhum filtro "Minhas tarefas" fictício. Handoff abaixo. |

## Melhorias implementadas

| ID | Mudança | Regra respeitada | Regressão |
| --- | --- | --- | --- |
| AD-1 | Portal do provedor › "Histórico de versões": cada versão mostra revisão respondida, data de envio, nota, **o que mudou desde a versão anterior** (antes → depois, com unidade e indexador por extenso; ausência como "não informado") e "Condições desta versão" sob demanda, com "Não informado" para campo vazio. | Números vêm do snapshot do servidor (`history[].terms`); diferença calculada por `proposalChanges` do domínio (a mesma regra da comparação do comprador), sem segunda lógica financeira; nunca usa o rascunho atual; só versões da própria instituição. | `histórico do provedor: condições de cada versão enviada…` (FAIL na base, PASS depois) |
| AD-2 | Painel › "Contratos e renovações" vazio: texto correto e ação "Registrar contrato existente" que abre o formulário já existente. | Ação só para quem pode registrar (`create_rfq`); leitor não vê. Nenhum onboarding reconstruído. | `painel sem contrato: o cartão leva a registrar…` (FAIL na base) e `leitor não recebe o atalho…` (guarda de permissão) |

## Medidas reais de atrito (sintéticas, Chromium)

| Medida | Antes | Depois |
| --- | --- | --- |
| Provedor: condições de uma versão anterior visíveis no portal | 0 de N versões (inexistente na tela) | todas as versões enviadas, 1 clique por versão |
| Provedor: saber o que mudou entre v1 e v2 | só pela nota livre, quando escrita | lista campo a campo, 0 cliques |
| Gerente com ≥ 1 solicitação e nenhum contrato: caminho do Painel ao formulário de contrato existente | 2 cliques passando pelo menu (Contratos → Registrar contrato existente), sem pista no Painel | 1 clique no cartão (formulário aberto) |

Não há medição de produtividade com pessoas; nenhum percentual é declarado.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm run check:all` | PASS |
| `npm run build` | PASS |
| `test:e2e` (21 specs) — Chromium desktop + Pixel 7 | PASS: 327 passed, 7 skipped por desenho |
| Regressões novas contra o código da base (`git stash` de `finance/`) | 2/2 FAIL como esperado; a guarda de permissão do leitor passa nos dois |
| `git diff --check` | PASS |
| Firefox, WebKit, iPhone | **NOT RUN** — só o Chromium 1194 existe no container; `playwright install` é proibido. Rodam no CI. |
| `npm run test:database` | **NOT RUN** — sem SQL |

## Pendências para o Codex (backend)

| Origem | Esperado | Atual | Sev. |
| --- | --- | --- | --- |
| `fin_tasks`, `GET tasks`, `overview.tasks` | `assignee_id` + nome, por padrão o responsável do contrato/marco que gerou a tarefa | não existe; a interface não inventa responsável nem oferece filtro "Minhas tarefas" | P3 |
| `docs/supabase-financial-implementation.sql:126` | título com rótulo em português da etapa | grava a chave interna ("Implantação: go live") | P2 |
