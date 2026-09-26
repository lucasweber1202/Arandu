# GitHub Actions — quota de minutos e retomada do CI

## Situação em 26/09/2026

A conta atingiu **2.000 / 2.000 minutos** do GitHub Actions. Novos jobs falham
sem executar nada:

| Run | Commit | Jobs | Duração | `runner_id` | Passos |
| --- | --- | --- | --- | --- | --- |
| [36274642464](https://github.com/lucasweber1202/Arandu/actions/runs/36274642464) | `4c2a933` (merge da #72) | `validate`, `database`, `deploy-boundaries`, `presentation` | 2–3 s cada | `0` | nenhum |

**Não é regressão de software.** O mesmo conteúdo (`c6b8b45`, head da #72) passou
nos quatro jobs no run [36257234207](https://github.com/lucasweber1202/Arandu/actions/runs/36257234207),
e o merge não alterou arquivos. A evidência local equivalente desta rodada está em
[`FINANCIAL_RELEASE_EVIDENCE_2026-09-26.md`](FINANCIAL_RELEASE_EVIDENCE_2026-09-26.md).

Nada foi alterado no workflow para contornar a quota: nenhum job removido, nenhum
navegador desligado, nenhum `|| true`, nenhum check obrigatório mudado.

## Quando a quota voltar (01/10/2026)

1. Abrir a PR desta rodada → **Checks** → **Re-run all jobs** (ou fazer um push
   qualquer na branch). Reexecutar, sem mudar nada:
   `validate`, `database`, `deploy-boundaries`, `presentation`.
2. Reexecutar também o run da `main` (`4c2a933`) para limpar o vermelho de quota.
3. Só mesclar com os quatro verdes.

## Onde os minutos foram consumidos

Amostra: os 100 runs mais recentes (25/09 17:29 → 26/09 21:56 UTC), de 709 no
total do repositório.

| Observação | Número |
| --- | --- |
| Runs em ~28 h | 100 (91 só em 25/09) |
| Runs **cancelados** por `cancel-in-progress` | **83** |
| Mediana entre dois pushes na mesma branch `work/*` | 12 s a 42 s |
| Runs de `push` e `pull_request` para o mesmo SHA | 0 (não há duplicação) |
| Custo de um run completo (cada job arredonda para cima) | ~16 min: `validate` 5, `presentation` 9, `database` 1, `deploy-boundaries` 1 |

Composição de um run completo (run 36257234207):

| Job | Duração | Maior parte |
| --- | --- | --- |
| `presentation` | 8 min 05 s | jornadas de apresentação e demo nos 5 motores (6 min 52 s); instalar navegadores (1 min) |
| `validate` | 4 min 02 s | E2E nos 5 motores (2 min 53 s); instalar navegadores (50 s) |
| `database` | 43 s | contêiner Postgres (15 s) + `apt-get install postgresql-client` (10 s) |
| `deploy-boundaries` | 29 s | builds de preview, produção e demo |

**Causa principal:** rajadas de pushes de commit a commit (agentes enviando cada
commit separadamente). Cada push inicia 4 jobs; o próximo push cancela o
anterior, mas cada job iniciado já cobra pelo menos 1 minuto. 83 cancelamentos
× 4 jobs ≈ 330 minutos cobrados em pouco mais de um dia, sem nenhum resultado
aproveitável.

## Recomendações (nenhuma aplicada nesta rodada)

Por ordem de ganho, sem reduzir cobertura:

1. **Push em lote.** Validar localmente e enviar uma vez por conjunto de commits
   (é o que esta rodada fez). Maior economia, zero mudança de cobertura.
2. **Cache dos navegadores do Playwright** (`~/.cache/ms-playwright`, chave pela
   versão do `@playwright/test`) em `validate` e `presentation`: ~1,5 min por run.
   Não aplicado porque não há como executar o workflow alterado antes de
   01/10 — mudar CI sem poder rodá-lo arrisca deixar a `main` vermelha na volta.
3. **Postgres client já presente na imagem** do runner (`psql` existe em
   `ubuntu-latest`): remover o `apt-get install` economiza ~10 s por run.
   Confirmar na primeira execução após a volta da quota antes de remover.
4. **Avaliar** (decisão do proprietário, reduz execução por push): rodar a
   matriz completa de 5 motores do job `presentation` só em PR marcada como
   pronta (`ready_for_review`) e na `main`, com Chromium em cada push. Só vale a
   pena se o item 1 não bastar.

Não recomendado: filtrar por caminho (`paths-ignore: docs/**`) — vários checks
de governança leem os documentos em `docs/`.
