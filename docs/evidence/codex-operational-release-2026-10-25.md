# Operational release assurance — 25/10/2026

## Escopo e decisão

Candidato preservado: `db4901ce15bf83d077d6f9f689a7a1186ccc4f62`, reconciliado por fetch/API. Branch de correção: `codex/p0-release-final-oct29`, derivada desse SHA. O HEAD da PR não substitui o candidato aprovado; integração e escolha de novo SHA dependem de decisão humana.

Não foi iniciada stack canônica, seed, provisionamento, freeze ou ensaio de personas. Não foram repetidos smoke público/E2E/Plano C. Nenhuma alteração em UI, porta 5000, roteiro comercial, imagens, policies, autenticação, migrations, Docker/WSL ou hospedagem. A investigação da porta 5000 e a stack remota continuam com Claude Code.

Existe um defeito operacional reproduzível, corrigido nesta PR: readiness considerava todos os contêineres do host. Contêiner alheio reiniciando bloqueava uma Demo saudável; quatro contêineres alheios `Up` satisfaziam o item mesmo sem os quatro serviços Arandu. As sondas HTTP posteriores continuam independentes — esse falso positivo do item não prova que o resultado completo seria READY.

## Reprodução, correção e regressão

Avaliação anterior: `rows.length >= 4 && rows.every(line => /\bUp\b/.test(line))`.

| Snapshot sintético | Antes | Depois |
|---|---|---|
| db/auth/rest/storage do Arandu Up | PASS | PASS |
| Mesma Demo + worker alheio Restarting | FAIL incorreto | PASS |
| Quatro serviços alheios Up, nenhuma Demo | PASS incorreto | FAIL |
| Um serviço da Demo ausente, duplicado ou de outro nome | Não exigia identidade exata | FAIL |
| Demo restarting/unhealthy/health starting | Podia aceitar Up unhealthy | FAIL |
| Docker falha com stdout residual | FAIL | FAIL |

readiness.mjs agora solicita apenas o projeto Compose `arandu-pilot-local`; `demoContainerFacts` em station-lib.mjs exige uma ocorrência de cada nome db/auth/rest/storage esperado. Nenhum workload alheio é parado, reiniciado ou removido. As sondas de Auth, PostgREST, Storage e app permanecem obrigatórias. A orientação desse item deixa de sugerir setup e aponta diagnóstico/retomada sem apagar estado.

Testes de regressão integrados em `scripts/test-demo-station.mjs`, já executado por check:all. Usam snapshots, sem Docker real, seed ou login. Não se trata de prova Windows/WSL2.

Validação local observada:

- `node scripts/test-demo-station.mjs`: PASS, incluindo regressões e cenários hostis existentes de Node 22, WSL /mnt/c, npm Windows, CRLF, módulos nativos, alvo remoto, schema, pool, freeze e readiness antiga.
- `git diff --check`: PASS.
- `npm run build`: PASS.
- `npm run check:all`: BLOCKED neste executor por EROFS em `test-storage-recovery.mjs`, ao criar temporário em `/home/agent`. A execução ocorreu uma vez nesta alteração; não foi modificado o teste, HOME, timeout ou gate para ocultar a restrição. Resultados CI devem ser lidos no HEAD exato da PR.
- `station --fast --gate=host`: execução real, saída 20/BLOCKED por `psql` ausente. Node 24.19.0, Docker 28.4.0, Compose 2.40.3, navegador, dependências, módulos nativos e portas passaram no executor. Nenhum serviço iniciado, login ou seed executado; não confundir esse host com hardware do owner.

Rollback da correção: reverter o commit desta PR. Não há alteração de banco, dados, volume ou configuração; o rollback restaura a antiga falha do diagnóstico. Preservar SHA congelado já aprovado até decisão humana.

## Auditoria dos comandos existentes

Todos os caminhos são relativos à raiz do mesmo checkout. `.state` abaixo significa `scripts/pilot-local/.state`; não publicar seu conteúdo.

