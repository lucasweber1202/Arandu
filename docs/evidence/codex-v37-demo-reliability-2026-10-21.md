# V3.7 — confiabilidade da apresentação, 21/10/2026

Base atualizada e confirmada: `main@ca8792925bc0fbd11481c707c7704ec7a93701b8`.
Branch exclusiva: `codex/v37-demo-reliability`. Horários operacionais em
America/Sao_Paulo; JSONs preservam ISO UTC. CI próprio e commit final ficam na
PR, pois um commit não pode conter seu próprio SHA. Sem merge automático.

## P0-A PUBLIC

**PUBLIC_SHAREABLE: PASS** para a visita informativa/simulação publicada em
https://arandu-demo.vercel.app/, observada em 21/10 às 10:54 BRT
(`2026-10-21T13:54:38.322Z`). **CANONICAL_HOSTED_M3: BLOCKED**.

| Prova | Resultado e limite |
| --- | --- |
| Deployment | Status GitHub Vercel `arandu-demo` success no SHA base; `dpl_7kjo4ffuQY3i2SPK8z1oASrvbvXu`. Detalhe Vercel/alias administrativo: ACCESS_BLOCKED 403 |
| Domínio efetivo | Raiz HTTPS 200, sem redirecionamento ou autenticação Vercel; URL final igual ao domínio solicitado |
| Identidade | Manifesto e health: main, SHA completo esperado, synthetic-fixtures, sem misconfiguration |
| Artefato | 159 arquivos do manifesto conferidos por tamanho e SHA-256; referências HTML/JS/CSS e chunks incluídos |
| Renderização | Chromium do lockfile, 1440×900 e 390×844; 17 etapas por viewport, comprador/instituição/cinco áreas/retorno |
| Deep links e recursos | Enter em links reais, recarga direta em cada etapa, imagens e fontes carregadas, sem overflow horizontal ou erro JS/rede observado |
| Rotas aposentadas | Cinco sondas existentes do check:live retornaram 404/410, sem promoção/redirecionamento canônico |
| Verdade demonstrativa | Entrada distingue visita informativa, simulação no navegador e backend ao vivo indisponível neste link; visita diz que nada é gravado/enviado/executado |

Reprodução pelo único smoke existente (não foi criado outro verificador):

```bash
node scripts/public-tour-proof-flow.mjs <SHA_COMPLETO_APROVADO> /tmp/arandu-flow.json
npm run smoke:public-demo -- --url=https://arandu-demo.vercel.app --sha=<SHA_COMPLETO_APROVADO> --browser --performance --flow=/tmp/arandu-flow.json
```

Relatório por URL/rota/status/hash, falhas e capturas:
[public-proof.json](codex-v37-demo-reliability-2026-10-21/public-proof.json).
[Fluxo executado](codex-v37-demo-reliability-2026-10-21/public-flow.json).
Todas as 34 capturas estão em `reports/public-demo/` no executor; quatro amostras
duráveis estão em [public/](codex-v37-demo-reliability-2026-10-21/public/), incluindo
[entrada desktop](codex-v37-demo-reliability-2026-10-21/public/desktop-root.png) e
[instituição mobile](codex-v37-demo-reliability-2026-10-21/public/mobile-provider.png).
As referências `reports/` do JSON apontam aos originais locais.

Melhorias: raiz independente do manifesto; rota em execução registrada antes da
requisição; status HTTP, destino efetivo e cadeia de redirects; detecção explícita
de redirect de autenticação; recusa de rotas aposentadas promovidas; captura de
falha na etapa/viewport correta. Falha de confiança TLS do executor ou navegador
ausente vira NOT_PROVEN, nunca sucesso artificial ou diagnóstico de defeito do site.

A primeira renderização falhou por `ERR_CERT_AUTHORITY_INVALID` no proxy do
executor. Foi resolvida importando a CA pública da sessão no NSS **no mesmo
processo de execução autorizado**; validação TLS permaneceu ligada. Execução final:
91,1 s, 34 etapas PASS. A prova HTTP anterior sem navegador ficou NOT_PROVEN,
conforme o contrato. Nenhum bypass de Deployment Protection foi usado.

