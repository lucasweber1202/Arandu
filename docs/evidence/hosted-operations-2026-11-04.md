# Operação hospedada — 04/11/2026

Base `1614217f273ba0992c9fcffeab0980a465924bf4`, após merges #321/#322.
Worktree própria `Arandu-operations`, branch `codex/hosted-operations-20261104`.
Checkpoints `95379b27` (conteúdo do recovery) e `68bc5f37` (classificação,
upgrade, diagnóstico e leitura de contratos). A PR frontend #323 observada usa
outros arquivos e a API overview existente; nenhuma edição frontend nesta missão.
Baseline e 84 migrations históricas permanecem intactas. Nenhum merge automático.

## Avanço implementado

- Export cifra uma chave por backup para o mesmo recipient age e calcula prova
  privada do conteúdo no snapshot compartilhado com pg_dump. Restore compara
  valores além de contagens/schema, sem persistir plaintext. Dump válido com
  conteúdo alterado e contagens/schema iguais é recusado. Gates de conversão e
  release exigem o novo resultado; provas antigas incompletas não são promovidas.
- Marcos `BACKUP_CREATED`, `BACKUP_VERIFIED`, `RESTORE_VERIFIED` são emitidos
  conforme a etapa comprovada. `FULL_RECOVERY_VERIFIED` fica NOT_PROVEN; não há
  inferência de ambiente gerenciado a partir de um restore PostgreSQL.
- Classificador por objeto vincula decisões ao inventário/colunas/dependências,
  recusa prova vencida/incompleta e distingue desconhecido, retenção, hold e
  pedido de revisão. Nunca emite autorização de exclusão ou conversão.
- Ensaio histórico injeta falha SQL dentro da primeira migration atômica e
  retoma pelo marker observado. Verifica recusa da fronteira destrutiva sem mudar
  marker, preservação de tarefa/membership, trigger Auth antigo/novo e zero
  migrations pendentes. Não aplica baseline a banco antigo.
- Ataques SQL no schema atual cobrem grants/search_path de todas as definidoras
  financeiras, entrada de decisão antiga fechada e perda imediata de acesso por
  revogação de entidade/membership na mesma sessão. Integram os três caminhos da
  suíte de banco. Nenhuma RPC recebeu revogação indiscriminada ou hotfix hospedado.
- Detalhe de contrato lê a proveniência da RFQ em paralelo às seções independentes.
  Mesmos filtros, JWT, RLS, número de consultas e formato da resposta; até sete
  leituras independentes simultâneas em vez de seis. Teste
  determinístico bloqueia versões e comprova que a origem já foi consultada.
  Não há claim de p95 hospedado nem contrato novo exigido ao frontend.
- SQL de capacidade somente leitura retorna tamanho, counters/reset, manutenção,
  conexões, sessões, bytes declarados Storage e totais de jobs. Não retorna payload,
  query text, nomes de objeto, pessoas ou tokens. Sem novo scheduler/serviço.
- Integração efêmera risk-D usa a baseline direta com as mesmas fases reais
  Auth/PostgREST/Storage/browser/recovery. Suíte SQL mantém o histórico; dispatch
  manual conserva as duas opções. Não há duplicação do job integral.
- Doctor reconhece leitura Vercel comprovada por metadados e SHA, sem pedir acesso
  novamente nem confundir leitura da configuração com readiness.

## Hospedado: observação, sem mutação

Fontes: `ops/consolidation/hosted-operations-2026-11-04.json`, worksheets de
classificação e snapshots `capacity-2026-11-04-*.json`. Nenhum valor pessoal ou
segredo foi lido/exportado. Metadados de variáveis foram consultados com
`decrypt=false`; presença não prova correção dos valores.

| Recurso | Legado / Production candidata | Pilot / Demo candidata |
|---|---|---|
| Ref | igacnfjeuqhxcmfyepgj | offgpyysgdhfemjlchod |
| Público | 16 tabelas / 42 linhas | 71 tabelas / 14 linhas |
| Auth usuários/sessões; Storage objetos | 0 / 0; 0 | 0 / 0; 0 |
| Schema financeiro | ausente | financial-surface-hardening-1 |
| Migrations registradas | 0 | 3 bundles históricos |
| Upgrade para main | caminho histórico completo | 49 etapas: 12 preparação + 1 aposentadoria + 36 financeiras |
| Banco medido | 12.340.371 B | 16.149.651 B |
| Jobs retidos | tabela ausente | 4 succeeded, 0 running/failed; frescor não comprovado |
| Conversão / export / restore reais | NOT_RUN | NOT_RUN |

