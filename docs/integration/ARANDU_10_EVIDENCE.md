# Arandu 10 — evidência local e limites

Base remota revalidada: `main@cd608cb4ce804b4ede88064230ef97948b7beb78`.
Implementação e contrato na branch `codex/arandu-10-engine`; coordenação na issue #345.
Nenhum Supabase hospedado, Vercel, workflow de publicação, secret, domínio ou plano
foi alterado. `finance/src/**`, `finance/style.css` e `tests/e2e/**` preservados.

## Resultados observados

| Verificação | Resultado |
|---|---|
| `npm ci --include=optional` | PASS, lockfile existente, cache temporário |
| `npm run check:all` | PASS, incluindo backend, segurança, SQL, governança, bundles e recuperação |
| `npm run build` | PASS |
| `npm run check:build-size` | PASS; aviso de capacidade de JS herdado, nenhum limite elevado |
| `npm run test:e2e:list` | PASS; 2445 casos/34 arquivos, listagem não é execução |
| `npm run check:perf-journeys` | PASS, sete jornadas Chromium dentro da baseline; tempos ruidosos não usados como claim de backend |
| `npm run test:database` | PASS, exit 0, PostgreSQL 17.12, três caminhos históricos, recuperação/baseline, upgrade, rollback/reapply e concorrência |
| `node scripts/test-arandu-10.mjs` | PASS, contratos novos, validação, cursor/filtros, read-only, comparação canônica e mudança durante leitura |
| `node scripts/test-finance-api.mjs` | PASS, compatibilidade e contexto de aprovação |
| Instalação limpa adicional por todo o manifesto | PASS, SQL novo antes/depois de rollback e duas reaplicações, concorrência e probes |
| Canário da instalação limpa adicional | PASS, 8 pessoas incluindo externa sintética, 738 verificações, zero vazamentos |
| HTTP/Auth/RLS real novo | PASS, 54 verificações, PostgreSQL + GoTrue + PostgREST reais |
| Navegador direcionado, três projetos | 227 PASS, 11 skips declarados pelos testes, 2 falhas intermitentes em Firefox sob carga |
| Reexecução isolada dos dois casos Firefox | 2 PASS, um worker, testes sem alteração |

A execução direcionada de navegador cobre decisões, aprovações, renovações,
Caixa de Trabalho, permissões de leitura e Passport em Chromium desktop,
Chrome mobile e Firefox desktop. A matriz completa de 2445 casos **não** é
declarada aprovada. WebKit/Safari não executaram: faltam `libgtk-4.so.1`,
`libgraphene-1.0.so.0`, `libharfbuzz-icu.so.0`, `libmanette-0.2.so.0`,
`libhyphen.so.0`, `libGLESv2.so.2`. Firefox precisou de escrita ao home e
`MOZ_DISABLE_CONTENT_SANDBOX=1` no container; nenhuma política da aplicação mudou.
As primeiras rodadas de navegador foram descartadas por interferência entre
processos/artefatos. O resultado acima usa servidor estático independente e
pasta de resultados exclusiva. As duas falhas da rodada válida foram timeout
no teste que percorre várias páginas e ausência transitória de uma linha de
renovação; ambas passaram isoladamente (3,9 s / 4,9 s).

O wrapper oficial `npm run ci:prepublish` deve rodar com árvore limpa e SHA fixo
após o commit deste registro. O resultado por SHA fica na descrição/checkpoint
da PR. Uma rodada anterior teve todas as etapas PASS, mas foi corretamente
**BLOCKED** por alteração de fonte durante a execução; não conta como PASS final.
Os quatro checks GitHub (`database`, `deploy-boundaries`, `validate`,
`presentation`) continuam obrigatórios e independentes de evidência local.

## O que os testes novos comprovam

- Cenários: CRUD, arquivo recuperável, definição sem ranking persistido,
  histórico/autoria, replay sem duplicar evento, conflito de payload e versão,
  duplicação preservando contexto, refresh explícito e isolamento de entidade.
