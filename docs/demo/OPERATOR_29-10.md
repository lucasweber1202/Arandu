# Cartão do operador — apresentação de 29/10/2026 (Demo canônica local)

Para quem vai operar a estação, sem depender de quem desenvolve. O roteiro da
fala está em [`PRESENTATION_2026-10-29.md`](PRESENTATION_2026-10-29.md); aqui
ficam os comandos, as checagens e o que fazer quando algo falha. Tudo é o
produto real (`main`) em `ARANDU_ENV=demo` com Auth, API, RLS e Storage reais
em Docker e dados **fictícios** (Vitta Foods e instituições `*.example`).

## Qual plano vale hoje

| Plano | Vale quando | Se não vale |
| --- | --- | --- |
| **A — hospedado** | `node scripts/demo/hosted-parity.mjs --url=https://arandu-demo.vercel.app --sha=<SHA completo aprovado>` diz **READY** e o roteiro pela entrada pública foi ensaiado no domínio | use B |
| **B — estação local** | `bash scripts/demo/local.sh station` diz **READY** nesta máquina, hoje | use C |
| **C — sem demo ao vivo** | — | Apresente capturas **ditas como capturas**; não simule operação. A visita pública (`/demo/visita.html`, offline em `dist/` após `npm run build:demo`) já é rotulada como *Visita informativa* e identifica os Processos A–D |

Não troque de A para B no meio da reunião se B não foi preparado antes.

## O preflight da estação

```bash
bash scripts/demo/local.sh station        # ≈ 1 min; relatório em reports/demo-station/station.md
```

| Resultado | Quer dizer | Faça |
| --- | --- | --- |
| **READY** (saída 0) | Esta máquina foi declarada a estação, está no SHA congelado com a árvore limpa, todos os serviços, o seed, o pool, o navegador e o certificado passam e a prontidão tem menos de 2 h | Apresente pelo Plano B |
| **PREPARED** (10) | Tudo verde, mas falta provar a estação: sem congelamento, HEAD ≠ congelado, árvore suja, prontidão velha ou máquina efêmera | Siga a linha "→" de cada PREPARED. CI ou sessão remota **nunca** viram READY |
| **BLOCKED** (20) | Falta requisito (Node 24, Docker, serviço, porta, navegador, pool, seed) | Siga a linha "→" do item BLOCKED |
| **UNSAFE** (30) | O terminal ou o banco aponta para outro ambiente (`SUPABASE_URL` hospedado, `VERCEL_ENV`, banco sem marca de demo) | **Pare.** Abra um terminal novo; não rode reset nem seed |

## Capacidade medida (19/10, neste código)

Os limites são proteções reais do produto. **Não se contorna 429**: o roteiro cabe neles.

| Limite (código) | Valor | Consumo medido | Regra do operador |
| --- | --- | --- | --- |
| Entrada por persona, por rede (`auth-demo-login`) | 12 a cada 10 min | o roteiro completo faz **7** entradas (Juliana ×3, Helena, Meridian, Orbe, Carlos) | **Um** roteiro completo por janela de 10 min. Nada de ensaio nos 10 min antes da reunião |
| Logins por conta | 20 por hora | Juliana entra 3× por roteiro | Ensaios repetidos na mesma hora esgotam a conta |
| Chamadas à API por pessoa | 240 a cada 10 min (60 escritas) | roteiro completo da gestora: **77** chamadas, sem polling, sem chamada repetida (`node scripts/demo/requests.mjs`) | ≈ 3 passadas completas por pessoa em 10 min; recarregar uma tela custa 4–12 |
| Workspaces novos por rede | 4 por hora | cada janela anônima nova = 1 | Use **uma** janela e "Trocar persona" |
| Workspaces ativos ao mesmo tempo | 25 | — | Folga ampla para 1 estação |
| Provisionar o pool | — | **≈ 11 min por lote de 2** (medido: 636 s) | Provisione no D-1 e reponha logo depois do ensaio; nunca durante a reunião |

Interrompa o Modo interativo e siga em leitura se aparecer 429 duas vezes
seguidas, "A demonstração está cheia" ou qualquer escrita sem confirmação.

## D-3 — 26/10: congelar a versão