As dez tabelas não vazias (cinco por origem) continuam sem decisão humana de
proveniência, retenção e hold. Os oito contatos/destinatários não são o universo
possível de PII: artistas, direitos e conteúdo livre também precisam de revisão.

Vercel Demo serve o SHA inicial em `arandu-demo.vercel.app`: liveness 200,
readiness 503, datasource `synthetic-fixtures`; apenas `ARANDU_DEPLOYMENT_KIND`
aparece nos metadados de configuração. Demo M3/Auth/RLS/Storage/persistência
hospedada NOT_PROVEN. Pilot transitório está READY no mesmo SHA. Production
está ERROR nesse SHA; log confirma recusa correta do ref legado sem atribuição
ativa. Não foram alterados secrets, ambientes, domínios, allowlists ou bindings.

## Performance adicional

Matriz com 1k/10k/100k tarefas, 20 tenants, dois escopos de entidade, sete consultas,
quatro leitores concorrentes e inserts revertidos. Em 100k, open 1.203,576 →
53,377 ms; entidade 450,041 → 510,552 ms; INSERT 1.000 48,273 → 56,305 ms;
candidato 7.749.632 B. Há regressões também em tamanho pequeno/médio. Não adotado:
nenhuma migration/índice canônico alterado. Planos/amostras/overhead e limites em
[capacidade e definidoras](../FINANCIAL_CAPACITY_AND_DEFINERS.md); os tempos são
laboratório, não p95/ganho hospedado. Resultados filtrados e isolamento idênticos.

## Único handoff ao proprietário

Para executar a próxima operação real, disponibilizar no **executor privado de
recovery**, por canal seguro, sem colar valores no chat/PR:

1. Conexão administrativa TLS autorizada (`ARANDU_RECOVERY_DATABASE_URL`) de cada
   ref acima, uma origem por execução. MCP SQL de leitura e service-role HTTP não
   substituem acesso pg_dump administrativo.
2. Recipient age público (`ARANDU_RECOVERY_RECIPIENT`) e custódia independente da
   identidade privada de restore; provar roundtrip com `recovery:key:prepare`.
3. Destino **durável aprovado**, responsável, retenção e referência de autorização:
   store privado persistente (`ARANDU_RECOVERY_DIRECTORY`, inicializado por
   `recovery:store:init`) ou estratégia S3 já suportada com URLs autorizadas de
   PUT/GET. Workspace efêmero e artifacts de CI não são esse destino.
4. Autorização específica de export por origem/destino/SHA revisado, executor e
   janela, com acesso independente ao restore PG17 isolado. Registrar referências
   sanitizadas das decisões das dez tabelas conforme o worksheet; conteúdo
   sensível permanece privado. Capturar configuração externa Auth/OAuth/Storage/
   dependências na custódia privada: esses itens não entram automaticamente no dump.

Com isso: doctor → export cifrado → readback → restore do MESMO backup →
reconciliação conteúdo/schema/contagens → probes e evidência gerenciada. Só então
submeter aprovação específica de upgrade/cutover com janela e rollback. A missão
atual não constitui essa aprovação. Demo exige posteriormente configurar seus
secrets do ref convertido e passar jornada canônica; Production mantém NO-GO.

## Validação e limites

Recovery real **sintético** PG17.11/age1.3.2 PASS_LOCAL, incluindo adulteração de
conteúdo, identidade errada, corrupção, schema drift, RLS, Storage HTTP sintético
e teardown. Ensaio histórico ampliado e API de contratos PASS_LOCAL. Build e
check:all locais executados nesta árvore. Os quatro gates e a integração efêmera
precisam ser aprovados no HEAD candidato da PR; resultados de #321 não são usados.
Docker integral local não repetido pelo limite conhecido de espaço/vfs.

Nenhum serviço pago contratado, terceiro Supabase criado, índice ou função
hospedada alterado. Consumo de runner/rede existente não foi convertido em custo
monetário sem dados de faturamento. Egress, Auth MAU, uso faturado e folga de quota
continuam desconhecidos; zero objetos não significa consumo zero.
