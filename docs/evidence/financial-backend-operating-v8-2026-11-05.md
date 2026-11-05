# Backend operacional v8 — evidência da candidata

Base inicial main99104082; main8837d8fb (#328) reconciliada na branch
`codex/financial-backend-os-v8-20261104`. Este registro acompanha a candidata;
nunca atribui à candidata o CI da base nem a testes locais o estado hospedado.

## Valor e composição

As quatro jornadas usam os mesmos contratos, períodos de obrigação, documentos,
facilities, tarefas e eventos de renovação. Contract 360 passa a carregar seções
independentes; Portfolio filtra antes de calcular e fornece registros de origem;
obrigações preservam facts e revisão humana; renovação recupera a RFQ real,
inclusive em replay concorrente. Relationship reutiliza essas leituras em vez
de manter outra cópia do contexto. Não foram criadas tabelas de negócio.

O [handoff versionado](../FINANCIAL_BACKEND_V8_INTEROPERABILITY.md) define
requests, respostas, filtros, paginação, erros, limites, fontes e maturidade.
Novas views são security_invoker/security_barrier e somente leitura para
authenticated; mantêm RLS nas fontes, metadados privados sem Storage locators
e classificação no registry de governança. Escritas seguem RPCs existentes.
Owner membership não é certificação de elegibilidade completa; o comando repete
a autorização. Informação faltante não vira conformidade ou valor zero.

## Evidências locais e integração pendente

- `test-financial-operating-api.mjs`: fixtures HTTP exercitam páginas completas,
  empate/data nula, escopo/usuário/filtro no cursor, dados ausentes, falha de fonte,
  versões futuras, histórico documental e IDs iguais entre contextos. PASS_LOCAL.
- `financial-operating-context.sql`: quatro jornadas com RPCs e RLS reais em PG17.11,
  fontes/versões documentais, saldo mais recente/cronograma vigente, revisão com
  segregação de funções, replay de renovação, provedor/outsider e revogação de
  entidade. PASS_LOCAL nos três caminhos; suíte integral `npm run test:database`
  exit 0 em PG17.11, incluindo migration/índice/probes, rollback/reapply e
  concorrência. Canários finais: 8.442/12.950/13.386 checks, zero vazamentos.
  Inserts de Auth são fixtures SQL, não login HTTP.
- Recovery direcionado: deriva a reprodução histórica da posição da migration
  de reparo, preserva rollback/tamper e verifica dump/restore também após todas
  as migrations posteriores. PASS_LOCAL. Snapshot/baseline histórica imutável.
- Baseline financeira + sufixo novo e ensaio de upgrade interrompido/retomado até
  `financial-operating-context-1`: PASS_LOCAL, dados sintéticos preservados,
  canary e zero pendências. Não é restore de backup hospedado.
- `ci-demo/operating-journey.mjs`: nova prova obrigatória após a jornada anterior,
  seis atores sintéticos independentes, API/JWT para toda escrita de negócio,
  Auth real, upload/download de bytes, revisão, renovação concorrente e recusas.
  Sintaxe validada; execução da stack completa NOT_RUN neste executor. O limite
  de disco do Docker vfs não comporta o piso de recursos, portanto a prova fica
  a cargo da integração efêmera obrigatória do candidato.

Primeiro CI `42045660105`/HEAD `ee3eb2ae`: suíte de banco e recovery passaram;
seed/pool, releitura, quatro workspaces e E2E da Demo passaram. A jornada nova
confirmou Auth/membership/contrato/upload/download e falhou no agregado de
Portfolio porque parcelas não possuem id. Corrigido para paginação pela chave
facility/versão/data; fixture de 221 parcelas, projeções compiladas no PostgreSQL
real e a jornada HTTP agora cobrem duas versões e dois lotes. Registro de autoria
`recorded_by` também está classificado como dado pessoal no registro canônico
de parcelas e na projeção. O outro bloqueio foi a fixture de coordenação herdar
SITE_URL público no CI: URL local explícita e preflight com ambiente equivalente,
sem mudar a guarda. Revalidação completa do candidato corrigido ainda pendente.

Checks completos, builds regular/Demo, budgets/assets e catálogo E2E PASS_LOCAL:
2.125 casos listados em 33 arquivos, sem alegação de execução local dos browsers.
Suíte SQL integral PASS_LOCAL; o preflight barato do SHA final será repetido
antes do push. CI dos quatro contextos e
integração profunda ainda são obrigatórios no SHA candidato. Estado atual M1;
M2 da #327 não se transfere a este lote.

## P0 de tempo e economia

O run oficial #327 `41936120694` durou 26,65 min, com integração de ~26,3 min.
Perfis reais apontam baseline 611,26 s e pool 617,33–617,68 s, cada seed com uma
espera 429 de ~530–534 s em spend/reconcile. Os 83 writes por gestora excedem
a janela existente de 60/600 s. O novo DAG sobrepõe apenas as cinco histórias
já independentes; inicialização/allowlist precede visitantes e cron global só
executa após os cinco contextos preparados. Preserva cinco chamadas de cron,
205 checks (41 por seed), quotas, Retry-After e todos os gates posteriores.

Testes locais de coordenação/cleanup/recusa de alvo remoto e recibo incompleto
usam filhos sintéticos. A primeira execução real mediu seed+pool 1.232→629 s,
603 s a menos (-48,94%), 205 checks e requests app/Auth/REST equivalentes.
O run falhou depois; repetição corrigida, duração integral aprovada,
runner-minutes e metas de seed/pool <5 min ainda NOT_PROVEN.
[DAG e contrato](../CI_SEED_POOL_V8.md).

Benchmark de índices em `ops/performance/task-index-alternatives-2026-11-04.json`:
1k/10k/100k registros, tenants/entidades/RLS e quatro leitores; índice completo
e parcial comparados com CPU/leitura/WAL/escrita/manutenção. Ambos aumentaram
custo de escrita; parcial não beneficia done. Nenhum índice foi adotado. São
medianas locais de cinco amostras, não p95 nem promessa de latência hospedada.

O benchmark específico de portfólio revelou uma página ampla de ~11 s em
100k facilities/20 tenants. O plano ordenava 5.000 linhas autorizadas antes do
LIMIT; um índice isolado não elimina a barreira da view. Experimento de leitura
em duas etapas sob o mesmo JWT: página canônica + enriquecimento limitado,
~69+83 ms admin e ~170+141 ms com escopo de entidade, no mesmo laboratório.
Esses somatórios de medianas SQL não são latência HTTP nem distribuição p95.
O script versionado agora reproduz ambas as leituras para 1k/10k/100k.
Em 1k, a view custou ~49,98 ms e a soma das duas leituras ~178,51 ms;
há um roundtrip adicional e não há ganho universal para pequenos volumes.

O índice de facilities da candidata tem ~5,93 MB em 100k. Primeiro ensaio de
50 criações via RPC, com rollback: 66,38→70,75 ms em 1k; 107,70→127,66 ms em
10k; 154,10→102,52 ms em 100k (ruído/carga/ordem impedem interpretar a última
diferença como aceleração de escrita). WAL em 100k: 67.575→72.388 bytes;
vacuum/analyze ~335 ms. O custo existe e foi considerado para a candidata;
nenhum índice foi aplicado hospedado. O ensaio reproduzível final no código
`20e12838` concluiu os três tamanhos: em 100k, contexto na view 3.729,25 ms
versus soma das medianas de fonte/enriquecimento 85,18 ms admin; escopo restrito
4.800,57 versus 275,61 ms. São comparações do formato de leitura com o mesmo
índice presente em ambos, não ganho do índice isolado. As amostras de escrita
voltaram a variar com ordem/carga; WAL em 100k 59.676→69.351 bytes (~16,2% a mais)
e vacuum/analyze ~359 ms. Tempos de escrita menores não provam aceleração.
Planos/custos/buffers/amostras e comando reproduzível estão em
`ops/performance/financial-operating-context-2026-11-05.json`.
O índice é criado na transação de migration; execução hospedada continua
dependente de preservação e janela aprovada, sem alegação de DDL sem locks.
Filtro por produto e páginas de garantias mantêm a projeção antes da página e
não herdam o ganho. A API sinaliza mudança de autorização entre as duas leituras,
sem reutilizar permissões ou fabricar registros. Os índices de tarefas acima
continuam rejeitados; este índice atende outra consulta e tem evidência própria.

## Preservação e hospedagem

Releitura agregada de 05/11/2026, sem linhas de clientes:

| Origem | Tabelas públicas | Financeiras | Linhas públicas | Auth | Storage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilot offgpyysgdhfemjlchod | 71 | 33 | 14 | 0 | 0 |
| Legado igacnfjeuqhxcmfyepgj | 16 | 0 | 42 | 0 | 0 |

Ambos ACTIVE_HEALTHY/PG17.6. A Vercel aponta Demo/Pilot READY para main8837;
Production ERROR observado. READY de deploy não é M3 canônica. O executor não
recebeu secrets, runtime variables ou outbound identities de recovery. Não houve
export/reset/migration/alteração de secrets/configuração/cutover hospedados.

Pré-condições concretas continuam no
[handoff único de recovery](hosted-operations-2026-11-04.md#único-handoff-ao-proprietário):
conexão administrativa TLS, recipient e custódia age, destino durável aprovado,
autorização de export por origem/destino/SHA e restore independente do mesmo
backup. M3 permanece BLOCKED_EXTERNAL_PRECONDITION / NOT_PROVEN.

## Higiene GitHub já executada

Critérios e recibos estão em `ops/branch-hygiene/2026-11-04.json`: 27 branches
antigas sem commits exclusivos removidas após conferir proteção, PR, worktree,
dependências de deploy/alias e SHA anunciado pelo servidor. Inventário daquele
checkpoint: 229 → 202 heads. Divergentes, operacionais, protegidas e dependências
foram preservadas. Não houve force push, exclusão de tags, merge ou alteração
de ambiente. A contagem é do checkpoint, não promessa de contagem futura.

Recomendação administrativa: habilitar a exclusão automática de head branches
após merge em Settings → General → Pull Requests. Essa configuração não foi
alterada. O lote v8 só deve produzir uma PR consolidada após validação local;
sem merge automático e sem envio de mensagens para outras sessões.
