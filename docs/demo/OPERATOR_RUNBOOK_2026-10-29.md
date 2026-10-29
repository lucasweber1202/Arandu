# Runbook do operador — dia 29/10/2026

Cartão de bolso do dia. Os procedimentos completos, com tabela de diagnóstico,
continuam em [OPERATOR_29-10.md](OPERATOR_29-10.md) (fonte canônica); este
arquivo só ordena o dia e acrescenta as contingências pedidas para a sala.
Nada aqui instala ferramenta, baixa imagem ou altera código durante a
apresentação.

## 1. Preparação no computador definitivo (o mais cedo possível; não na última hora)

Pré-requisitos (WSL2 + Docker Desktop ou Linux): Node 24 (`nvm use 24`; o
preflight recusa 22), Docker Engine ativo, clone no disco Linux, árvore limpa.

```bash
git fetch origin && git status --short
```

```bash
git checkout d5e1612b482d635f0d110db82a0fc4f9412f368f
```

```bash
bash scripts/demo/local.sh prepare-station --provision
```

Esperado (medido no executor em 28/10): seed 39/39, pool 4 prontos (≈ 11 min
por lote de 2), Modo leitura e interativo PRONTO, veredito PREPARED antes do
freeze. Se Docker Hub/ECR recusarem por cota, o fallback GHCR é automático.

```bash
bash scripts/demo/local.sh freeze --station
```

```bash
bash scripts/demo/local.sh station
```

Só **READY** libera o Plano A. Guardar `reports/demo-station/station.md` e
`reports/demo-readiness/readiness.md` (não versionar `.state`, senha, cookie).

Também preparar, numa **segunda cópia** do mesmo SHA, a visita offline
(contingência sem internet):

```bash
npm ci --include=optional && npm run build:demo && PORT=4174 npm run serve:test
```

Conferir `http://127.0.0.1:4174/demo/visita.html` e deixar o servidor aberto.

## 2. Janela final

| Hora | Ação |
| --- | --- |
| T-60 | `bash scripts/demo/local.sh resume` só se a máquina dormiu; depois `bash scripts/demo/local.sh station` → READY |
| T-45 | Abrir aba com a visita pública e aba com a visita offline (`:4174`) |
| T-30 | Uma janela anônima em `https://localhost:4443/login.html#demonstracao`, aceitar certificado, **não entrar**. A partir daqui nenhum comando de prontidão, ensaio ou provisionamento |
| T-0 | Entrar como Juliana; seguir `PRESENTATION_SCRIPT_2026-10-29.md` |

Lição reproduzida em 28/10: rodar `prepare-station`/`readiness` e logo depois
abrir a demo derruba as primeiras telas da Juliana com 429 por alguns minutos.
É o limite real (240 chamadas/10 min por pessoa) e **não se contorna**.

## 3. Contingências na sala

| Falha | Procedimento exato |
| --- | --- |
| Internet caiu | Plano A não depende de internet (tudo em `localhost`). Sem estação: aba da visita offline `:4174`. Sem ela: abrir os WebP de `demo/visita/` e dizer que são capturas |
| Contêineres locais pararam | Outro terminal: `bash scripts/demo/local.sh station --fast`. Só o app caiu → `bash scripts/demo/local.sh app`. Docker parado → abrir Docker Desktop e `bash scripts/demo/local.sh resume`. Mais de 2 min → visita (Plano C). Nunca `demo:setup`, `demo:down` ou reset |
| Autenticação falhou (503/401) | Esperar; a sessão volta sozinha quando Auth responde. Não entrar repetidamente (12 entradas/10 min por rede). > 2 min → visita |
| 429 | Esperar o tempo da tela, na mesma aba, falando sobre a tela atual. Segundo 429 seguido → ato correspondente na visita |
| Sessão inválida no navegador | Fechar só a aba e reabrir na **mesma** janela anônima; entrar de novo uma vez. Não abrir janelas novas (cada uma é um visitante novo, 4/h) |
| Resolução/monitor | Zoom do navegador (Ctrl + / Ctrl −) entre 90 % e 110 %; o layout foi verificado sem overflow de 375 a 1440 px. Projetor estreito: espelhar e usar 1366×768. Não trocar de máquina |
| Tela não carrega | Uma tentativa de "Tentar novamente"/recarregar; depois pular para a âncora da visita do mesmo ato |
| Escrita sem confirmação | Não repetir clique; "Conferir com o servidor" ou recarregar a lista. No modo leitura nenhuma escrita deveria ocorrer |
| Demo interativa indisponível | Plano C inteiro pela visita (`PRESENTATION_SCRIPT` §Contingência), anunciado como visita com capturas reais |
| Qualquer `station` UNSAFE ou suspeita de dado real/cross-tenant | Parar a operação ao vivo; Plano C; acionar owner/segurança depois |

## 4. Depois da apresentação

Não rodar reset no mesmo dia sem decisão. Guardar os relatórios sanitizados.
Registrar no POST_PRESENTATION_BACKLOG o que falhou.