- RPC direta/REST: viewer não escreve, instituição convidada não lê análise do
  comprador, outro tenant e conta anônima são recusados; escrita direta negada.
- Concorrência: duas edições disputam a mesma versão, oito criações com a mesma
  chave geram uma linha/evento, revogação durante espera de trava impede gravação.
- Aprovações: autoaprovação recusada, proposta retirada/substituída e RFQ alterada
  bloqueiam voto, aprovação atual aceita, contexto ausente não é current.
- HTTP real: instituição envia proposta v1, comprador salva/compara análise e
  pede revisão humana; instituição envia v2, aprovação e cenário tornam-se
  obsoletos; voto é recusado; retirada também aparece como fonte inelegível.
- Renovação: RFQ canônica recuperada por repetição; tarefas e RFQ vinculadas
  aparecem; estado canônico expired e responsável sem membership são incluídos.
- Work/readiness: páginas/filtros canônicos, cursor preso ao escopo, totais
  desconhecidos null, contagem somente da página, ações condicionadas ao papel.

## Reprodução

```bash
npm ci --include=optional
npm run check:all
npm run build
npm run check:build-size
npm run test:database
node scripts/test-arandu-10.mjs
# Stack canônica local; não usar URL ou credenciais hospedadas:
npm run pilot:local:up
bash scripts/pilot-local/arandu-10-journey.sh
```

A imagem PostgreSQL da stack Supabase completa excedeu o espaço disponível no
Docker deste executor. A alternativa observada usou `postgres:17` (17.12),
`supabase/gotrue:v2.181.0`, `postgrest/postgrest:v12.2.9`, gateway HTTPS e o
servidor real de `scripts/pilot-local/`. Aplicou todo o manifesto em banco
vazio, bootstrap local para as interfaces de Storage e funções auth.uid/auth.jwt
que leem os claims do PostgREST. GoTrue gerou usuários/sessões reais; a API usou
cookies reais e JWT do usuário. Service role só provisionou usuários sintéticos;
SQL administrativo só montou fixtures locais e simulou mudanças de contexto.
Asserts de produto passaram pela API/REST com o papel do usuário, sem service role.

Credenciais aleatórias e certificados ficaram em `.state` ignorado pelo Git.
A jornada recusa destinos fora de loopback. Na stack alternativa, `PILOT_DB_URL`
pode sobrescrever o endereço local padrão do wrapper de jornada.
Storage binário, e-mail externo e hospedagem **não** são comprovados por esta
jornada; ela não os utiliza. A suíte de banco inclui as verificações históricas
de autorização documental, mas isso não equivale a teste de Storage hospedado.

## Limites de produto e integração

- Frontend novo ainda deve integrar o contrato v1.2; nenhum teste afirma que
  Claude já consumiu endpoints novos ou que a integração visual foi concluída.
- Histórico é paginado; análise obsoleta exige refresh explícito. Limite de 500
  propostas/contexto e 1–3 cenários por comparação, sem análise parcial silenciosa.
- Enriquecimento de renovação tem teto de 500 por fonte/página, com cobertura
  explícita; filas não anunciam total da organização a partir de uma página.
- Aprovações na composição work não habilitam voto: carregar o endpoint de
  aprovações para etapas/atribuições completas. Banco reconfere no comando.
- Passport, seus snapshots e Relationship 360 existentes foram reutilizados;
  prontidão nova usa normalizeDemand. Proveniência declarada não prova documento,
  autenticidade, aceite ou verificação externa; lacunas continuam explícitas.
- Rollback retira entrada/consulta nova, preservando cenários, histórico, export
  e a guarda de integridade da aprovação. Reaplicação restaura a funcionalidade.
- Índice de aviso usa organização/data de aviso/ID e estados operáveis; índice de
  cenário segue organização/RFQ/estado/data/ID; histórico tem índice parcial por
  tipo. Não há benchmark de latência, SLA ou escala em produção nesta entrega.
