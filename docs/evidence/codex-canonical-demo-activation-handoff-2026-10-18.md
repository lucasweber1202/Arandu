# Handoff de ativação — 18/10/2026

Base `41513ee408f58dff6386eabea4d45f03205aeadd`; frente Codex
`codex/p0-hosted-canonical-demo-release-20261018`. Nenhum arquivo reservado ao
Claude foi alterado. Não houve alteração de rota, package.json ou lockfile.

## Contrato operacional atual

| Item | Contrato / observação |
| --- | --- |
| Domínio público | arandu-demo.vercel.app, SHA da base, main; runtime environment null / mode demo / synthetic-fixtures |
| Build publicado | Entrada `/assets/demo/index-BGcO0oPD.js` idêntica em bytes ao build standalone limpo da mesma main; raiz continua sandbox |
| Readiness | `/api/health` 200 alive; `?probe=ready` 503 not_ready. Só projeção segura `{ok,service,status,release}` |
| Rotas canônicas | `/login.html`, `/finance/dashboard.html`, PAGES do gerador e `/provider/`; HTML 200 não comprova API ou sessão |
| Personas | GET `/api/auth/demo-personas`; POST `/api/auth/demo-login` recebe somente `{persona:key}`. No domínio atual, rota ainda retorna 404 |
| Sessão | Servidor escolhe conta/tenant/papel; cookies arandu_session e arandu_demo_ws HttpOnly/Secure/SameSite=Lax; token de claim só no cookie, hash no banco |
| Organização | GET `/api/finance/organizations` → `{ok,rows,environment}`; rows id/legal_name/trade_name/kind/country/sector/revenue_band/created_at. BUYER/PROVIDER vêm do contexto autorizado |
| Membros | GET members com organization_id validado pelo servidor → `{ok,rows,viewer_id}`; role/entity_scope/display_name/title são do banco, não do corpo cliente |
| Dataset/pool | vitta-2026-10; contas e organizações próprias por workspace, montadas pelo seed existente. Baseline não é workspace de visitante |
| Limites | 25 ativos; 4 claims/h por origem; idle 240 min, absoluto 1440 min. Não modificar quotas para facilitar teste |
| Erros | 503 demo_capacity sem capacidade; 503 demo_workspace_incomplete sem mapa/baseline íntegro; 429 aguarda janela; 401/403 não autoriza fallback; 409 exige releitura |
| Readiness reforçada | Metadados completos, baseline/personas coerentes, usuários/organizações sem repetição entre workspaces e contagem exata da Data API; considera ativos + ready, não somente ready |

Depois desta correção, persona trocada no mapa (ex.: juliana apontando para
helena no mesmo slug) e baseline antigo retornam o erro existente 503 antes do
login. A admissão também exige metadados completos do workspace e confere que
o UUID devolvido pelo Auth pertence ao inventário user_ids antes de emitir
cookie. Mapa parcial ou conta recriada com outro UUID não vira sessão de visitante.
A UI não precisa de contrato novo. Readiness não faz login de todas as
contas, não reserva capacidade e não comprova grants; canário e jornada real
permanecem obrigatórios. Provisionamento continua manual/autorizado pelos
scripts existentes, sem reset público.

## Defeito reproduzido em arquivo reservado: hosted-parity.mjs

`scripts/demo/hosted-parity.mjs` foi executado sem modificação contra um servidor
HTTPS descartável, certificado confiado só ao processo de teste, porta própria
55574. Liveness declarava Demo/main/SHA A; readiness HTTP 200/status ready
declarava Production/SHA B. Demais respostas atendiam às verificações atuais.
Resultado observado: exit 0, `verdict: READY`; esperado: NOT_READY.

Causa: o teste de readiness compara somente HTTP/status. Também não reutiliza
o contrato estrito de identidade do liveness. O erro não transforma a observação
pública atual em GO: no domínio real, o script corretamente retornou NOT_READY.
Mas precisa ser corrigido antes de confiar nele para liberar hospedagem.

Alteração precisa para a frente Claude, sem criar assessor paralelo:

1. Importar `assessPublicHealth` de `../../lib/live-release-health.mjs`.
2. No modo hospedado, exigir SHA completo e avaliar health com
   `{environment:'demo',commit:expectedSha,readiness:false}` e readiness com
   as mesmas opções, `readiness:true`; ambos também precisam de HTTP 200.
3. Registrar somente o código seguro do assessor. Ele verifica ok/service,
   environment/mode/datasource, misconfigured, branch main e SHA; não aceitar
   payload extra ou liveness correto mascarando readiness de outro deployment.
4. Acrescentar regressões: liveness correto + readiness com outro SHA, outro
   ambiente, datasource fixtures, branch incorreta e campo privado extra.
   Nenhum desses casos pode emitir READY. Modo local continua sem atestar M3.

Não resolvi o defeito editando o arquivo reservado. O doctor e check:live do
backend já usam esse assessor; devem continuar sendo executados no release.

## GO e bloqueios

No estado observado: C / NO-GO. Para A faltam preservação/restore autorizados,
atribuição Demo, manifesto hospedado, configuração Vercel, Auth/Storage/pool,
canários e jornadas no domínio real. Vercel GET projeto retorna 403 no scope
lucas-projects467; sem trocar scope. Pilot continua no marker antigo, sem
workspaces. Owner deve aprovar custódia/preservação, rollout e cutover em
etapas distintas. B exige estação/stack do Claude no SHA aprovado e pool pronto;
ensaios CI não atestam essa estação. Não usar mocks para substituir backend.

As permissões externas mínimas e o rollback estão no pacote de autorização
adjacente e no runbook canônico existente.

O harness CI agora provisiona quatro workspaces com o script existente e ativa
ARANDU_DEMO_ENTRY_E2E e ARANDU_DEMO_WORKSPACE_E2E. Ambas as suítes de visitantes
precisam executar e passar no desktop (JSON verifica ausência de skips/retries);
mobile preserva a restrição desktop definida nos testes. REST fica explicitamente
em http://127.0.0.1:3000 para a sonda local de expiração. Não houve alteração das
suítes nem da configuração Playwright. POOL é outcome obrigatório e antecede o
recovery: o restore contém o mesmo inventário de workspaces sintéticos.