1. Escolha o SHA: o HEAD de `main` com os quatro gates obrigatórios verdes **nesse SHA exato** (GitHub → commit → checks).
2. Na máquina que vai à reunião (ou na que a substitui):

```bash
git fetch origin && git status --short          # vazio; se não, commit/stash — nunca apague trabalho
git checkout <SHA completo>
npm ci --include=optional
npx playwright install chromium                 # navegador da versão do lockfile
npm run check:all && npm run build              # código aprovado nesta máquina
bash scripts/demo/local.sh prepare-station --provision
# Retoma a stack existente; só cria se não houver estado. Nunca reseta.
# PREPARED pode ser esperado antes do freeze: leia os itens, não ignore BLOCKED/UNSAFE.
```

3. Ensaie uma vez no workspace descartável com o comando D-1 abaixo; reponha o consumido e aguarde o fim do provisionamento. Não rode `demo-baseline` no cenário-base.
4. Depois do ensaio aprovado, congele **na máquina definitiva**, no SHA escolhido e com a árvore limpa:

```bash
bash scripts/demo/local.sh freeze --station
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station
```

5. Guarde `reports/demo-station/station.md` e `reports/demo-readiness/readiness.md`. Só READY libera a estação; PREPARED em cloud não é aprovação.

Depois do freeze, qualquer `git checkout`, `pull` ou `npm install` faz o
preflight cair para PREPARED: é assim que uma troca acidental de código aparece.

## D-1 — 28/10: preparar e preservar a estação (≈ 1 h)

```bash
bash scripts/demo/local.sh resume                       # sobe o que parou, sem apagar nada; 39/39
npm run demo:local:workspaces -- list
# Complete apenas o que faltar para 4 prontos (N = 4 menos prontos; não execute se N <= 0):
# npm run demo:local:workspaces -- provision --count=N
# Ensaio completo pela entrada pública (consome 1 workspace e 7 das 12 entradas da janela):
ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
npm run demo:local:workspaces -- provision --count=1    # repõe o consumido
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station                      # esperado: READY
```

O ensaio grava num workspace de visitante, nunca no cenário-base.
**Não rode `npm run demo:down`** (apaga banco, pool e senha) nem
`npm run demo:setup` (re-semeia) depois disso. Deixe a máquina ligada e na
tomada, com suspensão desativada; o Docker precisa continuar rodando.

## D-0 — 29/10

T-60 min:

```bash
bash scripts/demo/local.sh resume       # se a máquina dormiu ou reiniciou
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station      # READY, senão siga a tabela do preflight
```

Confira em `reports/demo-readiness/readiness.md`:

1. Commit = SHA congelado e "Árvore sem alterações locais".
2. Contêineres, Auth, PostgREST, **Storage** e App: PASS.
3. Personas entram (Juliana, Helena, Patrícia e as demais).
4. Vitta Foods visível; RFQs e contratos presentes; **39/39** no seed.
5. **Modo leitura: PRONTO.**
6. **Modo interativo: PRONTO** — exige etapa da CFO pendente, Meridian ainda sem proposta, nenhuma tarefa de ensaio, **pool com ≥ 2 workspaces prontos e ≤ 2 entradas novas na última hora**.
7. "Sonda de prontidão da implantação hospedada" = AVISO é esperado na estação local (não é falha).

T-30 min:

8. Abra **uma** janela anônima em `https://localhost:4443/login.html#demonstracao` e aceite o certificado autoassinado.
9. A tela mostra "Conheça o Arandu por dentro" com as personas. **Não entre ainda** (entrar consome cota).
10. Nada de produção: os e-mails são `*.example`; a URL é `localhost`.
11. A partir daqui, **nenhum** teste, readiness, station ou provisionamento (consomem entradas, cota e banco).
12. Guarde `readiness.md` e `station.md` (sanitizados: sem senha, token nem cookie).

**Não rode a prontidão enquanto o pool está sendo provisionado**: os seeds dos
workspaces ocupam o banco e a leitura da Helena pode estourar o tempo (a linha
diz "a API não respondeu"). Rode de novo depois, **sem** reset.
Modo interativo NÃO PRONTO e leitura PRONTO, com station READY → apresente só o Modo leitura.
Station BLOCKED/UNSAFE ou leitura não pronta → Plano C; não ignore seed 38/39.