| Comando | Lê / pré-condição | Altera ou inicia | Erro, repetição e cotas |
|---|---|---|---|
| `station --fast --gate=host` | Git/lockfile/host, npm ls, módulos nativos, ferramentas, Docker, portas; sondas locais, certificado e SELECTs se banco existe | Não escreve relatório, não cria stack, não faz login/seed; inicia e encerra Chromium para testar executável | 0 requisitos OK, 20 BLOCKED, 30 UNSAFE. Não comprova SHA aprovado, recursos do filesystem do daemon nem browser Windows |
| `prepare-station --provision` | lockfile, browser, host gate, contêiner db e `.state/.env` | Pode npm ci/baixar Chromium; retoma stack existente. Só chama setup se db não existe E `.env` não existe; esse caminho cria estado/contêineres/migrations/seed. Completa ready até 4; readiness e relatório station | Não é diagnóstico somente leitura. db ausente com `.env` existente recusa. Pode retornar PREPARED antes do freeze. Não executar simultaneamente: não há lock global de preparação; pode competir por pool e processos |
| `freeze --station` | Git limpo, host/serviços/app/schema/CA, lockfile e identificação da máquina | Escreve somente `.state/freeze.json`; não cria stack nem escreve dado financeiro | Recusa hard blockers com 20. Em cloud não declara estação. Não substitui aprovação humana; ignora seed/pool para gravar freeze e depois exige readiness/station |
| `readiness --smoke` | Carrega env local; exige guard demo/local. Build/app, Docker, serviços, personas, seed, RFQs/contratos/tarefas/pool | Grava `reports/demo-readiness`; faz logins GoTrue e comparação POST somente de cálculo/leitura, além de GETs. Não semeia ou restaura | 0 ambos modos prontos, 1 pendência, 2 configuração recusada. Cria sessões/consome cotas: somente leitura financeira NÃO significa ausência de efeitos de autenticação |
| `station` | Tudo de fast + seed --check, readiness JSON do mesmo SHA/host/lockfile/árvore limpa/smoke, idade 0–120 min, freeze e marca demo | Escreve `reports/demo-station`; seed --check faz leituras autenticadas; não reseta | 0 READY, 10 PREPARED, 20 BLOCKED, 30 UNSAFE; conta seed exata 39/39, pool íntegro >=2. READY aceita somente modo leitura pronto; interativo é estado separado |
| `station --fast` | Mesmo coletor, sem seed --check | Relatórios station; sem logins de personas | Seed não observado mantém PREPARED mesmo com demais itens bons. Serve para triagem, nunca substitui station completo na liberação |
| `resume` | `.state/.env`/demo.env/CA e quatro contêineres existentes | docker start dos quatro; aguarda db healthy até 2 min; sobe gateway se necessário e app se health não responde; seed --check/list pool | Não cria contêineres nem apaga dados. Falha se falta contêiner. Consome leituras/cota; auth/rest podem precisar estabilizar após reboot. Não repetir em loop |
| `app` | `.state` válida e dist existente; backend já disponível | Encerra processos que casam com pilot-local/app-server.mjs e inicia app HTTPS com SHA capturado no startup; log/PID em `.state` | Uso exclusivo do operador: padrão de processo não é isolado por worktree. Não executar duas stacks. Não consome login/cota da API para health. Não builda nem semeia |

O shell usa set -euo pipefail. `prepare-station` tolera o exit da readiness para emitir o diagnóstico station final; isso não autoriza tratar readiness vermelha como aprovação. `resume` e `app` carregam configuração local no próprio processo: diagnóstico do terminal deve ocorrer antes. Nunca chamar `local.sh` sem subcomando, pois o default é setup.

## Limites da detecção e riscos

