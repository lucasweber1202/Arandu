# Gate de evidência do Pilot

```bash
npm run pilot:release:check -- --evidence=/caminho/seguro/evidence.json --commit=<SHA-exato>
```

O comando avalia evidência registrada pelo operador; não executa backup,
restore, migrations, doctor ou jornada e não autentica automaticamente a origem
dos comprovantes. Um JSON sintaticamente válido não é prova hospedada.
As referências precisam resolver para comprovantes reais, sob controle de
acesso, revisados pelo responsável. Fixtures dos testes nunca são evidência.

O gate exige identidade `pilot`, projeto `offgpyysgdhfemjlchod`, hostname
correto, Vercel `arandu-pilot`, SHA exato, marker esperado, backup identificado
por SHA-256, restore descartável do mesmo backup com comparação/probes e
duração observada, aplicação do bundle depois do restore, inventário legado,
export verificado e decisão específica do owner antes da remoção destrutiva.
O ack precisa ser `export-verified:<referência>`; o gate nunca o gera.

Doctor GO, canário completo e jornada autenticada com transporte real precisam
de observação posterior ao restore e à aplicação. Todas as observações têm
janela máxima de 24 horas e não aceitam datas futuras. Cada comprovante é
vinculado ao mesmo ambiente, projeto e commit. Uma lista vazia de blockers P0
é uma declaração explícita do responsável, não descoberta automática.

Resultado binário: `PILOT GO` ou `PILOT NO-GO`, exit code 0 ou 1. O relatório
`reports/pilot-release.json` contém somente motivos controlados e o SHA válido;
não replica dados de entrada, URLs, credenciais ou mensagens do documento.
Entrada inválida também sobrescreve um GO anterior com NO-GO.

## Contrato de entrada v1

Chaves da raiz: `format_version: 1`, `environment`, `project_ref`,
`database_hostname`, `vercel_project`, `commit`, `schema_before`, `schema_after`,
`deployment`, `backup`, `restore`, `migration`, `legacy_art_decommission`,
`doctor`, `canary`, `authenticated_journey`, `p0_blockers`.

Cada observação (`deployment`, `backup`, `restore`, `migration`, `doctor`,
`canary`, `authenticated_journey`) inclui `environment`, `project_ref`, `commit`,
`evidence_level: hosted`, `reference` (ID opaco sem URL/segredo), `observed_at`
(ISO UTC). Campos adicionais:

| Registro | Campos obrigatórios |
| --- | --- |
| deployment | `state: READY`, `target: production`, `branch: main` (desde 06/10/2026 o staging publica a `main` canônica), `project: arandu-pilot`, `schema_version` final |
| backup | `result: PASS`, `sha256`, `schema_version` anterior |
| restore | `result: PASS`, `target_kind: disposable`, `schema_version` anterior, `backup_sha256`, `post_restore_probes: PASS`, `row_comparison: PASS`, `duration_ms` positivo finito |
| migration | `result: PASS`, `schema_before`, `schema_after`, `bundle_sha256`, `started_at` depois do restore; `observed_at` depois do início |
| legacy_art_decommission | `environment`, `project_ref`, `inventory_rows` inteiro não negativo, `export_verified: true`, `export_reference`, `owner_decision_reference`, `ack`, `acknowledged_at` antes da aplicação |
| doctor | `result: GO`, `schema_version` final, `errors: 0`, `unsafe: 0` |
| canary | `result: PASS`, `schema_version` final, `probes` com cada probe PASS |
| authenticated_journey | `result: PASS`, `transport: real`, `schema_version` final, `steps` com cada etapa PASS |

Probes: `tenant_isolation`, `entity_isolation`, `graph`, `rfq`, `contract`,
`governance`, `value`, `fees`, `opportunities`.

Etapas: `login`, `workspace`, `entity`, `rfq`, `proposal_compare`,
`decision_approval`, `contract`, `provider`, `portfolio`, `value`, `fees`,
`opportunities`, `governance`, `logout`.

O gate complementa o doctor e a disciplina de merge. Não substitui rulesets,
review do SQL, revisão jurídica, autorização de dados ou
`npm run merge:gates -- <PR>` imediatamente antes de qualquer merge.