## Durante

- Janela 1 (anônima): entrada por persona, **Juliana Ramos** (gestão financeira).
- CFO, leitor e instituições: "Trocar persona" **na mesma janela**. Não abre workspace novo, mas cada troca é 1 das 12 entradas da janela de 10 min.
- Cada janela anônima nova = um visitante novo (workspace próprio, 1 das 4 da hora).
- Não recarregue telas em sequência; não repita cliques que gravam.
- Orçamentos medidos no código em 21/10 (`lib/api/domains/auth.mjs`, `lib/finance/demo-workspaces.mjs`): lista de personas 30/10 min por rede; entradas 12/10 min por rede; 20 logins por conta/h; 4 workspaces novos por hora por rede; 25 ativos. Ensaio automatizado que grava dados termina **antes** da janela final.

## Se algo falhar

Comece sempre por `bash scripts/demo/local.sh station --fast` **em outro
terminal** (só lê; ≈ 30 s; não consome entradas nem cota da API).

| Caso | Sinal | Diagnóstico seguro | Ação | Continua se | Interrompe se | Não faça |
| --- | --- | --- | --- | --- | --- | --- |
| A. Demo hospedada fora | `hosted-parity` ≠ READY | — | Plano B (esta estação), se `station` = READY | `station` READY | `station` ≠ READY → Plano C | Trocar de A para B no meio da reunião sem B preparado |
| B. Máquina reiniciou | Navegador: conexão recusada em :4443 | `station --fast`: serviços BLOCKED | `bash scripts/demo/local.sh resume` (13–25 s medidos) | resume termina em 39/39 | resume diz "contêiner ausente" | `npm run demo:setup` (re-semeia) ou `demo:down` |
| C3. `resume`/`prepare-station` falha com "503 Could not query the database for the schema cache" ou "Gateway HTTPS não respondeu" | Depois de o daemon Docker reiniciar, PostgREST e/ou Auth subiram antes do banco (22/10: Auth em reinício contínuo até o banco ficar `healthy`, depois sozinho) | `docker ps`: banco `healthy`, rest `Up` | `docker restart arandu-pilot-local-rest-1` e repita `resume` (22/10: 39/39 na segunda tentativa) | resume 39/39 | persiste após 2 tentativas → `station` e Plano C | `demo:setup`, `demo:reset` ou `demo:down` (apagam ou re-semeiam) |
| C. Docker parado | `station`: Docker Engine BLOCKED | Docker Desktop aberto? (WSL2: integração ligada) | Abra o Docker Desktop; depois `resume` | resume 39/39 | Docker não sobe em 2 min | Recriar contêineres |
| C2. Imagens Docker recusadas na preparação (D-3/D-1) | `demo:setup`/`prepare-station` param com "429 Too Many Requests" (Docker Hub) ou "Data limit exceeded" (ECR público) | Limite do registro, não do Arandu; medido em 19 e 22/10 em executor efêmero | Exporte as mesmas imagens oficiais por um espelho e repita: `export PILOT_LOCAL_DB_IMAGE=mirror.gcr.io/supabase/postgres:15.14.1.064 PILOT_LOCAL_AUTH_IMAGE=mirror.gcr.io/supabase/gotrue:v2.181.0 PILOT_LOCAL_REST_IMAGE=mirror.gcr.io/postgrest/postgrest:v12.2.9 PILOT_LOCAL_STORAGE_IMAGE=mirror.gcr.io/supabase/storage-api:v1.25.3` (22/10: 39/39 assim) | setup termina em 39/39 | nenhum registro responde → prepare em outra rede **antes** do D-1 | Trocar versão de imagem; preparar no dia (as imagens já devem estar no disco desde o D-3) |
| C2d. Docker sem espaço ao baixar/registrar camada | `no space left on device` no pull (observado nesta missão cloud, não em WSL2) | `docker system df`; confira o disco reservado ao Docker Desktop além do espaço do repositório | Corrigir capacidade do Docker antes do D-1; sem stack preparada, Plano C | imagens oficiais instaladas e preparação validada | capacidade não resolvida antes do evento | `docker system prune`, apagar volumes ou trocar driver como atalho; espaço livre no checkout não prova espaço no Docker |
| C4. Só o app caiu (Docker, banco, Auth e Storage de pé) | Navegador: conexão recusada em :4443; `station --fast`: só "App", "App canônico" e "SHA servido" BLOCKED (ECONNREFUSED) | Contêineres `Up`/`healthy` em `docker ps` | `bash scripts/demo/local.sh app` (22/10: 1 s, HTTP 200, **sem gastar cota da API**). Para parar o app, use `pgrep -f "pilot-local/app-serve[r].mjs"`: `app.pid` guarda o PID do invólucro, não o do servidor | `station --fast` volta a PASS | não sobe em 30 s → `resume` | `resume` como primeira ação (re-checa o seed e gasta a cota da Juliana) |
| C5. `resume` demora vários minutos ("limite de requisições da API atingido (Juliana Ramos); aguardando 30 s") | Uso intenso logo antes (ensaios, prontidão, auditoria) | É o limite real de 240 chamadas/10 min por pessoa, usado pela checagem do seed | Espere: termina sozinho (22/10: 487 s logo após dois ensaios) | 39/39 no fim | — | Interromper e repetir; desligar o limite |
| C6. Seed 38/39 "Tarefas com e sem responsável" depois de um ensaio | Um teste que grava no **cenário-base** (ex.: `demo-baseline`, atribuição de tarefas) foi interrompido por 429 e não desfez a própria escrita (22/10, laboratório) | `readiness`: Modo interativo NÃO PRONTO | Antes do freeze, só após decisão explícita de descartar os dados sintéticos locais identificados: `npm run demo:local:reset` (≈ 11–15 min; 22/10: 636 s, 39/39, pool preservado), seguido de novo ensaio e freeze. **No D-0: não resete**; leitura somente se validada pela prontidão e por station READY; caso contrário Plano C | 39/39 | reset falha → `station` e Plano C | Rodar `demo-baseline` na estação depois de outros ensaios na mesma janela de 10 min |
| D. Auth indisponível | Tela: "O serviço de contas está indisponível… Sua sessão foi mantida" (503) | `station --fast`: Auth/Banco | Espere; `resume` se o contêiner parou. A sessão volta sozinha (medido) | próxima tela carrega | 503 por mais de 2 min | Entrar de novo repetidamente (cada entrada gasta 1 de 12/10 min) |
| E. Pool sem workspace | "A demonstração está cheia" | `station`: Pool | Siga nas janelas já abertas (Trocar persona) | há janela aberta | nenhuma janela aberta → Modo leitura | Provisionar durante a reunião (≈ 11 min e ocupa o banco) |
| F. Rate limit | "Muitas requisições…" ou "Muitas entradas…" (429, com tempo) | É o limite real (240 chamadas/pessoa ou 12 entradas/rede em 10 min) | Espere o tempo da tela na mesma sessão; mostre a tela atual sem novas chamadas | a espera acaba | 429 duas vezes seguidas → Modo leitura | Reiniciar o app para zerar o limite; desligar a proteção |
| F2. Escolha de persona some do login | Login mostra "Muitas entradas em pouco tempo a partir desta rede. Tente de novo em N minutos" no lugar das personas | Limite da lista de personas: 30 consultas/10 min por rede (medido em 21/10 após ensaios seguidos) | Espere o tempo da tela; quem já está num workspace segue com "Trocar persona" | a espera acaba | sem janela aberta e sem tempo → Modo leitura | Recarregar o login em sequência; abrir janelas novas para "tentar de novo" |
| G. Documento não abre | Download falha | Link vale 60 s | Feche e clique no documento de novo (1 vez) | abre | falha de novo → siga sem o documento | Abrir o arquivo pelo Storage ou por outra conta |
| H. Navegador travado | Aba não responde | — | Feche só a aba e reabra na **mesma** janela anônima | volta ao workspace | janela fechada = visitante novo (1 de 4/h) | Abrir várias janelas novas |
| I. Escrita sem confirmação | "Não confirmamos…" / "O servidor não confirmou a operação" | A operação pode ter sido gravada | "Conferir com o servidor" ou recarregue e confira a lista | o registro aparece uma vez | duplicidade aparente → pare a escrita, Modo leitura | Repetir o clique |
| J. Interativo NÃO PRONTO, leitura PRONTO | `readiness`: Modo interativo NÃO PRONTO | A linha FAIL diz o motivo | Só com station READY, apresente leitura (painel, RFQs, comparação, contratos, tarefas); caso contrário Plano C | — | leitura também falha → Plano C | Escrever no cenário-base pelas contas de e-mail |

