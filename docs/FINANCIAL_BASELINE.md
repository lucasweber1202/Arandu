# Instalação financeira direta e upgrade histórico

Baseline v1 derivada de `main@4ce81537780fa0f0ba0055664db792b473444b49`.
É um caminho adicional, sem alterar as 84 migrations de `cleanInstall` nem a
sequência `existingDatabase`. Não autoriza conversão hospedada.

## Escolha do caminho

| Situação | Caminho |
|---|---|
| Supabase novo com schema de aplicação vazio | `npm run migrations:bundle -- --flow=financialBaseline` |
| Pilot ou legado existentes | `existingDatabase`, após inventário, classificação, recovery e aprovação |
| Reprodução histórica / auditoria | `cleanInstall` preservado |
| Recovery de dados | restore do mesmo backup privado verificado; baseline não substitui backup |

O bundle financeiro aplica o snapshot e depois qualquer migration futura
acrescentada ao manifesto após seu prefixo. O descritor em
`baselines/financial-v1.json` fixa cada arquivo histórico por SHA-256, a ordem,
o marker e o hash do SQL compilado. Drift do prefixo, marker ou snapshot recusa
a geração. Não se aceitam `--after-schema` ou saltos nesse caminho.

O snapshot cria diretamente os objetos financeiros e os nove componentes
compartilhados de rate limiting/outbox; não cria e remove artistas, obras,
pedidos ou catálogo. `fin_member_default_name` usa apenas o nome de exibição
da conta em Auth; isso não concede papéis ou autorização por user_metadata.

## Pré-requisitos e limites

Necessita dos papéis e serviços gerenciados Supabase: `postgres`, `anon`,
`authenticated`, `service_role`, `authenticator`, `auth.users`, `auth.uid()`,
`storage.buckets` e pgcrypto no schema `extensions`. A baseline não instala
GoTrue, Storage, PostgREST, redirects, OAuth ou secrets de plataforma.

A instalação recusa relações/funções de aplicação existentes e triggers de
usuário em `auth.users`, antes de alterar objetos. A recusa preserva dados e
gatilhos. Reaplicação da baseline é **recusada**, deliberadamente; upgrades
posteriores continuam idempotentes pelas migrations históricas. Não é reset.
Toda instalação é transacional, cria seu próprio `invite_secret`, configura
o bucket privado de 10 MiB e o hook de sessão do PostgREST. Não copia segredo
gerado no compilador, evidência de aposentadoria nem registros de produto.

Antes de recriar os objetos, restaura defaults PostgreSQL para tables/functions/
sequences dos três papéis de API; ao final restaura os default ACLs canônicos.
Isso evita grants anônimos herdados dos defaults Supabase que `pg_dump`, sozinho,
não revogaria durante a criação. A regressão reproduz esse vazamento e o detecta.

## Reproduzir e validar

Em PostgreSQL loopback descartável, com cliente/servidor compatíveis:

```sh
ARANDU_DATABASE_TEST_URL=postgresql://postgres@127.0.0.1:5432/postgres \
  node scripts/financial-baseline.mjs
node scripts/test-financial-baseline.mjs
npm run check:migrations
npm run test:database
```

Para regenerar um snapshot revisado, acrescentar `--write` ao primeiro comando.
O compilador cria bancos aleatórios novos, aplica bootstrap sintético e a cadeia
histórica; nunca faz dump de um banco fornecido pelo operador. Exige zero linhas
de produto fora das configurações estruturais. Remove os bancos em `finally`.
Artefatos só são gravados depois da comparação, probes e canário aprovados.

Equivalência inclui relações/colunas, definições de funções e views, owners,
constraints, índices, triggers, RLS/policies, grants e default ACLs, marker,
configurações estruturais e contrato do bucket. ACLs são comparadas como conjuntos;
NULL de ACL de relação equivale ao default do proprietário. CHECKs usam o deparser
pretty do próprio PostgreSQL, preservando agrupamentos significativos. Os testes
negativos detectam mudança de RLS, grant, corpo de função e constraint.
O fingerprint versionado de recovery em `lib/recovery-schema.mjs` não foi alterado.

`reports/financial-baseline.json` registra tempos medidos por fase e bytes; não
impõe limite de velocidade nem transforma uma execução em SLA. O custo de gerar
e provar a baseline continua incluindo a cadeia histórica; o ganho de instalação
vem do bundle compilado. CI continua executando as provas completas.

## Upgrade Pilot e rollback

```sh
npm run migrations:bundle -- --flow=existingDatabase \
  --after-schema=financial-surface-hardening-1 \
  --stop-before=docs/supabase-financial-legacy-art-decommission.sql
```

Gera 12 migrations contíguas, terminando em `financial-data-governance-1`,
e adia 37, começando pela aposentadoria. O total até o HEAD observado é 49.
O ensaio local parte do marker real, preserva versões financeiras e Auth num
dump/restore sintético, injeta interrupção e prova rollback/retomada. Recusa
ack ausente/inválido e dependência inesperada, sem CASCADE. O marker não basta
para autorizar aplicação: conferir catálogo, origem e recovery do mesmo backup.

Rollback da preparação: revert de código. Baseline falha dentro da transação;
após uma instalação nova isolada, descartar somente aquele banco descartável.
Em hosted, nenhuma restauração/reset/exclusão é autorizada por este runbook.
Dados reais exigem backup restaurável, decisão de retenção e aprovação específica.

O novo caminho continua opt-in até validação na stack Supabase completa; os
scripts da Demo e os caminhos históricos não foram substituídos silenciosamente.
PostgreSQL com schemas auth/storage sintéticos não comprova esses serviços.

O laboratório existente também aceita seleção explícita, antes de gerar chaves
ou provisionar contêineres:

```sh
PILOT_LOCAL_INSTALL_FLOW=financialBaseline npm run demo:setup
```

Usar somente em laboratório **novo e descartável** com capacidade suficiente.
O padrão continua `cleanInstall`; um flow desconhecido falha antes de qualquer
provisionamento. `scripts/local-migration-plan.mjs` propaga erros do descritor/hash,
sem escondê-los em process substitution do shell. A contagem impressa pelo runner
reflete o plano realmente selecionado. Mesmos Auth/Storage/seed/jornadas depois
da instalação, sem alterar workflows nem reduzir os checks históricos.

## Integração com serviços reais no CI

Após a missão de operação de 04/11/2026, o job risk-D `integration` seleciona
explicitamente `financialBaseline` em `demo-integration.yml`: mesmas fases de
GoTrue, PostgREST, Storage, seed, browser, jornadas, ataques, recovery e teardown.
Não cria segundo job integral nem terceiro Supabase. `full/database` conserva
clean install/upgrade/reapply/rollback históricos e equivalência da baseline.
O dispatch manual continua com default `cleanInstall` e opção explícita
`financialBaseline`; seleção inválida aborta antes de provisionar. Logs/summary
identificam o caminho testado. Nenhuma seleção é permissão para banco hospedado.
