# Evidência — segurança de release e prontidão M3

Data: 16/10/2026 (UTC). Branch `codex/release-readiness-m3-20261016`, baseada
na ponta revalidada `origin/main@ab3dda8d8a65c621855b8774bd30180d7366f690`.
Nenhum arquivo de interface ou sob ownership do Claude foi alterado. Nenhum
ambiente hospedado, migration, dado, binding, segredo, Auth ou Storage foi
modificado.

## Diagnóstico operacional

No SHA base `ab3dda8d8a65c621855b8774bd30180d7366f690`, GitHub reportou SUCCESS
nos gates `database`, `deploy-boundaries`, `validate` e `presentation`, e no
`merge-audit`. PR #206 está integrada nesse SHA e não havia PR aberta na consulta.
Os deployments associados ao SHA reportaram Demo SUCCESS, Pilot SUCCESS e
Official FAILURE. Esses status não vinculam alias, ambiente declarado,
datasource, versão de schema, eficácia de Auth/RLS/Storage ou uma recuperação
realizada.

A listagem read-only de projetos Supabase disponível nesta sessão mostrou
somente o legado `igacnfjeuqhxcmfyepgj` e o Pilot `offgpyysgdhfemjlchod`; não
mostrou projeto dedicado à Demo. O Pilot continua com marker/schema observado
`financial_pilot_surface_hardening`; não foi consultado nem alterado nesta
missão. Consultas detalhadas Vercel no scope `lucas-projects467` permanecem
sem acesso (403 já observado anteriormente); não tentei outro scope, conta,
credencial ou bypass. A causa do Official FAILURE permanece desconhecida.

| Item | Estado | O que se pode afirmar |
| --- | --- | --- |
| SHA e gates da base | VERIFIED | `ab3dda8d8a65c621855b8774bd30180d7366f690`; quatro gates e merge audit SUCCESS segundo checks do GitHub |
| Demo/Pilot/Official deploy | VERIFIED como status | SUCCESS / SUCCESS / FAILURE associados ao SHA base; esses rótulos não constituem prova M3 |
| Projeto/datasource Demo | ACCESS_BLOCKED / INCONCLUSIVE | Nenhum projeto Demo apareceu na listagem Supabase autorizada; vínculo Vercel e datasource exatos não foram verificados |
| Schema e políticas Demo | NOT_RUN | Sem identidade comprovada do datasource Demo, não há schema/Auth/RLS/Storage para atribuir à aplicação hospedada |
| Recovery hospedado | NOT_RUN | Nenhum backup/restore hospedado foi feito ou inferido |
| Production | FAILED no status de deployment; causa INCONCLUSIVE | Nenhum log detalhado autorizado acessível nesta sessão; não se afirma falha de build, configuração ou guard como causa |

## Defeito reproduzido e correção

O validador `validateGateEvidence` em `lib/release-evidence.mjs` permitia
classificar como `externally_verified` uma prova com `environment: "localhost"`
se a origem fosse descrita como externa. Também permitia `environment:
"production"` com `origin: "local_rehearsal"`. Nos dois casos `meetsRelease`
retornava `true` para o gate `catalog_real`, pois o código anterior só rejeitava
um conjunto exato de nomes de ambiente como `local` e `ci`.

Antes da alteração, estes exemplos foram executados diretamente no runtime
Node e ambos retornaram `meetsRelease: true` sem problemas. Foram adicionados
testes regressivos para os dois casos. A regra agora exige um dos ambientes
hospedados reconhecidos (`demo`, `pilot`, `production`, `staging`) e rejeita
origens com marcadores de executor local, CI, fixture/mock/synthetic,
rehearsal ou runner. Uma prova com `environment: "demo"` e origem
`vercel_dashboard` continua válida. Os campos, ranks dos estados, gates
requeridos, controles de deployment e regras de autorização não foram
enfraquecidos.

Esta verificação valida a coerência declarada, não autentica o operador, a
origem externa ou o conteúdo do `reference`; a prova continua exigindo revisão
da fonte correspondente. O `check:evidence:release --require-ready` continua
falhando corretamente: só 1 de 13 gates atende ao limiar registrado, e os
gates de backup/restore, canário, isolamento, catálogo real e demais requisitos
seguem pendentes. Esse registro não equivale a prontidão de release ou M3.