Nunca desligue rate limiting, RLS ou autorização para "destravar" a demo.
`station` = UNSAFE em qualquer momento: pare a operação ao vivo (Plano C).
Tabela completa de contingências: `PRESENTATION_2026-10-29.md`.

## Windows com WSL2 e Docker Desktop

Tudo roda **dentro do WSL2** (Ubuntu); o navegador do Windows abre `https://localhost:4443`.

1. No menu Iniciar do Windows, abra Docker Desktop e espere o Engine ficar ativo. Abra Ubuntu pelo menu Iniciar (ou `wsl -d Ubuntu` no PowerShell). Docker Desktop → Settings → Resources → WSL integration: ligado para a distribuição. Teste no WSL: `docker version` mostra Server.
2. Node 24 **do WSL** (nvm). `command -v node npm` não pode apontar para `/mnt/c/...`.
3. Clone **no disco Linux**: `cd ~ && git clone https://github.com/lucasweber1202/Arandu.git`. Nunca em `/mnt/c/...` (permissões dos segredos não valem e tudo fica lento).
4. Ferramentas: `sudo apt-get install -y postgresql-client openssl curl procps`.
5. `bash scripts/demo/local.sh prepare-station --provision` — o preflight já recusa os erros acima (repositório em `/mnt/c`, npm do Windows, CRLF, `node_modules` de outro sistema, ferramenta ausente).
6. Confirme o repositório no Ubuntu com `pwd`, `git remote get-url origin` e `git rev-parse HEAD`; deve ser este Arandu no SHA aprovado. No Windows, abra `https://localhost:4443/login.html#demonstracao` e aceite o certificado. Se não abrir e `station` disser App PASS, o encaminhamento de localhost do WSL pode estar desligado (`localhostForwarding=false` em `%UserProfile%\.wslconfig`). Confirme primeiro `curl --cacert scripts/pilot-local/.state/cert.pem https://localhost:4443/api/health` no Ubuntu. Se funciona só ali, corrija o encaminhamento antes do D-1; reiniciar WSL interrompe a stack e exige `resume` e nova prontidão. Não exponha portas na rede como atalho.
7. Suspensão do Windows para o WSL: desative a suspensão na tomada; depois de acordar, `bash scripts/demo/local.sh resume`.

