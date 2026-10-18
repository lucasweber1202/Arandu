# Demo canônica — publicação preparada, cutover bloqueado

Alvo: `arandu-demo` / `https://arandu-demo.vercel.app`, scope
`lucas-projects467`, branch `main`. Este procedimento não autoriza mutações
hospedadas. A publicação ilustrativa permanece até a substituta estar validada.

## Decisão de infraestrutura

| Alternativa | Segurança e rollback | Prazo, custo e operação | Decisão necessária |
| --- | --- | --- | --- |
| A — converter Pilot | Preservar primeiro schema/dados/roles, Auth, Storage binário e configuração. Restore do mesmo export e custódia durável são pré-condições; contagens zero de Auth/Storage não classificam os dados financeiros. Rollback inclui aplicação, banco e serviços gerenciados | Reutiliza projeto existente; export/custódia/restore e upgrade integral são o caminho crítico. Nenhum prazo ou custo de backup gerenciado foi comprovado | Autorizar inventário/classificação e depois preservação com origem, destino privado, custódio, escopo e janela definidos; conversão exige aprovação separada |
| B — Demo nova vazia | Evita alterar dados do Pilot; facilita instalação limpa e rollback por manter a publicação anterior. Não usar o projeto histórico de Production | Menor risco técnico para atingir 29/10 se houver projeto disponível. Organização atual observada no plano Free, com dois projetos ativos; preço/quota de projeto adicional não cotados. Pode exigir orçamento e projeto transitório adicional | Owner escolhe organização, aceita cotação e aprova criação/mudança do plano de consolidação; não estabelecer terceiro ambiente permanente |

Recomendação técnica: B reduz o risco de dados existentes e de upgrade, **se**
quota, custo e mudança de plano forem aprovados rapidamente. A continua o plano
normativo vigente enquanto não houver essa decisão; não converter Pilot por
inferência. Nenhuma alternativa está operacionalmente liberada. Production
permanece isolada, sem mudança de ambiente, credenciais ou datasource.

## Configuração proposta (nomes, nunca valores secretos)

No projeto Demo autorizado, escopo Production da Vercel, branch main:

| Configuração | Contrato |
| --- | --- |
| Build / output | `npm run vercel-build` / `dist`; mesma aplicação e SHA da main |
| Runtime | `ARANDU_ENV=demo`; remover seletores standalone somente no cutover aprovado |
| Identidade pública | `ARANDU_SITE_URL=https://arandu-demo.vercel.app`; SHA/ref fornecidos pelo deployment, não inventados |
| Supabase | URL, anon e service role exclusivos do destino Demo aprovado; nenhuma chave de Production/Pilot por conveniência |
| Personas | `ARANDU_DEMO_PASSWORD` forte, somente servidor e provisionamento autorizado; nunca variável pública |
| Operação | `CRON_SECRET` exclusivo; integrações externas/efeitos reais bloqueados pela política central de runtime |
| Seletores incompatíveis | Ausência de `ARANDU_DEPLOYMENT_KIND=demo`, `ARANDU_DEMO_MODE=true`, `ARANDU_PRESENTATION_MODE=true` no candidato canônico |

Não configurar isto no alias ativo antes de banco, recovery e candidato estarem
prontos. `ACTIVE_SUPABASE_ASSIGNMENTS.demo` fica vazio nesta PR. Só uma decisão
operacional comprovada permite atualizar a atribuição e os testes de topologia.
O build guard continua bloqueando um destino não aprovado.

## Sequência operável

1. Owner libera acesso de leitura/configuração/deploy de **arandu-demo** no scope
   acima. HTTP 403 é `ACCESS_BLOCKED`; não trocar de scope. Guardar a identidade
   do deployment anterior e configuração em custódia privada, sem secrets em logs.
2. Aprovar A ou B e executar somente os passos especificamente autorizados.
   Para A, seguir `SUPABASE_ENCRYPTED_PRESERVATION.md` integralmente. Verificar
   recovery Auth/Storage/configuração; laboratório PostgreSQL não substitui isso.
3. No destino autorizado, instalar a sequência integral de
   `docs/supabase-migrations.json`, verificar marker
   `financial-decision-authorization-1`, probes SQL/grants/RLS e cache PostgREST.
   Rollout/forward-fix seguem `HOSTED_SCHEMA_ROLLOUT.md`; não aplicar apenas o delta.
4. Provisionar dataset e pool sintéticos pelos scripts existentes, por operador
   autorizado. Validar baseline `vitta-2026-10`, personas, TTL, quota e isolamento.
   Nenhum reset de visitante ou seed automático durante deploy.
5. Validar candidato canônico do mesmo SHA em destino não público aprovado, com
   configuração final equivalente. O build de Preview não prova configuração
   Production. Registrar domínio/projeto/ref/SHA, Auth, Storage privado e RLS.
