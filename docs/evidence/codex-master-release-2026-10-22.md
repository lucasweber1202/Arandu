# Missão master — release e operação de 29/10

Observações de 22/10/2026, executor cloud Linux x64. Somente dados sintéticos.
Este relatório registra resultados por ambiente; não declara freeze definitivo.

## A. Repositório e prioridade

HEAD inicial de origin/main: **257ce1dee610f03e510a3f09e68291e4f03a3a16**.
Fetch confirmou a fotografia do owner. PRs #255, #256, #257, #258 e #259 estão
merged; ancestralidade dos HEADs #258 e #259 confirmada com git, não apenas
com o estado da API. Nenhuma PR aberta na reconciliação inicial.

Branch de trabalho: `docs/p0-oct29-operational-handoff`, criada da main atual
(nome inicial `codex/p0-oct29-final-stabilization`, renomeado porque só há docs).
Os dois worktrees anteriores foram preservados. Arquivos operacionais alterados:
`docs/demo/OPERATOR_29-10.md`, `docs/demo/PRESENTATION_2026-10-29.md`,
`docs/DEMO_PRESENTATION_2026-10-29.md` e `docs/IMPLEMENTATION_MATRIX.md`;
novos: este relatório e JSONs sanitizados em `docs/evidence/master-257ce1d/`.
Sem merge, deploy manual,
preview de branch, commit vazio ou rerun de CI remoto.

P0-A comprovado; P0-B exige intervenção física; P0-C main verde; P0-D visita
informativa disponível. P1 covenant adiado. P2 não implementado.

## B. CI e governança

SHA comum: `257ce1dee610f03e510a3f09e68291e4f03a3a16`.