- O host gate existente já cobre Node major 24, deps/npm ls, resolução Windows em WSL, repositório /mnt, CRLF, binários nativos de outro OS, ferramentas, Docker/Compose, navegador e portas. Não foi criado um segundo preflight.
- Ele NÃO comprova que HEAD é o SHA aprovado: o operador confere isso antes da preparação. O freeze/readiness vinculam SHA observado; não há seleção automática de candidato.
- O gate mede disco livre do checkout e memória total do host, não espaço livre do filesystem real DockerRootDir nem memória disponível da VM. Não aceitar esses PASS como prova de capacidade do Docker Desktop. Antes de provisionar, conferir o armazenamento real do daemon e a VM no Desktop. O preflight do laboratório em `scripts/ci-demo/resources.mjs` usa pisos 6000 MiB disponíveis, 12 GiB workspace e Docker, ou 32 GiB Docker em vfs; não forçar driver ou caminho inacessível para fazê-lo passar.
- DockerRootDir pode viver na VM do Desktop e ser inacessível por df no Ubuntu. Isso é capacidade NOT_PROVEN, não corrupção do produto. O operador precisa conferir o disco da VM no Desktop e espaço livre correspondente, sem prune/remoção de volumes.
- O coletor não rejeita por si só contexto Docker remoto. Conferir endpoint/contexto ANTES de executar station/resume/prepare. Não operar contexto TCP/SSH/inesperado; não trocar automaticamente o contexto de outra stack.
- `station` não executa o navegador Windows. HTTPS Ubuntu/Chromium Linux aprovado não prova localhost forwarding, trust no Windows ou energia/suspensão.
- Algumas mensagens legadas ainda sugerem setup/reset. Não executá-las automaticamente: a autoridade operacional é OPERATOR_29-10.md e este handoff. Falha de rede, serviço ou cota não é evidência de cenário corrompido.
- Não tocar porta 5000 enquanto Claude investiga. Registrar saída sanitizada do item e aguardar diagnóstico; não encerrar processo alheio nem remapear porta por tentativa.
- Requisitos físicos ausentes impedem Plano B, não invalidam a visita M2 comprovada. P2: tornar todas as mensagens de recovery consistentes, reforçar serialização de comandos e detecção automatizada de capacidade Desktop/contextos, depois do evento se não aparecer falha material nova.

## Handoff físico — executar somente no Ubuntu/WSL2 definitivo

### 1. Diagnóstico sem alterar a Demo

Abra Docker Desktop no Windows; confirme Settings/Resources/WSL Integration para a distribuição Ubuntu. No Ubuntu, entre no clone Linux correto (fora de /mnt/c). Não use terminal de Production.

```bash
pwd
uname -r
command -v node npm docker psql openssl curl pgrep
node --version
git remote get-url origin
git rev-parse HEAD
git status --short
docker context show
docker context inspect --format '{{.Endpoints.docker.Host}}'
```

Pare se: não é WSL2/Ubuntu esperado, Node não é 24/Linux, node/npm apontam para /mnt ou exe, árvore está suja, clone/SHA errado, ferramentas faltam ou endpoint não é o socket Unix local esperado do Docker Desktop. Não apagar trabalho ou trocar contexto automaticamente.

Só depois de conferir o contexto local:

```bash
docker version
docker info --format 'driver={{.Driver}} root={{.DockerRootDir}} memory={{.MemTotal}}'
df -h .
bash scripts/demo/local.sh station --fast --gate=host
```

Esse gate não cria relatório nem reivindica workspace. Saída 20 significa corrigir os itens BLOCKED antes de preparar; dependências/browser ausentes são esperados em instalação nova. Saída 30: parar, corrigir terminal/alvo com o responsável; não prosseguir. Confirme espaço da VM Docker Desktop separadamente; df do checkout não basta. Nenhuma correção automática de portas, volumes ou variáveis faz parte deste diagnóstico.

### 2. Preparação — instala e pode criar estado

Owner deve aprovar explicitamente o SHA. Use o candidato inicial abaixo SOMENTE se ele continuar sendo o aprovado; se esta PR entrar no release, escolher o SHA integrado e repetir validações aplicáveis. Não rodar checkout/pull automaticamente depois do freeze.