O tour usa representações informativas e conteúdo sintético: PASS não comprova
Auth, RLS, documentos privados ou persistência hospedada. O relatório lab contém
uma amostra por etapa/viewport, sem RUM, INP ou percentis representativos.

## P0-B STATION

**STATION_NOT_VERIFIED**: a máquina Windows/WSL2 definitiva não foi acessada.
O preflight deste Linux efêmero deu **BLOCKED**, não READY.
[Relatório sanitizado](codex-v37-demo-reliability-2026-10-21/station.json).

Risco reproduzido contra o classificador da main: um relatório com commit
`cccc…` recebia READY, mesmo com HEAD/congelamento `aaaa…`. A regressão nova
falha nessa baseline (`esperado PREPARED, veio READY`) e passa com a correção.

Antes, station extraía PRONTO do Markdown e idade pelo mtime. Agora consome
`readiness.json`, com timestamp da observação, SHA, hostname, hash do lockfile,
árvore limpa, smoke executado e leitura sem SKIP. Relatório antigo, copiado de
outra máquina/commit, futuro, inválido ou sem smoke dá PREPARED. Interativo pode
ficar não pronto sem impedir uma apresentação somente leitura devidamente provada.
O relatório é evidência local declarada, não atestado criptográfico de origem.

Health 200 com identidade ausente, sandbox ou configuração inconsistente bloqueia;
o banco precisa do marker esperado pelo doctor (`financial-external-proposals-1`).
O marker não prova bodies/grants/hooks; testes de banco e jornadas continuam
necessários. Executor Codex cloud é explicitamente efêmero, mesmo com freeze.
Foi removida a sugestão de `git reset --hard` para consertar CRLF.

Procedimentos lidos integralmente antes das alterações: setup, station, freeze,
readiness, prepare-station, resume; seed/check e contratos de Auth/API/Storage.

| Execução nesta rodada | Resultado |
| --- | --- |
| `bash scripts/demo/local.sh station` | 20/BLOCKED: sem stack canônica, psql, certificado, seed e pool; executor efêmero identificado |
| `bash scripts/demo/local.sh freeze --station` | 20, recusado por árvore de trabalho alterada; nenhum freeze criado |
| `bash scripts/demo/local.sh readiness --smoke` | 1, estado local ausente; nenhum login/readiness inventado |
| `bash scripts/demo/local.sh` / setup | NOT_RUN: chama seed --reset; não usado como conserto automático |
| resume / interrupção da stack canônica | NOT_RUN: não há contêineres/estado canônicos nesta estação; não substituídos por fixtures de browser |
| Backend financeiro sintético PostgreSQL | PASS em cluster Docker exclusivo; não equivale à stack Auth/REST/Storage nem à máquina do owner |

### Execução na máquina definitiva

No WSL2, clone no disco Linux (fora de `/mnt/c`), Node 24 e npm do Linux,
lockfile atual, Docker Desktop com integração WSL2, Compose, psql/openssl/curl/
pgrep e Chromium do lockfile. Mínimos existentes preservados: 2 CPUs, 6 GiB RAM,
10 GiB livres; portas 54322/9999/3000/5000/8443/4443 livres ou da própria stack.
Não reutilizar `.state`/node_modules de outra máquina. Certificado deve ser
aceito no navegador Windows e encaminhamento localhost do WSL deve funcionar.

1. D-3 (26/10): SHA aprovado com os quatro gates, árvore limpa e estação exclusiva;
   seguir [OPERATOR_29-10](../demo/OPERATOR_29-10.md). Preparar dependências e stack
   uma vez, com ciência de que setup semeia/recria o cenário sintético. Havendo
   estado existente, usar resume e investigar divergência, sem reset automático.
2. `bash scripts/demo/local.sh freeze --station` na própria máquina; conferir
   SHA e lockfile. Um relatório de readiness anterior ao novo formato precisa
   ser refeito, não convertido/editado à mão.
