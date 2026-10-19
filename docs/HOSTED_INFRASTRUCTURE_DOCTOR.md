# Diagnóstico consolidado da infraestrutura hospedada

Composição somente leitura dos contratos existentes: Stage 0, finance:env:check,
consolidation:check, recovery:doctor, readiness pública e release:candidate:check.
Não é um novo sistema de aprovação. Não executa SQL, RPC, export, restore, seed,
reset, migration, cutover ou alteração de configuração. Nenhuma saída autoriza
essas operações; `release_ready` e `cutover_authorized` permanecem false.

## Uso

```sh
node scripts/hosted-infrastructure-doctor.mjs --environment=demo --commit=<SHA_COMPLETO> --evidence=<INVENTARIO_JSON>
node scripts/hosted-infrastructure-doctor.mjs --environment=production --commit=<SHA_COMPLETO> --evidence=<INVENTARIO_JSON> --vercel-observation=<OBSERVACAO_JSON>
```

JSON vai para stdout; saída 1 indica bloqueios. Argumento desconhecido/duplicado,
documento inválido ou maior que 128000 bytes falha fechado, sem imprimir caminho
ou conteúdo. Pode redirecionar stdout para um arquivo novo de relatório.

`--live` acrescenta somente GET `/api/health?probe=ready` na origem HTTPS de
ARANDU_SITE_URL. A origem não pode conter caminho, credenciais, query ou fragmento;
redirecionamentos não são seguidos, corpo limitado a 64 KiB e timeout de 5 s.
Não envia chaves, cookies ou Authorization. Em ambientes Node que exijam proxy,
usar o suporte oficial `NODE_USE_ENV_PROXY=1` sem remover o proxy herdado.

As variáveis financeiras e de recovery são lidas **do executor local**, não da
Vercel. `required_presence` nunca declara presença/ausência de secrets remotos.
O checker financeiro existente roda com o ambiente alvo declarado, mas somente
seu código de saída, presença e papéis estruturais são projetados no relatório.
O preflight de recovery não conecta ao banco e não prepara armazenamento.

`--candidate=<JSON>` avalia a prova v3 pelo assessor existente; não autentica a
origem do documento. Uma prova Demo não aprova Production: nesse contexto o
resultado do release permanece NOT_PROVEN e exige release:check separado.

Observação Vercel é um documento mínimo com environment, project, commit,
observed_at e http_status. Precisa pertencer ao projeto/ambiente/SHA solicitado,
estar no passado e ter até 24 h. Um 401/403 vinculado vira ACCESS_BLOCKED.
Outras respostas não comprovam configuração/logs e permanecem NOT_PROVEN.
Não rotular observação de arandu como leitura de arandu-demo; uma negação de
escopo pode bloquear a investigação inteira, sem comprovar cada projeto.

## Interpretação

Cada item inclui id, ambiente, categoria, severidade, resultado, evidência,
dependência, ação, responsável, necessidade de autorização e segurança da
execução automática. PASS em configuração ou geração de bundle não é PASS de
backup, backend ou release. NOT_RUN/NOT_PROVEN/ACCESS_BLOCKED não permitem GO.
`evidence_origin_authenticated=false` explicita o limite das provas importadas.

Readiness só passa com HTTP 200 e contrato público correto de ambiente,
datasource Supabase, branch main e SHA exato. Observação expira após cinco
minutos; liveness, fixture, erro, resposta excessiva e falta de identidade falham.

Inventário/classificação/export/restore continuam regidos por
`TWO_ENVIRONMENT_CONSOLIDATION.md`. O plano agora exige correspondência com o
hash do cleanInstall produzido pelo **gerador canônico da árvore atual**.
Falha do gerador ou ausência de contexto bloqueiam. Referências reservadas
pending/TODO/TBD/placeholder/NOT_RUN não são comprovantes de export ou rollback.

O comando existente consolidation:check também compara o bundle atual. O
gerador roda em --stdout, sem escrever SQL ou reports. Não editar hashes antigos
para disfarçar drift; regenerar o plano e revisar a mudança de schema.

Snapshot atual, classificação e ações externas:
`evidence/codex-hosted-blockers-2026-10-19.md`.
