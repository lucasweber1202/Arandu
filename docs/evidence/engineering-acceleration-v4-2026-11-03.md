# Lote v4 — aceleração e contratos operacionais

Base: main `37b5f4f8418fca5625757415130f2d96d27d0057`, quatro gates
success no run 41653172851. PR308 é trabalho integrado anterior; não valida
as alterações deste lote. Sem alterações de frontend, migrations ou hospedagem.

## Plano e critérios de conclusão

| Pacote | Problema / mudança | Arquivos e dependências | Verificação e conclusão |
| --- | --- | --- | --- |
| A | seed repete 429 a cada 30s; pool usa duas ondas; browsers limitados a dois | seed/backpressure, runner CI, configs Playwright, profiler; workspaces isolados existentes | regressões + quatro gates + Demo Integration no HEAD; comparar tempos, sem remover cobertura |
| B | mapeamento exige conhecer cabeçalho; timeout dificulta recuperar resultado | parser compartilhado, finance-fee-imports, contrato de handoff; JWT/RLS/eventos/índice existentes | CSV/XLSX, limites, autorização e resultado por chave; jornada real |
| C | preservação hospedada depende de recursos aprovados | refresh read-only e runbooks existentes | inventário datado; preservar apenas com binding legítimo, destino durável e custódia age |
| D | erros sem duração/categoria; consulta de tentativa deve ser limitada | observability e handler API; lookup por índice existente | regressões sem payload/PII; duração finita e categoria controlada |
| E | novos contratos precisam entrar no ensaio persistente | platform-journey, testes de API/parser | banco real em CI, viewers/isolamento e todos os cenários prévios mantidos |

Codex: backend, scripts, CI, evidência. CC: telas e UX; integração via
`PLATFORM_INGESTION_BACKEND_CONTRACTS_2026_11.md`. Não editar superfícies CC.
Rollback: revert do lote; nenhum dado de domínio é transformado por migration.

## Medição anterior, sem promessa de ganho

Resumos reproduzíveis em `ci-acceleration-2026-11-03/*.json`, obtidos por API
GitHub e `node scripts/ci-profile.mjs run.json jobs.json output.json`.
O profiler separa duração do job, etapas nomeadas, espera de despacho/dependência
e estimativa de minutos arredondados por job; não confunde isso com fila pura
ou cobrança observada. Cache e trabalho dentro de scripts exigem logs.

Demo Integration 41646766065 (success): job 2184s, seed 622s, pool 1240s,
recovery 43s; estimativa 37 runner-minutes. Logs registram 18 esperas de 30s
por 429 no seed. A janela de escrita de 60/600s **permanece**. Retry-After reduz
requisições redundantes; não elimina a janela. Quatro workspaces continuam
obrigatórios, agora concorrência quatro em vez de duas ondas de dois, mantendo
atores, IDs isolados, RLS, checks, cleanup e todas as fases.

Browser workers: no CI até quatro, limitados por CPUs e dois GiB por worker
mais dois GiB de reserva. Runner 2CPU/7GiB continua com dois. Todos os cinco
projetos, testes, retries e evidências permanecem. Builds de modos distintos
não são reutilizados. Instalação npm já leva cerca de 1–2s: sem otimização
artificial desse trecho. Ganho deste lote ainda NÃO MEDIDO.

## Hospedagem e próxima operação concreta

`ops/consolidation/hosted-refresh-v4-2026-11-03.json`: ambos ACTIVE_HEALTHY,
Pilot 71 tabelas, legado 16, zero usuários Auth/objetos Storage e nenhuma tabela
public sem RLS. Vercel main37: Demo/Pilot READY, Production ERROR. O inventário
completo e advisors do mesmo dia continuam em `ops/consolidation/`; refresh
limitado não substitui backup/classificação dos 42 registros do legado.

Executor não dispõe de conexão administrativa de dump, destino privado durável
aprovado ou custódia age aprovada. Nenhum export hospedado executado. Recursos
precisos a vincular pelo proprietário, fora do chat/repositório: URLs PostgreSQL
17 direct/session por projeto, recipient age com posse verificada, destino
aprovado com retenção e responsável. Opções suportadas: máquina confiável com
store durável, S3 privado existente com PUT condicional/GET/hash, ou runner
privado já autorizado. Não contratar recursos nem usar workspace temporário
como destino. Runbook: `SUPABASE_ENCRYPTED_PRESERVATION.md`.

Sequência Production: inventário/classificação e dependências externas → janela
sem escritores → export cifrado → restore isolado do MESMO backup e probes →
aprovação de conversão → prefixo seguro de migrations → gate destrutivo explícito
→ restante → doctor/advisors/canário → Demo no mesmo SHA → release GO →
ativação Production aprovada. Preservar checkpoints e rollback restaurável;
nunca resolver ERROR removendo a trava de identidade. Atribuições não mudaram.

M0: escopo definido. M1: depende da validação local final. M2: pendente dos
quatro gates no HEAD. M3–M6: não atingidos pelo lote; nenhum ganho comercial,
recovery hospedado ou produção inferido de fixtures/CI.
