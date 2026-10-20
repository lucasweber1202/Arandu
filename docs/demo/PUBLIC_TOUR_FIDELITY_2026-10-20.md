# Visita pública — fidelidade e narrativa (P0-A, 20/10/2026)

**Base auditada:** `main` em `ba8f74f` (PR #243 integrada; #241 e #242 já na base).
**Escopo:** superfícies de UX da visita pública. Publicação, SHA servido e smoke do
domínio pertencem ao Codex (PUBLIC_DEMO_2026-10-29_PRIORITY.md); nada aqui declara
`PUBLIC_SHAREABLE`.

## 1. Matriz de fidelidade — o que o visitante realmente vê

| Superfície | Rota | Fonte | Backend | Classificação mostrada | Fidelidade ao produto atual |
| --- | --- | --- | --- | --- | --- |
| A. Produto canônico | `/finance/*`, `/provider/*` | `main` | API/Auth/RLS/Storage reais | — | referência |
| B. Demo local real | `https://localhost:4443` (`scripts/demo/local.sh`) | `main` + `ARANDU_ENV=demo` + seed pela API | real, dados fictícios | Operação real de backend | idêntica a A (mesmo código) |
| C. Visita pública | `/demo/index.html` → `/demo/visita.html` | gerada de `scripts/demo/dataset.mjs` + `lib/finance/navigation.mjs` | nenhum | Visita informativa | dados e menu idênticos ao seed de B; **sem capturas** (`demo/visita/captures.json` ausente) |
| D. Sandbox histórico | `/demo/finance/*`, `/demo/provider/*` | motor próprio no navegador, empresa Acme | nenhum | Simulação no navegador | interface anterior; não tem Covenants, Implantação, Qualificação, Performance, Documentos e fatos, Spend (`sandboxExcluded`) |

| Jornada | Canônico (A/B) | Visita (C) | Sandbox (D) |
| --- | --- | --- | --- |
| Entrada / problema | dashboard | etapa **contexto** (nova) | dashboard Acme |
| Início do trabalho | `/finance/dashboard.html` | etapa painel | sim (motor próprio) |
| Solicitação | `/finance/rfq.html` | Processo A | sim |
| Convites | `/finance/rfq.html` | Processo B | sim |
| Propostas e versões | `/finance/proposals.html` | Processo A | sim |
| Comparação | `/finance/rfq.html#comparacao` | Processo C | sim |
| Aprovação | `/finance/approvals.html` | Processo A (+ decisão do C citada como outro processo) | sim |
| Contrato | `/finance/contracts.html` | Processo C | sim |
| Tarefas | `/finance/tasks.html` | contadas no painel | sim |
| Covenants / implantação / tarifas | `/finance/covenants.html` etc. | Processo D (covenants), C (implantação, tarifas) | **não existe** |
| Relacionamento | `/finance/providers.html` | citado em continuidade | sim |
| Portal da instituição | `/provider/*` | 3 etapas (convite, proposta, **valor** — nova) | sim |
| Cinco áreas | `lib/finance/navigation.mjs` | seção final, mesmos rótulos | rótulos antigos parciais |

## 2. Diagnóstico priorizado

1. **Alta — contexto misturado.** A visita passava por quatro solicitações diferentes
   (nova linha R$ 12 mi em aprovação; safra R$ 5 mi com coleta aberta; adquirência
   decidida; linha vigente R$ 8 mi) sem dizer. "Convites" mostrava Orbe/Meridian da
   safra logo depois da linha de R$ 12 mi, "Comparação" e "Contrato" eram da
   adquirência, e "Aprovação" juntava a etapa da CFO da linha de crédito com a
   justificativa da adquirência. Um CFO leria isso como uma única negociação incoerente.
2. **Alta — faltava o problema e o benefício da instituição.** A visita começava no
   painel (sem a etapa A, o porquê) e terminava no envio da proposta (sem a etapa J).
3. **Média — sem capturas reais.** `captures.json` não existe; a visita é só texto e
   tabelas. Gerar capturas exige a Demo local B (`npm run design:capture`) — não
   executável neste contêiner sem Supabase local semeado.
4. **Baixa — sandbox D ainda acessível** a partir da entrada, corretamente rotulado
   como simulação; não recebeu capability nova.

## 3. O que mudou (esta PR)

- `lib/public-tour.mjs`: campo `case` por etapa; etapas **contexto** (problema) e
  **instituicao-valor** (por que o banco participa). 12 etapas.
- `scripts/generate-public-tour.mjs`: rótulo "Processo A–D" + título da solicitação
  em cada etapa; painel dos quatro processos no contexto, com estágio e instituições
  tirados do dataset; textos de aprovação, contrato e continuidade dizem explicitamente
  de qual processo vem cada dado; etapa da instituição lista o que ela vê e o que
  **nunca** vê. Nenhum valor novo, ranking ou economia.
- Compatibilidade com o adaptador do Codex (`scripts/public-tour-proof-flow.mjs`):
  `#topo a[href="#painel"]` ("Ir direto ao trabalho de hoje") e
  `#instituicao-proposta a[href="#areas"]` ("Pular para as cinco áreas") continuam
  existindo. **Proposta para o Codex:** incluir os estágios `context`
  (`contexto`) e `provider-value` (`instituicao-valor`) no fluxo de prova.
- Testes: `scripts/test-public-tour.mjs` exige as novas etapas e o rótulo de processo
  em toda etapa ligada a uma solicitação; `tests/e2e/public-tour.spec.js` percorre as
  12 etapas e verifica os rótulos A–D.
- `docs/demo/OPERATOR_29-10.md`: Plano C aponta para a visita pública rotulada.

Capturas antes/depois (Chromium, 1440 px e 390 px, overflow horizontal 0 em todas):
`docs/demo/captures-2026-10-20/`.

## 4. P0-B — estação local

Auditoria de `scripts/demo/local.sh` (`prepare-station --provision`, `station`,
`freeze --station`, `resume`, `reset`, `readiness`) e `OPERATOR_29-10.md`: cobertura
completa de preparo, preflight, retomada, falhas e restauração. Nada reconstruído.
**Status: NOT_PROVEN** — esta execução foi em contêiner efêmero; `READY` só vale com
`bash scripts/demo/local.sh station` na máquina definitiva do owner (D-3, D-1, D-0
conforme o cartão do operador).

## 5. Limitações restantes

- Sem capturas reais na visita até alguém rodar `npm run design:capture` contra a
  Demo local B e versionar `demo/visita/captures.json`.
- E2E rodado apenas em Chromium (desktop e Pixel 7); Firefox/WebKit não estão
  instalados neste contêiner — ficam para o CI.
- P1-A (primeiro valor ao cadastrar contrato existente, próximas ações do portal)
  não iniciado nesta rodada para não deslocar o P0.
