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

1. PR do hardening final → **Checks** → **Re-run all jobs**. Reexecutar, sem
   mudar nada: `validate`, `database`, `deploy-boundaries`, `presentation`.
   Esse run também é a primeira validação das otimizações do workflow (abaixo).
2. Reexecutar o último run da `main` (a #73 foi mesclada sem CI hospedado).
3. Só mesclar com os quatro verdes. Firefox, WebKit e Safari móvel só rodam aí.

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

## Otimizações aplicadas em 27/09/2026 (sem reduzir cobertura)

| Otimização | Antes | Depois | Cobertura |
| --- | --- | --- | --- |
| Ordem dos jobs | 4 jobs começam juntos; um push novo cancela quando os jobs com navegador já estão rodando (≥ 4 min cobrados por run cancelado) | `validate` e `presentation` esperam o `deploy-boundaries` (~1 min) e rodam mesmo se ele falhar (`if: !cancelled()`). Push em rajada cancela com ~2 min cobrados (`database` + `deploy-boundaries`) | Nenhuma mudança: os 4 jobs continuam obrigatórios e completos |
| Navegadores do Playwright | Download a cada run nos 2 jobs com navegador | `actions/cache` v6.1.0 (SHA fixado) em `~/.cache/ms-playwright`, chave SO + versão do Playwright + hash do lockfile; `playwright install --with-deps chromium firefox webkit` roda sempre e só baixa o que faltar | Nenhuma: os 3 motores e os 5 projetos continuam, e `check:governance` falha se a instalação passar a ser pulada ou se um projeto sumir |
| Cliente PostgreSQL | `apt-get update && install postgresql-client` em todo run (~10 s) | Instala só se `psql` não existir; imprime a versão usada | Nenhuma |
| Cache do npm | Já existia (`setup-node` com `cache: npm` nos 3 jobs que instalam dependências; `database` não instala) | Mantido | — |
| Reuso de build entre jobs | Cada job compila o próprio bundle | **Não aplicado**: `validate` (produção), `presentation` (modo apresentação) e `deploy-boundaries` (preview, produção e demo) geram bundles diferentes de propósito; compartilhar misturaria fronteiras demo/produção | — |
| Política de push | Pushes commit a commit por agentes | `CONTRIBUTING.md` e `CLAUDE.md`: validar localmente e fazer um push por lote | — |

**Limites.** Nenhum mecanismo do Actions evita cobrar o job que já começou; o
ganho depende de o push seguinte chegar durante o `deploy-boundaries`. O
ganho do cache depende da velocidade de restauração em relação ao download, e
o primeiro run após 01/10 ainda baixa (cache vazio).

**Só mensurável a partir de 01/10/2026:** tempo e minutos por run com as
mudanças acima, taxa de acerto do cache, versão do `psql` da imagem. O primeiro
run também valida a própria otimização (sintaxe do workflow, `needs`/`if`,
chave do cache). Se ele falhar por causa dela, reverter o commit do workflow,
não enfraquecer os jobs.

## Recomendações ainda não aplicadas


Por ordem de ganho, sem reduzir cobertura:

1. **Push em lote** (agora documentado em `CONTRIBUTING.md` e `CLAUDE.md`): a
   maior economia, e depende de disciplina, não de configuração.
2. **Avaliar** (decisão do proprietário, reduz execução por push): rodar a
   matriz completa de 5 motores do job `presentation` só em PR marcada como
   pronta (`ready_for_review`) e na `main`, com Chromium em cada push. Só vale a
   pena se o item 1 não bastar.

Não recomendado: filtrar por caminho (`paths-ignore: docs/**`) — vários checks
de governança leem os documentos em `docs/`.