3. D-1 (28/10): retomar, provisionar somente o pool sintético identificado,
   ensaiar comprador/CFO/leitor/provedor e documento privado conforme operador.
   Parar/retomar a própria stack e comprovar a mesma identidade/dados preservados.
4. D-0 (29/10): `bash scripts/demo/local.sh resume`, depois
   `bash scripts/demo/local.sh readiness --smoke` e
   `bash scripts/demo/local.sh station`. Guardar JSON+Markdown. READY exige
   observação de até 120 min e identidade coincidente. Abaixo de READY, seguir
   diagnóstico/Plano C, sem reset, mudança de RLS, cota ou retry para esconder erro.
5. Respeitar a janela sem ensaios/cotas do cartão do operador antes da reunião.
   `station --fast` omite seed e por isso não certifica READY. Encerrar/destruir
   somente recursos descartáveis próprios, após a sessão e preservação necessária.

Personas, permissões e arquivos privados do roteiro precisam ser provados nessa
máquina; resultado verde de SQL/CI efêmero não supre essa evidência.

## P1 FINANCIAL

Sem alteração de views, domínio financeiro, API ou SQL. Reutilizadas as suites da
PR #250 e o motor canônico de comparação, sem segunda regra de cálculo.

| Invariante | Evidência sintética |
| --- | --- |
| RLS organização/entidade; buyer/provider; papéis | `financial-external-proposals.sql`, canário integral e negativas de API |
| Append-only, expected_version, retry, revisão | SQL e `external-proposal-concurrency.mjs`: seis criações → uma versão; seis confirmações → um recibo; uma correção obsoleta conflita |
| Autorização após espera por lock | Revogação durante disputa recusa revisão, sem recibo parcial |
| Persistência ou erro verdadeiro | Trigger de falha SQL desfaz estado/recibo; novas negativas API não enviam ACK |
| Documento privado/metadados | SQL recusa arquivo alheio/indisponível; remoção impede uso corrente; hash ausente não inventado; não valida bytes ou autoria bancária |
| Ausentes/moedas/comparação | Paridade de catálogo SQL/JS, ausência não vira zero/BRL, proveniência e pesos do mesmo motor |
| Fonte externa e decisão | buyer_recorded_external; instituição não autenticada pelo registro; decision_allowed=false; decisão/contrato externos 409; snapshot canônico imutável |
| 400/403/404/409/413/422/429/503 | Suite API existente ampliada em erros antes pouco cobertos: acesso negado, detalhe ausente/rota, payload, cobertura, rate limit, RPC ausente e outage |

Suite completa PostgreSQL 17.11 em `arandu-v37-db`, sem porta publicada ou credenciais
hospedadas: clean install, upgrade, reapply, rollback, canário e concorrência PASS.
Canário final: 128 pessoas sintéticas, 11.482 verificações, zero vazamentos.
O contêiner exclusivo foi removido com seu volume após as provas; não é estação
de apresentação. Imagem oficial `postgres:17-bookworm`, digest
`sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27`.

### Contrato para Claude

O handoff de [EXTERNAL_FINANCIAL_PROPOSALS_V37](../EXTERNAL_FINANCIAL_PROPOSALS_V37.md)
permanece válido: ACK novo 201/replay 200; recarregar detalhe após mutação;
retry mantém request_key/expected_version/intenção; 409 exige releitura e revisão
humana, sem atualizar versão automaticamente; provenance.decision_allowed=false
impede seleção/contrato. O contador legado de propostas não inclui a fila externa.
Ausência de documento é not_presented, nunca arquivo disponível; hash é metadado
não verificado contra bytes. Confirmar transcrição não autentica o banco.

Nuance existente: se a organização lida é PROVIDER, a validação de tipo pode
retornar 400 antes da RPC; papel insuficiente na RPC retorna 403. Não depender
de um único status para ocultar/esvaziar o formulário. Ambos recusam sem ACK.
503/schema_incompatible pede interromper o fluxo, não fallback privilegiado.
Nenhuma discrepância que exija mudar a API foi demonstrada nesta rodada.

