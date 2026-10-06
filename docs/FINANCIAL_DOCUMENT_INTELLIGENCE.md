# P1.4 — Proposal & Document Intelligence

Guideline v3 §15 (capacidades permitidas, proveniência por campo, documentos
adversariais, data handling de IA, evals). Matriz: `P1.4`.

**Tese.** Extração é leitura assistida. Um fato extraído é **dado com
proveniência**, nunca autoridade: não escolhe proposta, não aprova, não altera
contrato. Campo crítico só vale depois de confirmado por uma pessoa com papel
de administração ou gestão financeira.

## Modelo

| Objeto | Papel | Mutabilidade |
| --- | --- | --- |
| `fin_private_documents` / `fin_document_versions` (existentes) | fonte: arquivo privado, versão, SHA-256, MIME, tamanho, objeto de origem (RFQ, proposta, contrato) | versões imutáveis |
| `fin_document_extractions` | uma execução de leitura: documento+versão, tipo (`schema_key`), leitor e versão, hash e MIME capturados, páginas, avisos, sinais, estado (`processing → completed/failed`) e código de falha fechado | fecha uma única vez |
| `fin_extraction_facts` | um fato por campo: página/posição, valor bruto, valor normalizado, unidade, moeda, confiança, método, versão do parser, criticidade, estado (`extracted`, `needs_review`, `confirmed`, `rejected`, `superseded`), quem confirmou e quando, motivo da rejeição, fato substituído | só muda o estado de revisão, uma vez |
| `fin_extraction_reviews` | trilha da decisão humana (confirmar, rejeitar, corrigir) | imutável |

Estados do valor: `present`, `not_provided`, `not_applicable`, `unreadable`,
`ambiguous`, `needs_confirmation`. Valor ausente **nunca** vira zero; separador
ambíguo (`1,234`) não é adivinhado; valores repetidos e diferentes viram
`ambiguous`.

Schemas por Product Pack (`lib/finance/document-intelligence.mjs`, espelhados
em `fin_extraction_schema_field` e testados quanto à paridade):
`credit_proposal`, `acquiring_proposal`, `fee_schedule`, `contract_terms`.
O documento não cria campos: só rótulos conhecidos do schema geram fato, e o
banco recusa campo fora do schema, chave extra e método divergente do leitor.

## Fluxo

1. `POST /api/finance/extractions/start` com documento, tipo e leitor.
2. `fin_document_extraction_begin` (JWT de quem pede): papel interno do
   comprador, documento legível agora (escopo de entidade), versão disponível;
   devolve a chave do objeto **só** para leitores automáticos.
3. O servidor lê o objeto com a service role **depois** dessa autorização,
   confere SHA-256 e tamanho; o conteúdo nunca vai ao navegador.
4. O leitor produz fatos; `fin_document_extraction_record` decide o estado
   (crítico, ausente, ambíguo ou confiança < 0,85 → `needs_review`) e cria uma
   tarefa idempotente "Revisar fatos extraídos" no objeto de origem.
5. Revisão humana (`fin_review_extraction_fact`) com estado esperado
   (conflito → 409). Corrigir cria um novo fato `manual_entry` confirmado e
   marca o anterior como `superseded`.
6. Diff semântico: o detalhe compara com a extração anterior do mesmo tipo e
   do mesmo objeto de origem (proposta v1 × v2, contrato × aditivo, tabela de
   tarifas antiga × nova); `GET /api/finance/extractions/diff?a=&b=` compara
   duas extrações quaisquer do mesmo tipo. Saída: antes, depois, impacto
   aritmético (p.p., meses, dias; nunca entre moedas) e proveniência de cada
   lado. Sem melhor/pior.

## Leitores (`lib/finance/extraction-providers.mjs`)

Interface única `ExtractionProvider` (`id`, `version`, `method`,
`supports(mime)`, `extract()`), registrada por id; o domínio não conhece
fornecedor.

| Leitor | Estado |
| --- | --- |
| `deterministic_v1` | PDF com texto (FlateDecode, sem OCR), XLSX (primeira aba) e DOCX, só com `zlib` do Node; PDF cifrado → `encrypted`; sem texto extraível → `unreadable`; imagem → `unsupported_format`; limites de tamanho e de descompressão (anti zip bomb) |
| `manual` | digitação "Rótulo: valor" por linha, com as mesmas normalizações e estados |
| `model_external` | **abstração apenas** (`createModelProvider`). Só liga com `ARANDU_EXTRACTION_MODEL_PROVIDER`, `ARANDU_EXTRACTION_DATA_AGREEMENT=signed` e um cliente injetado; caso contrário a extração falha com `provider_not_configured`. Nenhum dado sai para terceiros nesta versão |

