# Operação da apresentação — 29/10/2026

Somente dados sintéticos. Este runbook não autoriza clientes, migrations,
export hospedado, configuração, cutover ou reset. Datas no fuso America/Sao_Paulo.
Responsáveis funcionais: owner comercial decide interrupção/claims;
plataforma confere release e dependências; operador da estação mantém a Demo;
segurança recebe qualquer suspeita de isolamento. Titulares/substitutos e canal
independente precisam ser nomeados pelo owner até D-7; não foram presumidos.

## Decidir o ambiente antes de abrir a sala

| Resultado | Evidência necessária | Uso permitido |
| --- | --- | --- |
| A | Demo hospedada no SHA exato, banco/Auth/Storage independentes, recovery/classificação aplicáveis, doctor/canário/jornadas/visitantes e candidato GO | Apresentar a Demo hospedada como demonstração sintética; não afirmar Production pronta |
| B | Ensaio efêmero completo no SHA, incluindo recovery, teardown e artifact, **e estação real preparada e testada no mesmo SHA** | Apresentar a stack local sintética mantida ativa pelo operador |
| C | Qualquer prova obrigatória ausente, inconclusiva, recusada ou falha | Não apresentar como backend operacional validado; reagendar a jornada afetada |

Status em 18/10: C para a apresentação. Acesso Vercel 403; Pilot ainda com
schema antigo. Testes locais de backend/recovery não equivalem a B completo.
Um runner destruído não hospeda a contingência. Nunca converter B em A.

## D-7 — 22/10

Owner nomeia titulares e canal, escolhe A ou prepara B. Plataforma confirma
projeto/ambiente/datasource isolados e permissões read-only no scope autorizado.
Se A depender de converter Pilot/legado, seguir `HOSTED_SCHEMA_ROLLOUT.md`:
inventário/classificação, custódia e restore **do mesmo export**, depois
aprovações específicas; nenhum reset para eliminar blockers. Sem tempo ou
provas suficientes, escolher B e preparar a estação com o operador da Demo.

Estação B: Node 24, dependências do lockfile, Docker/Compose funcionais,
psql/age/age-keygen, Chromium, memória/disco conforme preflight, energia e
rede local confiáveis. Reservar as portas e `.state` da Demo ao seu operador;
não executar duas stacks canônicas simultâneas. `scripts/ci-demo/run.sh`
usará recursos fixos: rodar somente após handoff do Claude e numa estação
exclusiva. Preparar toda a stack antes da apresentação, nunca durante a sala.

## D-3 — 26/10

Fixar SHA completo e executar os quatro gates no **mesmo HEAD**. Revisar:

```sh
node --version
npm ci --include=optional
npm run check:all
npm run build
npm run check:security
npm run check:governance
npm run check:supply-chain
npm run audit:ci
npm run deploy:check
npm run merge:gates -- <numero-da-PR>
```

`test:database` somente com `ARANDU_DATABASE_TEST_URL` do cluster descartável
identificado, nunca default 5432 por conveniência. O ensaio B completo segue
`DEMO_RELEASE_REHEARSAL.md` em estação exclusiva: inclui Auth, RLS, Storage,
seed, comprador/provedor, mobile, visitantes, recovery, logs, cleanup e arquivo.
Executar a preparação novamente após o teardown; não assumir que o ensaio
terminou deixando a aplicação disponível. Conferir métricas/erros sem PII.

## D-1 — 28/10

Operador prepara a estação B e deixa o código aprovado e cenário inicial
verificado; usar os procedimentos de `docs/demo/RUNBOOK.md`. Registrar SHA,
hora, resultado e referência protegida dos relatórios, sem `.state`, dumps,
chaves, cookies ou senhas. Não alterar código/schema após o ensaio sem repetir
as provas aplicáveis. Validar as personas de gestão, CFO, leitura e provedor,
a pendência de aprovação, proposta em coleta e documentos privados.

Para A, somente em shell autorizado com configuração própria do alvo (nenhum
secret em argumentos, chat ou git):

```sh
ARANDU_ENV=demo npm run release:candidate:doctor -- --json --expected-commit=<SHA_COMPLETO>
ARANDU_ENV=demo npm run check:live -- https://<alias-demo-autorizado> --expected-commit=<SHA_COMPLETO>
npm run release:candidate:check -- --commit=<SHA_COMPLETO> --evidence=<JSON_PROTEGIDO>
```