6. Após aprovação específica de janela e rollback, retirar os seletores sandbox
   **somente da Demo**, aplicar configuração aprovada, publicar main e atribuir
   alias. Sem essa aprovação, parar antes deste passo e preservar a publicação.
7. Executar provas abaixo e jornadas autenticadas comprador/provedor, com escrita
   sintética autorizada, releitura e auditoria. Claude fornece E2E/UX, não fixtures
   que substituam API. Só então avaliar A/M3 e candidato M4.

Comandos locais sem credenciais hospedadas:

```bash
npm ci --include=optional
npm run check:demo-parity
npm run check:all
npm run deploy:check
git diff --check
```

Probes somente leitura, com `RELEASE_SHA` definido como SHA completo aprovado e
ambiente servidor carregado por meio privado no alvo autorizado:

```bash
curl --fail-with-body https://arandu-demo.vercel.app/api/health
curl --fail-with-body 'https://arandu-demo.vercel.app/api/health?probe=ready'
ARANDU_ENV=demo node scripts/check-live-production.mjs https://arandu-demo.vercel.app --expected-commit="$RELEASE_SHA"
ARANDU_ENV=demo npm run finance:pilot:doctor -- --json --expected-commit="$RELEASE_SHA"
node scripts/check-release-candidate.mjs --commit="$RELEASE_SHA" --evidence="$PRIVATE_EVIDENCE_FILE"
```

Doctor exige variáveis do destino; não imprimir nem copiar valores para comandos
ou evidência pública. Liveness 200, deploy READY e catálogo de RPCs não provam
login, grants, bodies SQL, Storage assinado ou ausência de dados reais.
Canary e jornadas com escrita só na janela autorizada; seguir o runbook de
29/10 e os testes existentes, sem executar a stack local pertencente ao Claude.

## Handoff técnico para Claude

- Rotas canônicas: `/login.html`, `/finance/dashboard.html`, demais `PAGES` em
  `scripts/generate-finance-pages.mjs`, incluindo `/provider/**`. Não copiar
  lógica para `/demo`. A raiz do build canônico permanece institucional;
  experiência de entrada/links é da frente Claude. Nenhuma rota Vercel mudou.
- `GET /api/auth/demo-personas` lista `{key,name,title}`; `POST
  /api/auth/demo-login` recebe apenas `{persona:key}`. Workspace, e-mail,
  organização e papel são escolhidos no servidor. Cookies HttpOnly/Secure
  existentes; nenhuma senha/JWT/service role no navegador.
- Session e APIs financeiras reais continuam seus contratos atuais; obter
  usuário/organização pelo contexto autorizado, nunca hardcode de tenant. Pool
  deriva organizações, entidades e provedores do seed existente. Campos e RBAC
  permanecem no modelo canônico; nenhum endpoint simulado foi acrescentado.
- `demo_capacity` / `demo_workspace_incomplete` retornam 503; 401/403 exigem
  sessão/autorização normal, 409 exige reler versão, 429 respeita Retry-After.
  Não anunciar sucesso sem reler persistência; não contornar erro com fixture.
- `GET /api/health` é liveness; `?probe=ready` retorna 200/503 e somente
  `{ok,service,status,release}`. `release` identifica environment/mode/datasource,
  misconfigured, branch e commit; sem identidade privada do banco.
- Readiness/doctor agora exigem segredo forte, RPCs de workspace e capacidade
  ready no baseline esperado. Pool vazio/antigo não autoriza novo visitante.
  Isso exige operação do pool, não alteração de UI nem reset global.
- Código de visitante já oferece cookies, TTL, claim serializado e isolamento.
  Operador deve manter capacidade e limpeza sintética autorizada; readiness não
  prova todas as contas por login nem equivale a E2E.
- GO depende de destino aprovado, SHA main exato, quatro gates, schema,
  configuração não contraditória, Auth/Storage/RLS reais, dataset sintético,
  jornadas persistidas e recovery aplicável. No estado observado: **C / NO-GO**.

## Rollback e apresentação

Se readiness, login, persistência, isolamento ou Storage falhar, interromper
escritas e retirar o candidato do atendimento conforme janela aprovada. Restaurar
alias/configuração anterior apenas por operador autorizado; **não** resetar banco
nem reverter migration destrutiva improvisadamente. Deployment anterior não
garante compatibilidade com schema novo. Se não houver rollback seguro, manter
serviço indisponível e executar forward-fix aprovado.

Aplicar D-7/D-3/D-1/D-0 de `DEMO_PRESENTATION_2026-10-29.md`. A exige prova pública
canônica completa. B exige estação/stack canônica e jornadas no SHA exato já
validadas, sob operação do Claude/owner; não foi comprovado nesta worktree. Sem A
ou B, C. Sandbox legado nunca pode ser anunciado como produto completo.