| Gate | Resultado | Evidência |
| --- | --- | --- |
| database | SUCCESS | [job 120084915256](https://github.com/lucasweber1202/Arandu/actions/runs/39853310869/job/120084915256) |
| deploy-boundaries | SUCCESS | [job 120084915086](https://github.com/lucasweber1202/Arandu/actions/runs/39853310869/job/120084915086) |
| presentation | SUCCESS | [job 120086417426](https://github.com/lucasweber1202/Arandu/actions/runs/39853310869/job/120086417426) |
| validate | SUCCESS | [job 120086417453](https://github.com/lucasweber1202/Arandu/actions/runs/39853310869/job/120086417453) |
| merge-audit | SUCCESS | [job 120084916161](https://github.com/lucasweber1202/Arandu/actions/runs/39853310871/job/120084916161) |

Log do audit atual: PR #259, HEAD
`5ae24d8b49f6f8f935a371be96f15c60637e2490`, quatro gates success, base contida.
Não há risco pendente demonstrado pela execução histórica vermelha da #258:
a versão atual passou pelo mesmo auditor. Não foi reaberto o incidente nem
afirmada uma causa remota sem payload original. Nenhum gate foi alterado.
Dados sanitizados: [governance.json](master-257ce1d/governance.json).

A CI da main não é herdada pela PR documental. Seu próprio HEAD precisa dos
quatro gates antes de integração autorizada; merge mudará a identidade do
release e exigirá nova prova pública, mesmo sem mudança de UI.

## C. Demo pública e vereditos

URL: https://arandu-demo.vercel.app/. Prova iniciada em
**22/10/2026 22:06:23 UTC (19:06:23 BRT)**, duração 100,8 s.
SHA publicado integral igual à main acima; manifesto, health e inventário
concordam. Modalidade `informative-tour-with-browser-sandbox`, datasource
`synthetic-fixtures`, sem environment canônico hospedado.

**229 verificações PASS; 185 artefatos; 36 capturas novas.** As 13 etapas da
fonte são percorridas em 18 passos técnicos por viewport, desktop 1440×900 e
mobile 390×844. Acesso anônimo, Tab/Enter reais, reload de deep links,
lazy loading por scroll e decode, fontes, overflow e respostas do domínio
verificados. Sem erros JS/console relevantes, 404 inesperado ou escrita em
API financeira. Cinco rotas aposentadas permaneceram indisponíveis.
Chromium **156.0.8078.4**, Playwright **1.64.1** do lockfile, sem links para
outro binário. Hashes do lockfile e dos verificadores estão na prova.

[public-proof.json](master-257ce1d/public-proof.json) e
[tour-flow.json](master-257ce1d/tour-flow.json). Os bytes das 36 capturas
recém-renderizadas são idênticos às imagens já versionadas na evidência ef5;
os hashes foram comparados individualmente e o JSON aponta para esses mesmos
bytes, evitando duplicar cerca de 9 MiB. Isso não reutiliza o resultado do
smoke antigo: HTTP e navegador foram executados novamente no SHA atual.

O transporte é o relay de respostas reais da origem introduzido na #258:
hash antes da entrega ao browser, sem conteúdo sintético no verificador ou
fallback. Não é benchmark de rede. Mobile é emulação, não dispositivo físico.
As imagens da visita são capturas sintéticas canônicas e explicitamente
rotuladas, não prova de persistência/Auth/Storage hospedados. Sem claims de
economia, recomendação de instituição ou continuidade inventada entre os
Processos A–D. Nenhuma alteração estética foi necessária.

| Veredito independente | Resultado |
| --- | --- |
| PUBLIC_SHAREABLE | **GO / PASS**, visita M2 no SHA 257ce1d integral |
| LOCAL_STATION_READY | **STATION_NOT_VERIFIED**, preflight cloud BLOCKED |
| CANONICAL_HOSTED_M3 | **BLOCKED** |
| Leitura pública / capturas | **PRONTA como contingência informativa**, sem operação financeira |
| Leitura canônica local | **NOT_PROVEN nesta sessão e na estação física** |
| Interativo canônico local | **NOT_PROVEN nesta sessão e na estação física** |

### Contingência estática local efetivamente ensaiada

Build `build:demo` feito em cópia isolada do SHA aprovado, dependências do
mesmo lockfile, porta exclusiva 4174. A origem loopback serviu todos os assets
e as 13 etapas: HTTP_ARTIFACT, BROWSER_DESKTOP e BROWSER_MOBILE **PASS**, 229
verificações e 36 capturas, sem Vercel/Supabase ou chamada financeira.
[offline-proof.json](master-257ce1d/offline-proof.json) conserva os resultados.
A CLI encerra com **1 por desenho** em --local: PUBLIC_SHAREABLE continua
NOT_PROVEN, pois localhost não prova acesso público. Não foi convertido em
exit 0 ou claim de backend. Servidor encerrado após o teste. O cartão ensina
preparar essa contingência em cópia separada antes do D-1, sem substituir
o dist canônico ou depender de file://. Hardware/encaminhamento Windows ainda
precisam ser ensaiados pelo operador.

## D. Demo local: tentativa real e limite do laboratório

Ambiente **D — executor cloud efêmero**, não Windows/WSL2 do proprietário.
Node 24.19.0, npm 11.9.0; Docker 28.4.0 / Compose 2.40.3, driver vfs.
Chromium correto inicia. Memória observada 9 GiB; 3 CPUs disponíveis.
Docker local inspecionado explicitamente por socket; inicialmente sem
containers, volumes ou imagens. Não foram usados contextos remotos.

Faltava psql. Instalação no sistema não foi possível: usuário sem sudo e
apt sem permissão de escrita. Tentativa de baixar a imagem oficial fixada
`public.ecr.aws/supabase/postgres:15.14.1.064` falhou ao registrar camada:
**`failed to register layer: no space left on device`**. Downloads das imagens
oficiais Auth, PostgREST e Storage concluíram; nenhum container foi iniciado.
Espaço livre do checkout não prova capacidade suficiente do storage Docker.
Não houve troca de driver, prune global, exclusão de volumes, uso de banco
hospedado, adaptação do navegador ou resultado simulado para contornar isso.

`station --fast` realmente executado, exit **20 / BLOCKED**:
[station-cloud.json](master-257ce1d/station-cloud.json). Serviços/banco/pool
ausentes, seed não verificado por --fast; árvore documental em edição, sem
freeze e prontidão local ausente. Nenhum certificado ou credencial foi criado. As três imagens desta tentativa
foram removidas por nome exato ao encerrar; nenhum prune global ou volume foi tocado.
Seed 39/39, quatro workspaces, personas autenticadas, jornadas, Auth/RLS e
Storage reais: **NOT_RUN nesta sessão**. Teste SQL local integral: NOT_RUN.

O ensaio do Claude permanece histórico em
[claude-station-rehearsal-2026-10-22.md](claude-station-rehearsal-2026-10-22.md):
39/39 e jornadas no ef5, com desvio de Chromium declarado. Não o apresentamos
como execução deste SHA, browser atual ou estação definitiva. Sem freeze cloud.

## E. Engenharia, defeitos e testes

Defeitos operacionais confirmados pela leitura dos comandos reais:

- D-3 mandava `demo:setup` em sequência padrão, embora ele execute seed --reset,
  e congelava antes do ensaio. Agora prepara/retoma sem reset, ensaia em
  workspace descartável, repõe e então congela → readiness → station.
- Roteiro ainda indicava setup/reset como recuperação de indisponibilidade,
  abertura de várias janelas, provisionamento durante a sala e troca de
  persona para esperar 429. Agora segue o cartão: resume para estado existente,
  uma janela, reposição antecipada e espera legítima na mesma sessão.
  Leitura só com station READY e prontidão aprovada; seed 38/39 não pode ser
  dispensado porque o roteiro evita a tarefa alterada. Se bloquear, usar C.
- D-1 provisionava mais quatro mesmo com pool pronto. Agora lista e completa
  apenas a diferença, depois repõe o consumido. Windows/WSL2 ganhou entrada
  pelo terminal Ubuntu, identidade do repositório e diagnóstico de localhost.

Nenhum código/runtime/SQL/UI/dependência/configuração foi alterado. Não há
teste novo que apenas espelhe texto documental. Negativos existentes de station,
SHA, lockfile, pool, seed, relatórios incompatíveis, readiness e teclado foram
executados pelos gates; preservados sem bypass. Docker/recovery de partida
não foi modificado sem reprodução real, pois o laboratório não chegou a subir.

### Covenant: investigação e decisão de adiamento P1

`fin_obligation_add_period` em `docs/supabase-financial-covenants.sql:94` trava
a obrigação, reutiliza período existente por início e cria a tarefa sem
assignee. `fin_open_obligation` valida owner por tenant/entidade; obrigação é
imutável pelas APIs. `fin_run_obligations` cria períodos idempotentemente,
reconcilia status e notifica o owner autorizado da obrigação, com deduplicação.
A tarefa é atribuível separadamente, aceita responsável ausente e mantém
seu próprio histórico e autorização. O contrato posterior em
`docs/supabase-financial-task-accountability.sql:1` declara expressamente que
nenhuma origem herda automaticamente. O guard rejeita `assignee_source=inherited`
para todos os callers até existir sync source-specific; preserva decisões
manuais, inclusive desatribuição explícita, e limpa atribuição inválida por
revogação de membership/escopo com evento. Testes SQL existentes cobrem a
recusa de herança e preservação da atribuição humana; não foram executados
localmente aqui (database da main foi SUCCESS no CI).

Logo, owner da obrigação não é por contrato o executor automático da tarefa.
Copiar apenas `owner_id` na criação violaria a consistência de provenance;
marcar como manual forjaria uma decisão, e habilitar inherited exige contrato
novo e controles de origem. A sugestão do ensaio anterior não autoriza essa
mudança de domínio. O SQL confirma a criação sem assignee **e o bloqueio
intencional de herança**, não um defeito P0 a corrigir com um campo.

Não foi comprovada decisão financeira incorreta, perda de dados ou vazamento
por esse caso; é lacuna **P1 de orientação**, já explicada no roteiro.
**Adiada**, sem migration nem correção visual que esconda a ausência.
Pós-evento: definir herança inicial versus atribuição explícita; verificar
owner revogado/fora de entidade, organização bloqueada, concorrência e replay,
período já existente sem sobrescrever assignee, tarefas históricas/delegadas,
trilha e isolamento buyer/provider. Só então migration aditiva, rollback e
testes adversariais em banco descartável, sem backfill automático improvisado.

### Validação local e classificação

`npm ci --include=optional`, `check:all` (inclui security, governance,
routing, station/readiness e domínio), `build`, `check:build-size`,
`check:links` e `test-publication-keyboard.mjs`: PASS. Chromium real do lockfile
cobriu Tab/Enter, tabindex=-1, focus trap, lazy images e relay íntegro/bytes
adulterados/escrita financeira recusada. Negativos são testes de contrato,
não prova de backend hospedado.

Rodada financeira final, após build normal: **536 passed, 10 skipped, 0 failed**
em Chromium desktop e mobile-chrome. São E2E com APIs simuladas; incluem RFQ,
comparação, tarefas, contratos, Central, covenants, portal, documentos,
permissões e estados recuperáveis, não Auth/RLS/Storage reais.
Apresentação final: **136 passed, 20 skipped, 0 failed**, após o build próprio,
mesmos dois projetos Chromium. Essa suíte cobre visita pública/sandbox e
UX de apresentação, não jornada canônica real. As 30 ocorrências SKIPPED
nas duas suítes permanecem SKIPPED, sem conversão em PASS.

A primeira tentativa de apresentação recusou iniciar por porta 4173 ocupada.
Seu prebuild também havia substituído o dist da rodada financeira inicial;
os resultados dessa rodada foram descartados e ela foi interrompida. As
suítes finais rodam sequencialmente, cada uma após seu build apropriado e
com servidor exclusivo. Isso corrigiu o procedimento de verificação, sem
alterar produto, fixture ou assertion. Firefox/WebKit/mobile-safari locais:
NOT_RUN; CI verde da main é evidência remota separada.

Bundle: nenhuma mudança de produto; build normal 1.151.002 bytes, RFQ
245.884/250.000 (98%, aviso preexistente), maior CSS 103.329 bytes.
Sem pacote novo, nenhum claim de auditoria WCAG ou pesquisa humana.
Rollback: reverter a documentação; não há mudança de dados para desfazer.

## F. Roteiro e operação 26/28/29

Preservados os cinco atos de 12–15 minutos do
[roteiro existente](../demo/PRESENTATION_2026-10-29.md):

| Ato | Persona / caminho real | Mostrar / resultado / limite |
| --- | --- | --- |
| 1 · Primeiro valor, 3 min | Juliana → Painel → Instituições / Relacionamento Atlas | Contratos existentes, próximo prazo e tarefa; valor buyer-first sem adesão bancária. Distinguir owner da obrigação e assignee da tarefa |
| 2 · Solicitação e comparação, 4 min | Juliana → RFQ nova linha R$ 12 mi; depois adquirência → Comparação / Decisão | Cenários distintos, Atlas v2, informação ausente e decisão humana Lumina v2. Helena só leitura da pendência CFO |
| 3 · Continuidade, 3 min | Contratos Lumina / Atlas → Implantação / Covenants / Tarefas | 60 terminais bloqueados, evidência, waiver e renovação; ausência de dado não é conformidade. Não concluir tarefa no modo leitura |
| 4 · Instituição, 2 min | Trocar persona → Eduardo Atlas → /provider/index.html | Oportunidades e versões próprias, sem concorrentes/comparação da empresa |
| 5 · Fechamento, 1 min | Trocar persona → Juliana → Painel | Próximo trabalho e memória do relacionamento; sem ROI, banco recomendado ou integração inexistente |

Entrada local: `https://localhost:4443/login.html#demonstracao`, uma janela.
Gravações apenas em workspace sintético descartável, com modo interativo
validado; releitura confirma efeito. Para 12–15 min, preferir leitura.

[Cartão do operador](../demo/OPERATOR_29-10.md) é o handoff executável:
Windows Docker Desktop + integração WSL2, Ubuntu/Node24/npm Linux, repo fora
de /mnt/c, dependências, Chromium do lockfile, SHA limpo, preparação, seed,
pool, ensaio, freeze e readiness. Não copiar credenciais para chat ou slides.

- **26/10 (D-3):** escolher SHA main com quatro gates/audit e prova pública;
  preparar/ensaiar/repor; freeze --station → readiness --smoke → station.
- **28/10 (D-1):** resume se necessário; listar/completar pool para quatro;
  um lifecycle em workspace, repor um; readiness e station; sem upgrades.
- **29/10 (D-0):** até T-60 resume se necessário e provas; T-30 uma janela
  pronta, sem mais suítes/readiness/provisionamento. Só READY libera local.

Modos: **A hospedado não liberado**, **B local depende da estação READY**,
**C visita/capturas já disponível**. Falha de backend/máquina sem B validado
→ C, dizendo que são capturas; não fingir persistência. Cartão cobre Docker,
Postgres, Auth503, app, 429, Storage/documento expirado, sessão, pool, seed e
navegador. Reset nunca é sequência padrão e exige decisão de descarte local.

## G. Pendências humanas e bloqueios restritos

**Executado:** fetch/ancestralidade, PRs/checks/audit, status dos três projetos,
leitura Vercel (403), prova pública HTTP/browser, gates locais, tentativa de
laboratório, preflight cloud e revisão dos comandos/roteiro.

**Só proprietário/operador físico:** abrir Docker Desktop/Ubuntu na máquina
definitiva; escolher SHA aprovado em 26/10 e executar o cartão; ensaiar no
hardware/rede reais, guardar relatórios sanitizados e obter station READY;
nomear operador/substituto e aprovar roteiro/modo. Não existe acesso remoto
presumido a esse computador. Freeze físico ainda **não realizado**.

**Aprovação formal posterior:** acesso de leitura ao scope Vercel
lucas-projects467 ou logs sanitizados para diagnóstico Production. Os três
detalhes retornaram 403, apesar de Demo/Pilot success e Production failure nos
statuses GitHub. Causa inicial do build Production não foi reconfirmada;
atribuições ativas vazias são bloqueio local conhecido, não log remoto.
Preservação/custódia privada, export cifrado e restore do mesmo export,
Auth/Storage/configuração, classificação e decisão separada de cutover são
pré-condições de M3/M5. Nenhuma mutação hospedada autorizada/executada aqui.

**Deliberadamente adiado:** covenant P1; refinamento estético P2; Production,
conversão Pilot/legado, migrations hospedadas, novos tiers/backends, integrações
e billing. Segurança/RLS/rate limits/assignment e política main-only intactos.

## H. Próxima maturidade comercial, sem implementação antecipada

1. Compradores reais: observar primeiro valor, recorrência, alternativa atual,
   esforço líquido e disposição a pagar; ICP Gestão permanece hipótese.
2. Instituições: testar convite, resposta/recusa e retorno com benefício próprio,
   proveniência, identidade e isolamento; portal opcional ao comprador.
3. Central: validar utilidade contextual antes de ampliar; não duplicar fontes.
4. Propostas externas: autoria verdadeira, canal/documento/versão, conteúdo
   hostil, revisão e idempotência antes de adoção produtiva.
5. Demo M3: classificação/preservação/restore/cutover autorizado, atribuição
   própria e schema/Auth/RLS/Storage/revogação/canário/jornada observados.
6. Production: banco próprio, recovery, operação/suporte/rollback e release
   independente; não usar legado artístico como produção financeira.
7. Essencial/Gestão/Enterprise: uma plataforma, ofertas condicionadas a
   pesquisa e custo de servir; revisão jurídica/claims antes da venda.

Sem certificação, SLA, clientes validados ou maturidade M5/M6 inferidos.

HEAD final de origin/main na reconciliação pré-push: `257ce1dee610f03e510a3f09e68291e4f03a3a16`, igual ao inicial. O HEAD documental próprio será identificado na PR; este relatório não pode incorporar seu próprio hash sem alterá-lo. Resultado final dos checks próprios deve ser consultado na PR, separado da main comprovada acima.
