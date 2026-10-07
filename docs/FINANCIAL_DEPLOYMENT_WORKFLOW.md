# Fluxo de deployment e release — Demo e Production

Decisão normativa do owner em 07/10/2026: somente dois ambientes hospedados
permanentes, da mesma main. Pilot é **release validation stage**.

## Topologia alvo e transição

| Papel | Vercel | ARANDU_ENV | Supabase planejado | Estado atual |
|---|---|---|---|---|
| Demo | arandu-demo | demo | offgpyysgdhfemjlchod após conversão | ainda sandbox; banco ainda Pilot |
| Production | arandu | production | igacnfjeuqhxcmfyepgj após reconstrução | legado preservado; release antiga |
| Pilot histórico | arandu-pilot | pilot (compatibilidade) | offgpyysgdhfemjlchod atual | TO_BE_DECOMMISSIONED |

Destino planejado não é configuração ativa. `lib/deployment-topology.mjs`
separa ambos. Guards continuam recusando Demo no banco ainda Pilot e Production
no legado até a conversão verificada. Não mudar os arrays apenas para obter GO.
Demo e Production nunca compartilham dados, Auth, Storage, service role, cron ou secrets.

## Código e promoção

1. feature/fix nasce da ponta atual de main e abre PR para main.
2. database, deploy-boundaries, validate e presentation precisam ser success no HEAD exato; PR contém a ponta atual da base. Rodar merge:gates antes do merge.
3. main publica Demo canônica com API/Auth/RLS reais e Vitta Foods sintética.
4. Validar candidato: doctor com SHA esperado, canário, seed/reset, jornadas desktop/mobile, recovery real, observabilidade e exercício operacional.
5. `release:candidate:check` avalia o contrato v3 na Demo; não exige terceiro projeto/banco permanente. Preview temporário serve a ensaio, não substitui prova hospedada completa.
6. Production recebe o mesmo SHA aprovado, migrations na ordem, banco próprio e recovery aplicável. Rodar release:check e gates de produção; nunca promover por READY isolado.

## Gates e comandos

```bash
npm run merge:gates -- <PR>
npm run consolidation:check -- --environment=demo --evidence=<JSON_SEGURO>
npm run release:candidate:doctor -- --json --expected-commit=<SHA_COMPLETO>
npm run release:candidate:canary
npm run release:candidate:restore:drill
npm run release:candidate:check -- --commit=<SHA_COMPLETO> --evidence=<JSON_SEGURO>
npm run release:check
```

Os nomes históricos pilot:doctor/canary/restore/release permanecem por
compatibilidade, sem designar infraestrutura permanente. `PILOT_SOURCE_DATABASE_URL`
é um nome legado de variável de conexão administrativa usado no ensaio de recovery;
`PILOT_DATABASE_URL` identifica a origem do canário. Não registrar seus valores.
Os ensaios locais/containers são descartáveis, não terceiro ambiente hospedado.

`/api/health` publica somente runtime/ambiente/datasource/branch/SHA. É liveness,
sem garantia de readiness. Doctor remoto exige main e SHA completo; usar
--expected-commit para o SHA exato. Sandbox ou identidade inconclusiva é NO-GO.

## Conversão dos slots

Seguir `TWO_ENVIRONMENT_CONSOLIDATION.md`: inventário exato de public/Auth/Storage,
classificação de dados, export com hash, restore real e plano de reconstrução.
Não apagar/refazer projeto com PII ou dados necessários. Nunca copiar dados reais
para Demo. Clean install vem do manifesto atual, não de contagem histórica.

Depois de reconstruir Demo: configurar ARANDU_ENV=demo, URL/chaves próprias,
CRON_SECRET próprio, ARANDU_SITE_URL e ARANDU_DEMO_PASSWORD. Remover
ARANDU_DEPLOYMENT_KIND somente no cutover validado. Seed exclusivamente pelo
mecanismo canônico; reset somente escopo marcado e fictício.

Depois de reconstruir Production: atualizar atribuição ativa, configurar suas
chaves/Auth/Storage/cron. Nenhum usuário/persona/secret da Demo é copiado.

## Decommission

Antes de remover arandu-pilot ou a branch pilot: Demo funcional, provas exigidas,
inventário de aliases, jobs, automações e scripts; zero consumidores do projeto
antigo e da branch. Até lá, marcar TO_BE_DECOMMISSIONED e preservar compatibilidade.
A branch pilot não recebe novos commits. Não atualizar seu alias como objetivo final.

## Migrations, rollback e evidência

Migrations só após recovery real; não atravessar boundary destrutivo sem export
verificado e acknowledgment. Rollback SQL segue docs/rollback; se perder dado,
forward-fix ou restore verificado. Revert de código não reverte banco automaticamente.
Blueprint de release permanece protegido por predeploy/release:check; deploy técnico
não substitui release aprovado. Nenhum seed/reset ocorre em build/deploy/postinstall.

Registrar SHA, schema, datasource e evidência reais em IMPLEMENTATION_MATRIX.md.
Não promover M2 com CI falho, M3 com sandbox, M4 com fixture ou M5 por deployment.
Histórico anterior: HOSTED_ALIGNMENT_2026-10-06.md e HOSTED_ALIGNMENT_2026-10-07.md.