```bash
ARANDU_APPROVED_SHA=db4901ce15bf83d077d6f9f689a7a1186ccc4f62
test "$(git rev-parse HEAD)" = "$ARANDU_APPROVED_SHA"
test -z "$(git status --porcelain)"
```

Se qualquer test falhar, pare. No terminal correto, ferramentas Ubuntu ausentes podem ser instaladas pelo operador: `sudo apt-get install -y postgresql-client openssl curl procps`. Node 24 deve ser instalado pelo nvm DENTRO do WSL, nunca copiar node_modules do Windows. Se todos os requisitos estiverem corrigidos, antes de freeze:

```bash
npm ci --include=optional
npx playwright install chromium
npm run check:all
npm run build
bash scripts/demo/local.sh station --fast --gate=host
bash scripts/demo/local.sh prepare-station --provision
```

Execute cada linha separadamente e pare em falha. `prepare-station` pode terminar PREPARED por falta de freeze/readiness vinculada, mas não ignore BLOCKED/UNSAFE. Se existe estado e falta db/container, parar e avaliar recuperação; não seguir mensagem de recriação sem autorização específica. Um operador/comando por vez. Nenhuma preparação física foi executada pelo Codex cloud.

### 3. Ensaio no workspace descartável

Depois da preparação, aguarde provisionamento terminar. Confira pool e siga o cartão operacional; não use demo-baseline no cenário-base.

```bash
npm run demo:local:workspaces -- list
ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
```

Só executar quando há capacidade e cota. O roteiro homologado consome um workspace e sete entradas; não fazer outra passada na mesma janela de dez minutos. Falha/429: parar, não reenviar escrita incerta nem trocar janela para contornar cota. Esta etapa é executada pelo operador, não repetida pelo Codex em paralelo ao Claude.

### 4. Reposição — cria apenas o necessário

```bash
npm run demo:local:workspaces -- list
```

Se exatamente um workspace foi consumido e os demais estão íntegros, repor um. Se o cenário real diferir, usar N = 4 menos ready observados; não provisionar quando N <= 0.

```bash
npm run demo:local:workspaces -- provision --count=1
npm run demo:local:workspaces -- list
```

Não rodar readiness durante provisionamento. Aguardar conclusão, preservar pool/base e respeitar a janela de logins antes da validação final.

### 5. Freeze — somente após aprovação explícita do SHA

Confirme o SHA aprovado, árvore limpa, ensaio concluído e pool reposto. Não congelar a branch desta PR sem integração/revisão humana.

```bash
test "$(git rev-parse HEAD)" = "$ARANDU_APPROVED_SHA"
test -z "$(git status --porcelain)"
bash scripts/demo/local.sh freeze --station
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station
```

Somente `station READY` (exit 0), no hardware definitivo, libera Plano B. PREPARED (10), BLOCKED (20) e UNSAFE (30) não liberam. Se readiness retorna 1 apenas por interativo indisponível, ler relatório: leitura PRONTO e station READY permitem apresentação só leitura; leitura não pronta impede Plano B. UNSAFE exige parar.

### 6. Navegador Windows

Abra uma janela anônima em `https://localhost:4443/login.html#demonstracao`. Confirme que o certificado é o local desta estação; aceite o aviso somente para esse localhost. Se o Windows não acessa mas os serviços Ubuntu passam:

```bash
curl --cacert scripts/pilot-local/.state/cert.pem https://localhost:4443/api/health
```

Se Ubuntu funciona e Windows não, conferir localhostForwarding em `%UserProfile%\.wslconfig` conforme cartão. Ajuste/reinício WSL só pelo operador e antes do evento, seguido de resume e nova prontidão; não expor portas na LAN. Certificado errado/expirado não autoriza desabilitar TLS nem recriar stack existente automaticamente.

### 7. Preservação e dia da apresentação