## Validações desta branch

- `npm ci --include=optional`: PASS, Node `v24.19.0`.
- `node scripts/test-release-evidence.mjs`: PASS após a correção; antes dela,
  os dois novos negativos falharam contra a baseline.
- `npm run check:evidence`: PASS; relatório atual registra `1/13` gates no
  limiar mínimo. Não é prova M3.
- `node scripts/test-release-candidate.mjs`: PASS; fixtures validam os checks
  de release candidate existentes.
- `node scripts/test-pilot-doctor.mjs`: PASS; 12 cenários de configuração
  inseguros recusados em fixtures locais. Não prova o Pilot hospedado.
- `npm run check:backend`: PASS.
- `npm run check:security`: PASS.
- `npm run check:migrations`: PASS; nenhum SQL ou manifesto foi alterado.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run check:governance`: FAIL em `test-stage0-static-preflight.mjs:43`:
  fixture esperava JSON em stdout, mas o subprocesso Node retorna `EPERM` e
  stdout/stderr vazios neste executor. A invocação direta do script produz o
  diagnóstico esperado; teste e guard permaneceram intactos.
- `npm run check:staging`: FAIL em `test-ci-demo.mjs:92` pelo mesmo sintoma de
  subprocesso bloqueado (stderr vazio onde o teste espera a saída do filho).
  As verificações anteriores do comando passaram; integração Demo não foi
  executada.
- `npm run check:all`: NOT_PASS; parou na primeira etapa
  `test-deploy-release-separation.mjs:38` por stderr vazio de subprocesso. A
  execução direta local do guard apresenta a recusa esperada. Nenhum teste ou
  controle foi relaxado.
- `npm run check:supply-chain`: verificação estática dos 7 workflows passou
  (`0` problemas); teste de ações falhou em `test-supply-chain-actions.mjs:28`
  porque o subprocesso não forneceu o stderr esperado, compatível com o
  bloqueio `EPERM` reproduzido neste executor.
- `npm run check:finance`: executou as verificações até
  `test-finance-env.mjs:29`, onde o teste de fixture recebeu stderr vazio de
  subprocesso em vez da recusa `projeto legado de arte`; as verificações
  anteriores do comando passaram. O guard foi mantido.
- `npm run check:env`: PASS; documentação de variáveis validada. O doctor
  Production reportou `1/9` pré-requisitos (modo de apresentação desligado),
  corroborando que Production ainda não está operacionalmente pronta.
- `npm run audit:ci`: NOT_RUN/sem resultado; conexão ao endpoint npm audit
  falhou com `EPERM` no proxy de rede `172.31.3.61:8080`.
- Banco descartável: NOT_RUN; `psql` não está disponível e `docker info`
  retornou `permission denied` para `/var/run/docker.sock`. Nenhum banco
  hospedado ou compartilhado foi usado.
- `npm run check:evidence:release -- --require-ready`: FAIL como esperado,
  `1/13` gates atendidos; os restantes permanecem pendentes, não é falha de
  regressão desta mudança.

## Segurança, rollback e próximos passos

O ajuste só restringe evidência rotulada como externa e não altera dados. O
rollback consiste em reverter `lib/release-evidence.mjs` e seu teste; não há
migration nem efeito persistente. Risco residual: a detecção da origem é uma
validação textual e não autenticação criptográfica de evidência; deve-se
inspecionar a referência de cada prova e continuar usando os gates estritos
existentes.

Para reduzir o bloqueio M3, a intervenção mínima é recuperar acesso read-only
autorizado ao projeto Vercel `arandu-demo` no scope correto e obter a identidade
do datasource Supabase da Demo. Em seguida, a equipe precisa aprovar a
classificação/preservação da origem e executar a cadeia já existente de
recovery, atribuição e conversão apenas quando cada gate de autorização estiver
satisfeito. Nenhuma migration remota, export/restore, troca de binding ou
cutover foi executado nesta missão. Não há alteração de contrato para o Claude.

PR e validações dos quatro gates no SHA desta branch serão registrados depois
do push. Não houve merge; M3 permanece não comprovado.