## Conteúdo não confiável

Documento externo é dado. `untrustedText` remove caracteres de controle e de
direção, limita tamanho e sinaliza trechos com formato de instrução
(`instruction_like_content`), exibidos ao revisor como aviso. Nada no
documento altera instruções, ferramentas, autorização, tenant, schema ou
policies: o leitor só preenche campos conhecidos, o banco revalida tudo e o
estado de revisão é decidido no banco.

## Evals

`tests/fixtures/document-intelligence/eval-cases.mjs`: dataset **sintético**
(PDF, XLSX e DOCX gerados em memória; nenhuma instituição ou dado real) com o
esperado por campo, incluindo formato en/pt, escala por extenso ("12,5
milhões"), ausente, `N/A`, ambíguo, ilegível e injeção. Métricas por campo:
exact match, normalized match, tolerância numérica, recall de campo
obrigatório e taxa de falso positivo. Limiares (`EVAL_THRESHOLDS`):

| Criticidade | normalized match | recall | falso positivo |
| --- | --- | --- | --- |
| crítico | ≥ 0,95 | ≥ 0,95 | 0 |
| padrão | ≥ 0,85 | ≥ 0,80 | ≤ 0,05 |

Passar no eval **não** dispensa a confirmação humana de campo crítico.
`scripts/test-document-intelligence.mjs` reprova o build se algum schema cair
abaixo do limiar ou se um leitor inventar valor.

## Segurança e autorização

- RLS forçado nas três tabelas; leitura = comprador com papel interno **e**
  `fin_can_read_document` (que aplica escopo de entidade). Provedor nunca lê a
  extração do comprador, nem do próprio documento.
- Escrita só por RPC `security definer`; navegador sem `insert/update/delete`.
- Viewer lê, não extrai nem revisa; analista extrai e revisa campo padrão;
  campo crítico exige administração ou gestão financeira.
- Testes de ataque em `tests/database/financial-document-intelligence.sql`:
  viewer, outra organização, provedor, gestor restrito a outra entidade, campo
  fora do schema, chave extra (`organization_id` forjado), método falsificado,
  não-solicitante registrando fatos, revisão com estado velho, escrita direta
  nas tabelas e crítico "extraído" por escrita direta.

## Governança

Registrado em `lib/finance/data-governance.mjs` (`document_intelligence`):
extrações `CONFIDENTIAL`, fatos `FINANCIAL_SENSITIVE`, revisões
`AUDIT_EVIDENCE`; todos exportáveis no export do tenant, sujeitos a legal hold,
imutáveis. A fonte continua sendo o documento.

## Interface

`/finance/extractions.html` ("Documentos"), sobre o renderer compartilhado
composto no servidor (`lib/finance/extraction-presenter.mjs`): fila com estado
e pendências, formulário de extração, detalhe com fatos (◆ = crítico), origem
de cada valor, diff com a versão anterior, histórico e formulário de revisão.
**Só no build financeiro**: a página e o código ficam fora do pacote
demonstrativo (`__ARANDU_DEMO__`), porque o sandbox não emula extração; o
bundle demo não muda.

## Rollout e rollback

Migration `docs/supabase-financial-document-intelligence.sql` (marker
`financial-document-intelligence-1`), depois de `financial-opportunity-engine-1`.
Rollback `docs/rollback/supabase-financial-document-intelligence.rollback.sql`:
recusa se existir extração, fato ou revisão (forward-fix).

## Lacunas conhecidas (não escondidas)

- Sem OCR e sem provedor de modelo configurado: PDF digitalizado e imagem
  exigem digitação.
- Leitura determinística depende de rótulos reconhecíveis; layouts sem
  "rótulo: valor" geram `not_provided` e o aviso `no_known_labels`.
- Fatos confirmados ainda não alimentam automaticamente a proposta normalizada
  nem o contrato: a pessoa usa o valor confirmado nos formulários existentes.
  A integração com Opportunity Engine (fato não verificado), busca e Graph é o
  próximo passo da capability.
- Validação hospedada (M3) bloqueada pelo Stage 0 (credenciais do Pilot).