Após freeze: não instalar, checkout/pull, build, seed/reset ou alterar versões. Preservar `.state`, contêineres e pool; não compartilhar seus segredos. Computador na tomada, suspensão desativada, Docker Desktop ativo. Após reboot, se os mesmos contêineres/estado permanecem:

```bash
bash scripts/demo/local.sh resume
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station
```

Rodar T-60, antes da janela final. T-30: nenhuma suíte, readiness, station completo ou provisionamento; abrir a entrada, sem login ainda, conforme cartão. Em falha durante a reunião, `station --fast` é diagnóstico excepcional sem seed/logins, conforme seção Se algo falhar do cartão.

Guardar somente relatórios sanitizados station/readiness com SHA, SO/host, Node/Docker, seed, serviços, pool, CA pública válida, browser, modos, freeze e timestamp. Não enviar `.state`, chaves privadas, demo.env, tokens ou cookies. READ_MODE_READY e INTERACTIVE_MODE_READY são campos separados.

## Matriz de contingência do operador

| Situação | Ação segura | Condição para continuar / parar |
|---|---|---|
| Banco/contêiner ausente | station --fast e inventário somente leitura; resume apenas se contêineres existem | Não criar/resemear durante evento; Plano C se não recupera |
| Auth/PostgREST/API fora após reboot | Aguardar db healthy e seguir C3 do cartão; restart específico de rest somente pelo operador no cenário diagnosticado | Após duas tentativas sem êxito, parar jornada; sem reset |
| Só app caiu | `bash scripts/demo/local.sh app` com backend íntegro, operador exclusivo | Health/SHA devem voltar; se falha em 30 s, triagem/resume conforme cartão |
| Windows não abre localhost | curl Ubuntu com CA; conferir forwarding no Windows | Sem prova no Windows, Plano B não liberado; não abrir portas externas |
| 429 | Respeitar Retry-After na mesma sessão | Duas ocorrências seguidas: leitura se validada; não trocar IP/persona para bypass |
| Pool acabou | Usar sessão já aberta/Trocar persona dentro das cotas | Não provisionar durante reunião; sem sessão útil, Plano C |
| Interativo não pronto | Consultar modos do readiness | Leitura PRONTO + station READY permite apenas leitura; senão Plano C |
| Certificado falhou | Conferir CA/validade/localhost da mesma estação | Sem trust/validade comprovados, parar; não setup/reset como atalho |
| Computador reiniciou | Desktop ativo, resume, readiness e station antes da janela final | Sem contêineres/estado originais, Plano C |
| Domínio público fora | Plano B somente se já READY; Plano C offline já preparado em cópia isolada | Não construir/subir backend ao vivo. Visita offline/capturas sempre rotuladas |

Plano A exige M3 hospedado READY, ainda NOT_PROVEN. Plano B exige prova física. Plano C M2 público já PASS na rodada anterior e offline validado pelo Claude conforme informação do proprietário, sem nova execução nesta rodada.

## Pendências humanas e veredito

- RC permanece estável nas provas existentes; nenhuma regressão funcional demonstrada. Esta PR corrige um diagnóstico P0 local, não altera domínio financeiro.
- Procedimento é seguro sob as pré-condições acima; comandos de preparação não são preflight read-only. Não declarar instalação zero-decisão: contexto/capacidade Desktop e browser Windows ainda requerem observação física.
- Falta: owner aprovar SHA; executar fases no hardware definitivo; comprovar serviços, 39/39, pool, certificado, browser e station READY recente. Esta prova não pode ser produzida pelo executor cloud.
- Adiar M3/M5, investigação privada de Production/Vercel e melhorias genéricas. Não é necessário novo acesso Vercel para preparar o Plano B.
- Intervenção imediata do owner: executar somente a fase 1 no Ubuntu/WSL2 definitivo e preservar a saída sanitizada. Depois de corrigir host e aprovar SHA, prosseguir na sequência. Nenhuma destruição, freeze ou merge automático autorizado.
