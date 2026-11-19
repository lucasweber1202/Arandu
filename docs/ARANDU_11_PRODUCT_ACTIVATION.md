# Arandu 11 — Product Activation, Buyer Experience e Adoção Bilateral

**Data:** 19/11/2026 · **Base:** `main` `04f7aa26` · **Natureza:** frontend sobre APIs existentes; **sem migration, sem escrita hospedada**.

## 1. Auditoria (código da `main`, não só documentação)

| Superfície | Estado encontrado | Integração | Lacuna de experiência |
| --- | --- | --- | --- |
| Primeiros passos (Início) | Lista fixa de 4 passos; "Crie a primeira solicitação" nunca marcava; lista ausente contava como "a fazer" | API real (`overview`) | Não partia do objetivo de quem usa; não distinguia "não verificado" de "pendente" |
| Entrada por objetivo ("Começar") | Completa (`lib/finance/intents.mjs`) | API real | — |
| Action Center / Caixa de trabalho | Completa | API real | — |
| Decision Studio, Aprovações | Completos (10/10.1) | API real | — |
| Renewal Workbench | Completo | API real | — |
| Central de Relacionamentos (fila) | Completa, com "Iniciar/Retomar renegociação" | API real | — |
| Relationship 360 (gaveta da instituição) | Contratos, CRM, questões, prazos, linha do tempo | API real | Prazo de renovação só levava a "Abrir contrato": renegociar exigia sair e procurar o item na fila |
| Portal da instituição | Aceite/recusa por convite, rascunho autosalvo, completude ao vivo, revisão antes do envio, conflito e envio incerto, histórico de versões | API real | Instituição decide aceitar/recusar **sem prévia** do convite (ver §4) |
| Site institucional na Demo | Servido pela Demo canônica (`/api/health`: `environment=demo`, `datasource=supabase`) | — | Nada dizia que era demonstração; "Acessar plataforma"/"Portal do provedor" levavam ao login corporativo/portal sem sessão; seção "Acesso ao piloto" |
| `/demo/` antigo | `307 → /demo/index.html → 404` na Demo canônica | — | Já tratado pela página 404 (oferece a entrada por persona) |

## 2. O que mudou

**Frente A — primeiro valor por objetivo.** `lib/finance/first-value.mjs` (puro) + painel no Início (`finance/src/views/dashboard.js`):
três objetivos (acompanhar contrato vigente, organizar relacionamento, pedir propostas), cada um com passos do fluxo **que já existe**.
Estado **só** do que o servidor devolveu: `done`/`todo`; lista ausente = `unknown` ("não verificado", nunca concluído); "abrir o relacionamento" é caminho (`guide`), nunca conta como feito.
Próximo passo = primeiro não comprovado, oferecido só a quem tem permissão. Escolha do objetivo é preferência local (não marca nada). Nenhum passo depende de instituição com conta.
Teclado: grupo de rádios com setas; foco preservado. Leitor continua com a variante sem ações.

**Frente B — Relationship 360 com ação contextual.** `finance/src/views/shared/renegotiation.js` extrai o caminho único de renegociação (POST `contract-renewal-rfq`, idempotente) usado pela fila; a gaveta da instituição passa a oferecer "Iniciar/Retomar renegociação" no prazo de renovação de contrato de crédito/adquirência, só para quem pode criar solicitação. A solicitação aberta já mostra a origem e o atalho "Relacionamento com …" (contexto preservado).

**Frente D — Demo navegável a partir do site.** `financial-public-demo.js`, injetado só nas páginas institucionais: consulta `/api/health` (sem cota de entrada); **somente** com `environment=demo` e `datasource=supabase` mostra o aviso de demonstração, troca "Entrar"/"Acessar plataforma"/"Portal do provedor" pela escolha de persona (`/login.html#demonstracao`) e substitui a chamada de piloto. Produção, sandbox e API indisponível: página inalterada.

**Frente C — portal.** A jornada já estava completa; nenhuma mudança de comportamento sem ganho demonstrável. Lacuna registrada em §4.

## 3. Evidências

| Verificação | Resultado |
| --- | --- |
| `node scripts/test-finance-first-value.mjs` (em `check:finance`) | PASS |
| `npm run check:all`, `npm run build`, `npm run check:design` | PASS (local, ver PR) |
| E2E mock: primeiros passos (gestor, leitor, lista parcial, teclado, reload), relacionamento (gestor inicia, leitor não), site na Demo (1440/390, Produção/sandbox/indisponível) | PASS em Chromium, WebKit, mobile Chrome (local) |
| E2E backend real (Supabase/Auth/PostgREST locais + seed oficial): `tests/e2e/demo-baseline.spec.js` — ação de renegociação para gestora e ausência para leitor | ver PR (execução local registrada) |
| Hospedado | **Não validado** nesta missão (sem deploy/escrita hospedada) |

## 4. Parcial / dependências

**Prévia do convite para a instituição (proposta, não aplicada).** Hoje a instituição aceita ou recusa sem ver no portal o que o e-mail já informou (comprador, produto, prazo). Resolver exige função SQL `security definer` de leitura (mesmas checagens de `fin_decline_provider_invite`: membro `admin|provider_user` da organização provedora, vínculo de e-mail confirmado, vínculo canônico do provedor), devolvendo só `buyer`, `product`, `response_deadline`, `expires_at` e estado do convite — nada além do que o e-mail já revela.
Não entrou nesta PR porque toda migration nova no manifesto marca o schema da Demo hospedada como pendente (`SCHEMA_PENDING` → preflight NO-GO) até uma aplicação hospedada **autorizada**, o que bloquearia a P0 da Demo. Plano: PR própria com migration aditiva, rollback, registro em `docs/supabase-migrations.json`/`check-migrations`/`test-database.sh`, teste em `tests/database/` (positivo, outra organização, e-mail divergente, convite expirado/aceito), rota `GET invites/preview` com cota, e UI degradando para o comportamento atual quando a função não existir; aplicar na Demo só com autorização específica.

Outros: objetivo escolhido não é sincronizado entre dispositivos (preferência local, por desenho); o painel continua aparecendo só até a primeira solicitação.
