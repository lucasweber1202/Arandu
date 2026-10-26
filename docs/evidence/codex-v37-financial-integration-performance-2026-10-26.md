# Integração financeira real e RFQ — 26/10/2026

## Base, commits e limites

Base `main@71c6398534ad9199ffca9150ade2cc137395f63c`; #275–#277 confirmadas
por ancestralidade. Branch `codex/v37-financial-integration-performance`, worktree
exclusivo `arandu-codex-integration`. Implementação `8ad4e8f`, preflight
`0b21272`. HEAD final publicado e os quatro gates devem ser conferidos na PR;
CI da base não é prova deste incremento.

Independente da PR #279: não muda manifesto, doctor, migrations financeiras,
runner SQL canônico, guidelines ou Implementation Matrix. Nenhum arquivo reservado
ao Claude foi alterado. PR #278, aberta durante a missão, foi relida: suas mudanças
visuais em company/provider/relationship-center foram preservadas.

## Ganho de RFQ reproduzível

A RFQ importava estaticamente o módulo visual/editor de policies, mesmo antes de
abrir uma interação de aprovação. Agora o módulo só carrega quando necessário.
O domínio de policies continua disponível; regras, mensagens, aprovações e
propostas externas/canônicas não foram removidas. Import com falha mostra erro e
retry, com `aria-busy`; a prévia falha fechada, sem liberar envio por engano.

| Variante | Antes | Depois | Recuperado | Margem para 250.000 B |
|---|---:|---:|---:|---:|
| Financeiro | 247.792 | 216.234 | 31.558 | 33.766 |
| Demo | 249.664 | 218.069 | 31.595 | 31.931 |

Mesmo Node 24/lockfile, builds em worktrees da base e da implementação, mesma
minificação e limites. Os JSONs anexos registram hashes dos perfis comparados.
Reprodução: em cada SHA, `npm ci --include=optional`, `npm run build` ou
`npm run build:demo`, salvar `reports/bundle-profile.json`, e executar
`node scripts/measure-rfq-bundle.mjs <antes.json> <depois.json>`. A medida é a união
dos fechamentos estáticos app + rota, sem contar chunk compartilhado duas vezes.
O limite e o aviso existente do sandbox legado não foram alterados.

## Laboratório real, isolado e descartável

Comando: `node scripts/financial-lab/run.mjs` (Node 24, Docker/Compose/OpenSSL).
Não reutiliza `pilot-local/.state`, portas, projeto Compose, banco, volumes ou
processos de outro agente. Gera projeto aleatório, rede interna sem portas
publicadas, credenciais/certificado locais, configura roles da plataforma, sobe
GoTrue/PostgREST/Storage reais, instala o manifesto e executa as APIs do Arandu.
Cleanup remove somente recursos com o projeto exclusivo; erro de cleanup invalida
PASS. Não usa pkill, reset compartilhado, segredo hospedado nem URL remota.
Docker/Compose/OpenSSL ausentes: relatório `NOT_RUN`, exit 2, antes de credenciais
ou containers. Esse caso foi exercitado com Docker ausente do PATH.

Componentes: PostgreSQL oficial 16.15-bookworm, GoTrue v2.181.0, PostgREST v12.2.9,
Storage v1.25.3; os três últimos usam versões do compose existente. Node 24.19.0
do executor é montado no worker. Auth e Storage instalam suas tabelas por suas
próprias migrations: não se usa o bootstrap de Auth/Storage simulado dos testes
SQL. `auth.uid/role/jwt` são helpers de claims do self-hosted; não aceitam identidade
de nome de instituição. As operações de negócio usam a sessão/JWT do ator;
service role fica na criação sintética de contas e nas operações de servidor já
existentes do produto (Storage/cron), nunca substituindo autorização do comprador.

A imagem Supabase Postgres 15 completa foi tentada, mas sua extração ficou lenta;
o laboratório usa PostgreSQL 16 + serviços reais. Isso prova a jornada local
nessas versões, não paridade com todas as extensões/configurações de um projeto
Supabase hospedado PG17 nem prontidão da estação física do proprietário.

## Provas executadas

**Jornada financeira: 29 passos, 65 ataques, zero falhas; teardown PASS.**

Inclui o ensaio autenticado existente (convite e contato exato, instituição correta,
versões de proposta, comparação, decisão/aprovação com SoD, contrato, tarefa,
Storage privado/versionado/remoção, confidencialidade concorrente, MFA operacional,
sessão expirada e cron concorrente) e as extensões novas:

