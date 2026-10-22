# Release assurance — apresentação de 29/10/2026

Base aprovada e relida por `git fetch origin`: `42dd92bbb99e807b6a342195fa31cbe94d760ef9`
(PR #255). Branch `codex/p0-release-proof-and-operational-readiness-20261029`.
O SHA final é o HEAD da PR que contém este relatório; um commit não contém o
próprio hash. Conferir os quatro gates nesse SHA, sem herdar os gates da base.
Observações em 22/10/2026, America/Sao_Paulo; JSONs preservam timestamps UTC.
Nenhum deploy manual, merge, alteração de configuração ou escrita hospedada.

## Vereditos independentes

| Frente | Resultado | Alcance |
| --- | --- | --- |
| P0-A publicação pública | **PASS / PUBLIC_SHAREABLE** | Domínio público no SHA aprovado, visita informativa e sandbox sintético; não é backend canônico |
| P0-B estação definitiva | **NOT_VERIFIED** | Classificador e negativos validados em laboratório; a stack local deste executor está BLOCKED, não foi provisionada; Windows/WSL2 do proprietário não observado |
| Production | **BLOCKED; causa remota não confirmada** | Status GitHub Vercel failure; logs 403. Bloqueio obrigatório de topologia reproduzido localmente |
| Demo canônica M3 | **BLOCKED** | Sem atribuição ativa; Pilot com schema antigo; preservação, restore e cutover não executados |

## Prova pública atual

Às **10:39:59 BRT** foi iniciada a prova contra
`https://arandu-demo.vercel.app/`, sem cookies ou login de plataforma. Duração
56,2 s. [JSON completo](release-assurance-2026-10-22/public-proof.json),
[jornada revisada](release-assurance-2026-10-22/tour-flow.json) e 34 capturas
reais estão no diretório adjacente. SHA servido integral igual à base aprovada;
manifesto e health concordam em main e synthetic-fixtures. Modalidade:
`informative-tour-with-browser-sandbox`; `canonical_hosted_m3: BLOCKED`.

203 verificações: inventário completo de bytes/hashes (inclusive chunks,
imagens, CSS, JavaScript e fontes), redirects/URL efetiva, rotas aposentadas,
health e 17 etapas por viewport. Chromium **156.0.8078.4**, Playwright
**1.64.1** do lockfile (hash no JSON), desktop 1440×900 e móvel 390×844.
Links alcançados por Tab e acionados por Enter, com reload dos deep links;
sem falha de JS/console, requisição inesperada, imagem/fonte quebrada ou
overflow de documento detectados. Toda requisição do navegador limitada a
GET/HEAD no mesmo domínio; chamadas de backend são recusadas nessa visita.

Capturas inspecionadas: [comparação desktop](release-assurance-2026-10-22/desktop-comparison.png)
e [proposta da instituição móvel](release-assurance-2026-10-22/mobile-provider-proposal.png).
Aviso visível informa dados fictícios e ausência de gravação/envio/execução.
O menu móvel usa rolagem horizontal; a prova não atesta WCAG, todas as rotas
canônicas autenticadas, ausência universal de dados privados, Safari ou
usabilidade com pessoas reais. Varredura de credenciais cobre padrões e valores
conhecidos dos artefatos, não uma certificação de privacidade.

Reprodução (SHA explícito; não usar o HEAD futuro como versão já publicada):

```sh
node scripts/public-tour-proof-flow.mjs 42dd92bbb99e807b6a342195fa31cbe94d760ef9 /tmp/arandu-flow.json
NODE_USE_ENV_PROXY=1 node scripts/smoke-public-demo.mjs --url=https://arandu-demo.vercel.app/ --sha=42dd92bbb99e807b6a342195fa31cbe94d760ef9 --browser --flow=/tmp/arandu-flow.json
```

`NODE_USE_ENV_PROXY=1` usa o proxy já configurado no executor Node 24; não
desativa TLS. Primeira tentativa sem esse suporte falhou em fetch, sem PASS.
O smoke agora registra `BROWSER_NOT_PROVEN` quando não existe prova completa
de navegador. HTTP isolado continua incapaz de produzir PUBLIC_SHAREABLE.

## Correções implementadas e regressões

1. Station compara SHA integral retornado pelo app ao checkout. `local.sh app`
   captura o SHA ao iniciar o processo; checkout posterior não renomeia o app
   que já está rodando. Runtime canônico e schema continuam obrigatórios.
2. Seed exige explicitamente **39/39**, com denominadores observados; 37/37 e
   mero `ok: true` não certificam o cenário. Nenhuma jornada/fixture foi alterada.
3. Station e readiness reutilizam a política canônica de pool para baseline,
   identidades/personas, usuários/organizações distintos, expiração e teto de
   25 claims ativos. Duas linhas ready não bastam. Consultas são limitadas e
   contagem exata da Data API impede falso positivo por truncamento.
4. Cota recente é lida separadamente com contagem exata, incluindo workspaces
   expirados. É um limite conservador global; não é medição do contador por IP
   nem reserva de vaga. Leitura e interatividade permanecem separadas: READY
   da estação certifica leitura; consultar o modo interativo antes de usá-lo.
5. Readiness JSON contraditório (FAIL/SKIP/status desconhecido nos detalhes,
   failed preenchido, modo duplicado ou seções ausentes) não certifica leitura.
   Relatórios precisam continuar ligados a SHA, host, lockfile, árvore e smoke.
6. Chromium precisa iniciar, além de existir no disco. Freeze/lockfile com
   hash ausente não é evidência válida. Efêmero continua sem declarar estação.
7. Prova pública usa Tab real; foco programático aceitava `tabindex=-1`.
   Novo teste Chromium recusa esse caso e focus trap; caminho acessível passa.
   Cada captura tem hash, URL efetiva, etapa e identidade de navegador/lockfile.
8. Teste negativo de recovery fixa chmod 0644 após criar sua fixture: umask
   0077 transformava a fixture em 0600 e invalidava a premissa do teste.
   A proteção de recovery não mudou; arquivo inseguro continua recusado.

Reprodução antes/depois: executar os testes novos de station contra o
`station-lib.mjs` de origin/main aceitou READY com app de outro SHA; com a
correção resulta BLOCKED. Testes cobrem ainda SHA/freeze divergentes, árvore
suja, banco/Storage indisponíveis, relatório velho/futuro/de outra máquina,
seed incompleto, pool incompatível/sem isolamento/cheio e ambiente errado.

## Production — quatro cenários, sem atribuição artificial

GitHub no SHA base: `Vercel – arandu-demo` e `Vercel – arandu-pilot` success;
`Vercel – arandu` failure, deployment `dpl_BPuFJFrG8vB4pot15mvqqiBakUxW`.
Os quatro gates da base e merge-audit success no run `39784457096` / audit
`39784457127`. Isso não prova estado READY detalhado pela API Vercel.
Listagem e events do deployment retornaram **403** no mesmo scope
`lucas-projects467`. Não foi usado outro scope. `BUILD_UTILS_SPAWN_1` é
informação anterior fornecida na missão, não reconfirmada pelos logs atuais.

| Cenário | Reprodução / resultado local | Conclusão / ação |
| --- | --- | --- |
| A — defeito de build | `npm run build` PASS; contratos de separação de deploy PASS | Nenhum defeito de bundling reproduzido. Não prova configuração nem causa da execução remota |
| B — configuração ausente/incompatível | `test-finance-env.mjs`: CLI real numa cópia descartável da topologia hipotética; positivo com configuração estrutural completa, negativos sem URL/anon/service/cron/site, branch errada, apresentação e chave trocada | Pré-requisitos estruturais exercitados com credenciais sintéticas, sem conexão. Configuração hospedada atual não lida |
| C — destino não autorizado | Mesma CLI com política operacional recusa refs desconhecidos, Pilot e legado; wrapper recusa antes do build | Confirmado: arrays Demo/Production vazios bloqueiam legitimamente. Preservar até recovery/classificação/cutover aprovados |
| D — evidência insuficiente | Conector Vercel list/events 403; sem conteúdo do log | Alta confiança no bloqueio de acesso; causa inicial remota indeterminada. Owner libera leitura no scope correto ou fornece log sanitizado desse deployment |

O positivo sintético de B altera só arquivo temporário removido ao final do
teste; não é bypass, build de Production READY, validação de chave ou M5.
`finance:env:check`, `vercel-build`, topologia e `check-production-env` não
foram enfraquecidos. Completar build técnico não satisfaz release M5:
ambiente próprio, recovery, monitoramento, operação e release continuam exigidos.

## M3 — reconciliação somente leitura e autorizações pendentes

Dois projetos Supabase listados ACTIVE_HEALTHY: Pilot e legado conhecidos.
Pilot: schema `financial-surface-hardening-1`, sem deployment_environment,
três migrations na história, 33 tabelas financeiras; zero tabelas públicas
sem RLS, zero policies Storage, zero usuários Auth e objetos, um bucket.
41 de **190** RPCs exigidas encontradas pelo nome; **149 ausentes**
([catálogo](release-assurance-2026-10-22/pilot-rpc-catalog.json)). Contagem por
nome não prova assinatura, body, grants, hook ou comportamento. Funções de
workspace/revogação e decisão v2 consultadas estão ausentes. Legado:
fin_settings ausente, zero tabelas financeiras/usuários Auth/objetos Storage;
nenhuma conclusão sobre ausência de dados relevantes em outras tabelas.

Manifesto atual: **74** arquivos cleanInstall, **73** existingDatabase,
**39 pendentes** após marker observado, até `financial-external-proposals-1`.
[Manifesto do bundle gerado, não aplicado](release-assurance-2026-10-22/pending-migrations.json).
SHA-256 `a1a8d8dac98ca36133de11e7a9b40cf07c2a8f6388633734c45205946d266ea3`.

| Capacidade | Código | Banco observado | Dependência | Risco | Verificação | Prova exigida | Autorização |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identidade/topologia | Demo/Production sem assignment | Pilot sem marker de ambiente; legado sem fin_settings | Classificação/preservação/conversão | Compartilhar banco errado | `node scripts/stage0-static-preflight.mjs --json` | Destino exclusivo e identidade do release | Decisão de conversão e PR de atribuição |
| Schema/RPCs | Bundle determinístico, marker atual | 39 deltas; 149 nomes exigidos ausentes | Recovery antes do rollout integral | App novo sobre schema antigo | `node scripts/build-supabase-migration-bundle.mjs --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stdout` | SQL efetivo, grants/hooks, upgrade e doctor | Aplicação hospedada separada, não autorizada |
| Auth/revogação/RLS | Guardas/testes existentes | Auth vazio; funções recentes ausentes | Schema e configuração autorizados | Sessão encerrada aceita em superfície não protegida | Catálogo SQL + doctor read-only | Tokens vivos/revogados e negativa cross-tenant na API/Data API | Jornada sintética e provisionamento em janela própria |
| Storage | Recovery binário/políticas esperadas | 1 bucket; 0 objetos/policies no Pilot | Rollout + configuração privada | Documento inacessível/exposto; backup só metadados | Catálogo Storage; `npm run recovery:doctor` | Upload/download privado, signed URL, restauração dos mesmos binários | Preservação/restore e ensaio autorizados |
| Visitantes/seed/pool | Seed 39/39 e guardas atuais | Sem funções de workspace consultadas | Schema final, Auth, seed autorizado | Mistura de visitantes ou admissão sem capacidade | `ARANDU_ENV=demo npm run release:candidate:doctor -- --json --expected-commit=<SHA>` | Personas, quota, capacidade e jornadas isoladas | Seed/provisionamento hospedados separados |
| Export/recovery/custódia | Preflight/testes locais existentes | Export/restore NOT_RUN nesta rodada | Origem/escopo/custódio/destino privado durável/janela | Perda de legado; backup incompleto | `npm run recovery:doctor`; `npm run pilot:backup:preflight` com configuração privada aprovada | Mesmo export cifrado, hashes, restore/reconciliação Auth/Storage/config | Aprovação específica de preservação e destino descartável |
| Demo canônica | Readiness/candidato fail-closed | Publicação ainda visita synthetic-fixtures | Todos os gates acima | Confundir visita com M3 | Doctor/live no alvo aprovado | Identidade, Auth/RLS/Storage, canário, recovery e E2E | Cutover posterior com rollback aprovado |
| Production M5 | Gate final independente | Legado preservado, sem assignment | Demo validada + infraestrutura própria | Claim de prontidão sem recuperação | `npm run release:check` no alvo autorizado | Operação, suporte, DR e release validado | Liberação de Production separada |

Os comandos com credenciais são instruções futuras, não execução nesta rodada.
Nenhuma migration, export, restore persistente, reset, seed, plano, projeto,
variável, promoção ou decommission hospedados executados.

## Gates, impacto e integração

Arquivos de código/teste modificados: `scripts/demo/local.sh`,
`scripts/demo/station.mjs`, `scripts/demo/station-lib.mjs`,
`scripts/demo/readiness.mjs`, `scripts/publication-proof.mjs`,
`scripts/smoke-public-demo.mjs`, `scripts/test-demo-station.mjs`,
`scripts/test-finance-env.mjs`, `scripts/test-publication-proof.mjs`,
`scripts/test-recovery-doctor.mjs`; novo `scripts/test-publication-keyboard.mjs`.
Documentação: este relatório, `docs/IMPLEMENTATION_MATRIX.md` e o diretório
`docs/evidence/release-assurance-2026-10-22/` com JSONs e capturas reais.

Executados: `npm ci --include=optional`, `check:all`, `build`, `check:security`,
`check:governance`, `check:vercel-routing`, `check:build-size`, testes de
station/publicação/ambiente/separação de release e Chromium de teclado.
Prova pública PASS. `bash -n local.sh`, syntax checks e `git diff --check` PASS.
O gate negativo de estação terminou BLOCKED corretamente, sem provisionar.
Banco local integral/Auth/Storage/seed e navegadores Firefox/WebKit **NOT_RUN**
neste executor. A validação de station desta PR é sintética; não é ensaio B.
CI do HEAD final deve ser registrado na PR antes da integração.

Sem mudança no bundle do produto, dependências, Vite, vercel.json, workflow,
SQL ou UI. Budget atual de RFQ: **245.860/250.000 bytes (98%)**, aviso
preexistente; nenhuma folga foi fabricada. Capturas acrescentam cerca de
4,6 MiB ao Git, fora da superfície dist. Prova pública só faz leituras;
readiness local continua consumindo login/leitura nas cotas documentadas.

`git.deploymentEnabled` preservado: main=true, docs/**=false, **=false;
verificador local confirma que esta branch não autoriza preview automático.
Um único push do lote; nenhum deploy manual ou merge. Um futuro merge em main
pode disparar até três builds; eliminar o Pilot só após substituição funcional,
inventário de consumidores e aprovação, sem interromper a Demo para economizar.

Rollback desta PR: reverter o commit de tooling/testes/documentação. Não há
rollback SQL ou de configuração hospedada. Reverter reabre a possibilidade de
READY com app antigo e a lacuna de prova de teclado; preferir corrigir adiante.

Integração Claude: nenhum arquivo reservado foi editado. Rebase/integração
normal pelo responsável, com quatro gates no SHA resultante. Regerar a jornada
se links/textos da visita mudarem; repetir HTTP/browser no domínio depois da
publicação aprovada. Na estação definitiva: reiniciar com `local.sh app`,
confirmar seed 39/39 e pool íntegro, readiness --smoke, freeze/estação no SHA
aprovado e árvore limpa. Não copiar este JSON de laboratório para a estação.

Riscos para 29/10: estação física e jornada canônica não verificadas aqui;
acesso Vercel 403; M3 depende de recovery/classificação e aprovação externa;
Production não comprovada; orçamento RFQ estreito. P0-A verificado agora não
é garantia de disponibilidade ou prova do SHA que vier a ser publicado depois.