Doctor/live são leitura. Canário, jornadas, recovery e seed/reset têm efeitos;
executar somente no escopo e janela aprovados. O JSON do candidato exige
`hosted_readiness` (contrato abaixo), além das demais provas existentes.
Nenhum resultado anterior autoriza operação hospedada sensível.

## D-0 — 29/10, cerca de 30 minutos antes

```sh
git rev-parse HEAD
git status --porcelain
```

HEAD precisa ser o aprovado e a árvore limpa. Confirmar app/portas/serviços e
observabilidade, dados sintéticos e ausência de operação anterior pendente.
Na estação canônica, **pelo operador após handoff**, executar:

```sh
bash scripts/demo/local.sh readiness --smoke
```

Ler `readiness.json` e `readiness.md`, incluindo modos leitura/interativo,
SKIP/WARN e comandos recomendados. O aviso de readiness **hospedada** na stack
local não prova A; persona/smoke/Storage/seed falhando bloqueiam B. Concluir o
smoke com antecedência e respeitar a janela de cota; não iniciar a sessão com
rate limit esgotado. Não rodar reset durante a apresentação.

Smoke humano: gestão abre solicitação/comparação factual; CFO encontra sua
aprovação; provedor vê só seu convite/proposta; leitor não oferece escrita;
documento privado abre somente pelo caminho autorizado. Operador confere
request IDs e dependências. Qualquer escrita do ensaio deve ter intenção e
idempotência conhecidas; não repetir clique após resposta incerta.

## Falha durante a sala

| Sinal | Ação imediata / recuperação segura |
| --- | --- |
| Auth timeout, 401/403 inesperado | Interromper a jornada; confirmar ambiente/sessão/papel; autenticar novamente pelo fluxo normal. Não abrir grants ou senha alternativa para SSO obrigatório |
| 409 / versão alterada | Recarregar condições, comparar versão e pedir nova decisão humana. Não reaproveitar aprovação automaticamente |
| Timeout após escrita / 5xx | Resultado incerto: consultar objeto/auditoria pela intenção. Reusar chave idempotente somente quando o contrato permitir; nunca anunciar concluído |
| 429 | Respeitar Retry-After e interromper a jornada até a janela; não trocar IP/persona para contornar cota |
| Schema/RPC incompatível ou readiness 503 | Parar escrita; comparar SHA/marker e abrir triagem. Sem migration improvisada nem fallback service role |
| Storage/documento falhou | Não tornar bucket público nem compartilhar URL externa. Interromper a jornada documental e investigar autorização/objeto |
| Suspeita cross-tenant ou dado real | Interromper apresentação, isolar superfície e acionar segurança/owner; preservar só IDs e evidência sanitizada |
| Hospedagem fora | Migrar para B somente se estação e SHA já validados e disponíveis; senão C. Não usar sandbox legado como substituto silencioso |

Depois da sessão, operador guarda relatório sanitizado e remove somente seus
recursos descartáveis conforme o runbook; falha de teardown/arquivamento
invalida o ensaio. Recovery/rollback/forward-fix seguem o procedimento aprovado,
sem apagar histórico ou resetar projeto. Nenhum SLA/RPO/RTO/certificação,
recomendação financeira automática ou autorização de dados de clientes pode
ser afirmado a partir desta demonstração.

## Contrato da prova de readiness hospedada

No JSON v3 existente do candidato, incluir `hosted_readiness` com as mesmas
identidades `environment`, `project_ref`, `commit`, `schema_version`,
`evidence_level: hosted`, `reference` opaca e `observed_at` recente (máximo 24 h,
posterior ao restore/migration), `result: PASS`, `ready: true`, `http_status: 200`,
`datasource: supabase`. `checks` deve conter PASS para `release_identity`,
`topology`, `schema`, `critical_rpcs`, `supabase_auth`, `auth_settings`,
`supabase_rest`, `environment_marker`, `storage`; falha adicional também recusa.
Preencher com observações reais do deployment e doctor, nunca copiar fixture.
O assessor valida consistência declarada; não autentica a origem da evidência.
Readiness confere catálogo versionado, não bodies/grants/hooks: os probes SQL e
HTTP diretos de sessão/tenant/Storage continuam obrigatórios para A/M3.