- Contrato existente pela API real: request_key, corpo de resposta descartado,
  consulta de recibo, retry, responsável elegível, releitura exata e uma tarefa.
- Proposta externa com documento subido no Storage real, origem, revisão humana,
  versão, comparação, aprovação independente, decisão e vínculo explícito ao
  contrato importado; fotografia da decisão preservada, sem presumir envio,
  assinatura, aceite ou desembolso bancário.
- Provedor não lê recibo/contrato do buyer; versão obsoleta e leitura concorrente
  recusadas. Não se trocam personas nem se limpam contadores para contornar 429:
  a extensão respeita o Retry-After real do limite de 60 escritas/10 min.

O relatório de desenvolvimento anexo registra o checkout-base `71c6398` enquanto
os arquivos eram implementados; isso NÃO é declaração de execução em HEAD limpo.
A reexecução final no HEAD publicado, sem alterações de fonte durante o ensaio,
é registrada no corpo da PR quando concluída. Não se converte um relatório antigo
em prova de um SHA novo.

**Composição A+B: 35 verificações PASS**, no worktree exclusivo
`codex/v37-provider-financial-composition@e655a2f7ee98d485e842b14382d3126d1424ed87`
(B `8ad4e8f` + implementação A `f1bbdd5`, sem merge remoto). Modo
`ARANDU_FINANCIAL_LAB_SCOPE=provider` só é válido com A presente. Criou sete contas
sintéticas GoTrue, fez login real pela API, criou organizações, e provou recibo,
quatro retries HTTP simultâneos, uma contraparte/auditoria, conflito, intenções
homônimas distintas, ausência de identidade institucional presumida, recusas a
analyst/viewer/provider/outro buyer, recibo de outro ator, membro removido e chave
malformada. Storage/browser/hospedado NOT_RUN nesse gate focado. Teardown PASS.
A branch de composição não será publicada como terceira PR.

## Browser e gates locais

- `check:all`, builds financeiro/Demo, build-size, `audit:ci`, `deploy:check` com
  `ARANDU_SITE_URL=https://arandu.example`: PASS. Essa origem é sintética local.
- RFQ/policy/external-proposals Chromium desktop + Pixel 7: 190 PASS / 3 SKIP /
  1 timeout sob contenção; o teste de acessibilidade que expirou passou depois em
  ambos os viewports (2 PASS), sem mudar tempo ou asserts.
- Novo E2E da carga adiada e erro do chunk: 2 PASS (desktop/mobile); diferencia
  módulo visual de policies do domínio estático usando o perfil do build real.
- APIs de browser são simuladas; não se contam como Auth/Storage real. O ensaio
  HTTP acima usa os componentes reais, sem browser. Browser contra stack real,
  Firefox/WebKit locais e sistema hospedado: NOT_RUN nesta rodada.
- Recibo pendente/timeout e revogação durante espera do lock: SQL e E2E da #279.
  O ensaio HTTP descarta um corpo já retornado; não simula um corte físico da rede
  durante o COMMIT. Não se reivindica essa falha física como provada.

## M3 somente leitura

Consulta nova ao Supabase: Pilot `offgpyysgdhfemjlchod` INACTIVE; legado
`igacnfjeuqhxcmfyepgj` ACTIVE_HEALTHY. Nenhum dado de aplicação lido, exportado ou copiado, nenhum
projeto reativado ou alterado.

Vercel: listagem de projetos permitida; listagem de deployments dos projetos
corretos em `team_BBpDcLVx5izJjXz5qBEq2cRy` retornou 403 no scope
`lucas-projects467`. Sem pedir ou alterar autorização durante a ausência do owner.
Estados GitHub no SHA base consultados: Demo success
`8gWdJungxGKnxWBcgED3G8na5oXL`, Production failure
`BRx74P549XAo3iNX2yE3QNvcnhro`, Pilot success
`GKNqrFqVba3rGDdhQoLvvgGMXcAE`. Isto é status do commit no GitHub, não releitura
bem-sucedida do deployment nem prova de M3.

Assignments permanentes vazios e bloqueio de Production preservados. Sem migration,
restore, export, seed/reset, env var, secret, assignment, promoção, cutover,
faturamento ou serviços pagos hospedados. M3/M5 e estação física não promovidos.