Validado em Linux x64 (19/10). **Em Windows/WSL2 real ainda não foi provado**: rode o passo 5 na máquina da apresentação até o D-3.

## Contingência C sem rede externa

Prepare antes do D-1 em **outra cópia do SHA aprovado**, com dependências já
instaladas. Não substitua o `dist` da estação canônica congelada por um build
demonstrativo. Nessa cópia isolada:

```bash
npm ci --include=optional
npm run build:demo
PORT=4174 npm run serve:test
```

Abra `http://127.0.0.1:4174/demo/visita.html` no navegador da mesma máquina.
Mantenha o servidor local aberto; não depende de Vercel ou Supabase depois do
build. Isso é **visita informativa/capturas sintéticas**, sem Auth/persistência
financeira real, e não exige station READY. Não prometa funcionamento abrindo
HTML por `file://`. Se nem o servidor estático funcionar, abra as capturas
WebP de `demo/visita/` diretamente e identifique-as como capturas.
O preparo/ensaio em WSL2 e o acesso pelo navegador Windows continuam a ser
confirmados pelo operador; este procedimento não afirma teste físico realizado.

## Depois da apresentação

- Somente se o operador decidir descartar as alterações do cenário sintético local identificado, fora do evento: `npm run demo:local:reset` (≈ 15 min; só na Demo local).
- Encerrar de vez e apagar tudo: `npm run demo:down`.
- Nunca rode reset contra banco hospedado.