## PRODUCTION

**ACCESS_BLOCKED**, causa exata do build hospedado **NOT_PROVEN**.
GitHub associa failure de `arandu` ao SHA base:
`dpl_48C5pZ7659KegcJVq7z19JH3zZcw`. O erro BUILD_UTILS_SPAWN_1 /
`npm run vercel-build` veio do contexto anterior; não substitui logs atuais.

Leituras do projeto, deployment, listagem e eventos retornaram 403 no mesmo
escopo `lucas-projects467` / `team_BBpDcLVx5izJjXz5qBEq2cRy`.
Eventos: request `gru1:sfo1::2dgx9-1792590813242-ba5981325fa2`.
CLI Vercel não instalada; nenhum login pessoal, escopo alternativo ou bypass.

Código auditado: vercel-build exige ambiente explícito e executa
check-finance-env antes de deploy:check. ACTIVE_SUPABASE_ASSIGNMENTS.production
vazio impede estruturalmente um build de Production configurado com Supabase,
e demo permanece igualmente sem atribuição. Isso é uma guarda intencional
demonstrada pelos testes, **não causa conclusiva do deployment remoto**.
Sem logs não se distingue primeira falha do guard, dependência, build, quota,
schema, configuração, publicação ou alias. Nenhuma proteção foi removida.

Ação mínima do owner: conceder ao conector Vercel leitura no team existente,
ou obter em terminal próprio autorizado os logs do deployment acima via
`vercel --scope lucas-projects467 inspect dpl_48C5pZ7659KegcJVq7z19JH3zZcw --logs`.
Compartilhar somente a primeira falha sanitizada, sem env/secrets. Depois
reconciliar o contrato daquele SHA. Nenhum deploy manual de Production autorizado.

## M3

**BLOCKED**. [Doctor somente leitura](codex-v37-demo-reliability-2026-10-21/m3-doctor.json)
reutiliza contratos existentes e inventário de 19/10, explicitamente antigo e
insuficiente para conversão atual. Não foi renovado com dados inventados.
Listagem Supabase atual confirma apenas Pilot e legado ACTIVE_HEALTHY, PostgreSQL
17; não comprova autorização como Demo/Production nem saúde funcional do schema.

| Ordem | Pré-condição / ação futura | Autorização |
| --- | --- | --- |
| 1 | Nomear owner/custódia, reler inventário exato public/Auth/MFA/Storage/config e classificar PII/cliente/holds | Leitura agregada autorizada; classificação/retention decididas pelo owner |
| 2 | Preparar PG17, age verificado, chaves separadas, destino privado durável e plano de rollback; recovery:doctor / backup:preflight | Não gerar/exportar material hospedado sem aprovação específica |
| 3 | Exportar conjunto aprovado, cifrar, hashes/custódia e binários de Storage/configuração necessários | Aprovação explícita de origem/destino/janela |
| 4 | Restaurar **o mesmo export** isolado, reconciliar schema/dados/ACL/RLS/Auth/binários/config e probes | Aprovação específica do restore e descarte |
| 5 | Gerar bundle atual do manifesto; revisar migrations/decommission, reconstrução e rollback; consolidation:check | Geração/avaliação somente leitura; aplicação depende da etapa anterior e aprovação |
| 6 | PR de cutover com quatro gates e identidade comprovada; atribuir Demo somente após preservação/conversão | Aprovação do owner; não ativado nesta PR |
| 7 | Configurar Demo própria, Auth/RLS/Storage/secrets/URL/cron; seed oficial sintético e pool por APIs reais | Mutações hospedadas explicitamente autorizadas |
| 8 | Doctor com SHA, canário/probes, readiness, jornadas comprador/provedor/visitantes desktop/mobile e observabilidade; release:candidate:check | Canário/jornadas têm efeitos e requerem escopo aprovado |
| 9 | Substituir sandbox apenas com domínio/candidato comprovados; Production separada e retirada de Pilot somente após inventário de dependências zero | Aprovações separadas; preservar Pilot e legado até lá |

