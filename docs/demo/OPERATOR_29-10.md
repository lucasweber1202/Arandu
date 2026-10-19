# Cartão do operador — apresentação de 29/10/2026 (Demo canônica local)

Uma página para quem vai operar a estação. O roteiro da fala está em
[`PRESENTATION_2026-10-29.md`](PRESENTATION_2026-10-29.md); aqui ficam só os
comandos e as checagens. Tudo é o produto real (`main`) em `ARANDU_ENV=demo` com
Auth, API, RLS e Storage reais em Docker e dados **fictícios** (Vitta Foods e
instituições `*.example`).

## Qual plano vale hoje

| Plano | Vale quando | Se não vale |
| --- | --- | --- |
| **A — hospedado** | `node scripts/demo/hosted-parity.mjs --url=https://arandu-demo.vercel.app --sha=<SHA completo aprovado>` diz **READY** e o roteiro pela entrada pública foi ensaiado no domínio | use B |
| **B — estação local** | Itens 1–12 do T-30 abaixo **todos OK nesta máquina, hoje** | use C |
| **C — sem demo ao vivo** | — | Apresente capturas **ditas como capturas**; não simule operação |

Não troque de A para B no meio da reunião se B não foi preparado antes.

## D-1 (28/10): preparar a estação (≈ 1 h, uma vez)

```bash
git fetch origin && git checkout <SHA aprovado> && git status --short   # vazio
npm ci --include=optional
npm run demo:setup                      # ≈ 20 min; termina em "39/39 checagens OK"
set -a; . scripts/pilot-local/.state/demo.env; set +a
npm run demo:local:workspaces -- provision --count=4    # ≈ 10 min por par
# Ensaio completo (consome 1 workspace e 1 das 4 entradas novas da hora):
ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
npm run demo:local:workspaces -- provision --count=1    # repõe o consumido
```

O ensaio grava num workspace de visitante, nunca no cenário-base: o Modo
interativo continua intocado. **Não rode `npm run demo:down` depois disso** (apaga
banco, pool e senha) nem `npm run demo:setup` (re-semeia).

## T-30 min (no dia, nesta ordem)

```bash
git rev-parse HEAD                      # = SHA aprovado
set -a; . scripts/pilot-local/.state/demo.env; set +a
bash scripts/demo/local.sh readiness --smoke
```

Abra `reports/demo-readiness/readiness.md` e confira:

1. Commit = SHA aprovado e "Árvore sem alterações locais".
2. Contêineres, Auth, PostgREST, **Storage** e App: PASS.
3. Personas entram (Juliana, Helena, Patrícia e as demais).
4. Vitta Foods visível; RFQs e contratos presentes; **39/39** no seed.
5. **Modo leitura: PRONTO.**
6. **Modo interativo: PRONTO** — exige: etapa da CFO pendente, Meridian ainda sem proposta, nenhuma tarefa de ensaio, **pool com ≥ 2 workspaces prontos e ≤ 2 entradas novas na última hora**.
7. "Sonda de prontidão da implantação hospedada" = AVISO é esperado na estação local (não é falha).
8. Navegador: abra `https://localhost:4443/login.html#demonstracao` e aceite o certificado autoassinado **antes** da reunião.
9. A tela mostra "Conheça o Arandu por dentro" com as personas.
10. Nada de produção: os e-mails são `*.example`; a URL é `localhost`.
11. Depois do T-30, **não** rode mais testes nem readiness (consomem cota de login e de entradas).
12. Guarde o `readiness.md` (sanitizado; não contém senha, token nem cookie).

Se 5 e 6 não estiverem PRONTO, a linha FAIL diz o comando de correção.
Modo interativo NÃO PRONTO e leitura PRONTO → apresente só o Modo leitura.

## Durante

- Janela 1 (anônima): entrada por persona, **Juliana Ramos** (gestão financeira).
- Para CFO, leitor e instituições: "Trocar persona" **na mesma janela** — não abre workspace novo nem consome a cota de 4 entradas novas por hora.
- Cada janela anônima nova = um visitante novo (workspace próprio).
- Não recarregue telas em sequência; o limite é por conta e por rede.

## Se algo falhar

| Sintoma | Faça |
| --- | --- |
| "A demonstração está cheia" | Siga pelas janelas já abertas; depois: `npm run demo:local:workspaces -- provision --count=2` |
| "Muitas entradas em pouco tempo…" | Espere o tempo da tela na mesma janela; use "Trocar persona" |
| Telas com "Não foi possível carregar" | Veja a recuperação abaixo |
| Operação sem confirmação ("Não confirmamos…") | Não repita: use "Conferir com o servidor" ou recarregue e confira a lista |
| Qualquer dúvida | Siga em Modo leitura; a jornada não depende da operação |

Tabela completa de contingências: `PRESENTATION_2026-10-29.md`.

## Recuperação sem apagar dados (máquina reiniciada, Docker parado)

```bash
docker start arandu-pilot-local-db-1 arandu-pilot-local-auth-1 arandu-pilot-local-rest-1 arandu-pilot-local-storage-1
# espere o banco "healthy":
docker inspect -f '{{.State.Health.Status}}' arandu-pilot-local-db-1
node scripts/pilot-local/gateway.mjs > scripts/pilot-local/.state/gateway.log 2>&1 &
bash scripts/demo/local.sh app
set -a; . scripts/pilot-local/.state/demo.env; set +a
npm run demo:local:check                # 39/39
npm run demo:local:workspaces -- list
```

## Depois da apresentação

- Cenário-base tocado (Modo interativo pelas contas de e-mail): `npm run demo:local:reset` (≈ 15 min).
- Encerrar de vez e apagar tudo: `npm run demo:down`.
- Nunca rode reset contra banco hospedado.