Comandos/contratos: [workflow](../FINANCIAL_DEPLOYMENT_WORKFLOW.md),
[consolidação](../TWO_ENVIRONMENT_CONSOLIDATION.md),
[recovery](../SUPABASE_ENCRYPTED_PRESERVATION.md),
[rollout](../HOSTED_SCHEMA_ROLLOUT.md). Nenhum export/restore/migration/seed/reset/
cutover hospedado, secret, política de acesso ou infraestrutura foi alterado.

## Validação, limitações e recuperação

- `npm ci --include=optional`: PASS, lockfile preservado; Node 24.19.0.
- `npm run check:all`: PASS final com umask 022 e diretório de testes do operador
  gravável. Tentativa inicial: EROFS em fixture sob home; segunda: umask 077
  convertia a fixture intencional 0644 em 0600. Negativo de permissão foi mantido,
  contexto corrigido e testes afetados aprovados; nenhuma assertion ignorada.
- `npm run build`, `check:build-size`, `check:dist-assets`: PASS; budgets preservados.
- `deploy:check`: tentativa inicial falhou no mesmo negativo de permissões por
  umask 077. Reexecução com umask 022 e origem HTTPS sintética apenas para SEO
  local; resultado final registrado na PR. Não é deployment nem mudança hospedada.
- `npm run audit:ci`: PASS, zero vulnerabilidades; `sbom:ci`: PASS.
- Testes station/publication/finance-external-proposals: PASS; publicação tem
  nove testes Node, zero skipped. Regressão browser local: 15 etapas × dois
  viewports PASS; mantém PUBLIC_SHAREABLE NOT_PROVEN no laboratório. Negativa
  adicional de link ausente exige FAIL na etapa/viewport, com mobile NOT_RUN.
- Smoke público: PASS conforme P0-A; apenas Chromium, não matriz Firefox/WebKit.
- Banco completo: PASS; primeira tentativa parou porque a cópia da fixture não
  incluía ops/sql; segunda incluiu o diretório e concluiu, sem mudar a suite.
- Freeze/readiness/setup/resume: resultados e NOT_RUN explícitos em P0-B.
- `test:e2e:list`: 1.225 testes listados, não executados. Suites financeiras e
  presentation completas locais: NOT_RUN; seus gates remotos continuam obrigatórios.
- Recovery real cifrado PG17/age local: NOT_RUN nesta rodada; PR #251 preservada;
  gate database do CI deve exercitá-lo no HEAD próprio. Backup hospedado: NOT_RUN.
- `benchmark:domain`: PASS final, resultado em
  [domain-performance.json](codex-v37-demo-reliability-2026-10-21/domain-performance.json).
  Primeira tentativa parou em spawn git EPERM no sandbox restrito; execução com
  acesso explícito concluiu. CPU sintética, sem promessa de latência API/capacidade.

Logs de execução originais: `/tmp/arandu-check-all-verified.log`,
`/tmp/arandu-build.log`, `/tmp/arandu-database.log`, `/tmp/arandu-public-final.log`,
`/tmp/arandu-browser-regression.log`, `/tmp/arandu-station-negative.log`,
`/tmp/arandu-freeze.log`, `/tmp/arandu-readiness.log`. São locais/efêmeros;
conclusões e JSONs sanitizados acima são a evidência versionada.

Riscos residuais da sala: timeout/5xx após escrita pede consultar estado e manter
a chave da intenção; 409 exige releitura; 429 respeita janela/Retry-After; documento
privado falho interrompe a jornada, sem bucket público; readiness após reinício
precisa ser refeita no SHA/máquina corretos. Não houve alteração de retries,
thresholds, CI, dependências ou código financeiro para mascarar esses riscos.
Rollback de código desta PR não muda banco; desfaz as novas proteções de evidência
e portanto deve ser revisado antes de voltar a certificar uma estação.
