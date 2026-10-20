# Passport: origem, evidência e limites de validação

Missão v3.6, 20/10/2026. Base: `546048985ce41901ddedce3d5259bb36ff54b0cc`.
Ownership desta rodada: contrato/backend e testes do Passport; nenhum arquivo
de UI, configuração compartilhada ou migration foi alterado.

## Problema resolvido e incremento

O Passport reduz repetição de cadastro e reúne declarações, referências a
documentos, responsáveis e atualizações para preparar solicitações. Não elimina
a diligência da instituição e não certifica valores financeiros. Sua utilidade
é organização e memória institucional, ainda hipótese de redução de esforço
até pesquisa com compradores e bancos.

`GET /api/finance/profile` agora acrescenta `evidence`, contrato
`passport-evidence-v1`, calculado exclusivamente sobre as mesmas linhas já
autorizadas e resolvidas por entidade. Nenhuma leitura adicional, escrita,
compartilhamento, integração ou inferência de qualidade. Campos existentes da
API mantêm semântica; UI atual não é modificada. Só há metadados das linhas de
perfil; identidade do cadastro não recebe uma falsa confirmação por falta de
histórico equivalente. `rows` e `passport` existentes continuam presentes.

| Dimensão independente | Representação atual | O que não implica |
| --- | --- | --- |
| Informação declarada | `source.declaration`, autor e data do registro | Fonte autenticada ou conteúdo correto |
| Documento vinculado | `supporting_document.state`: not_linked/metadata_available/unavailable | Autenticidade, completude ou conferência; metadata_available significa metadado retornado na consulta autorizada, não download/integridade verificados nesta resposta |
| Documento conferido | `document_review: not_recorded` | Não se deduz de attachment, revisão de frescor ou extração |
| Atualização confirmada | `currentness_confirmation`: data + autor; escopo declared_currentness_only | Correção econômica; data sem autor resulta not_established |
| Validação externa | `external_validation: not_recorded` | Não se deduz de source=integracao ou CNPJ com formato válido |
| Aceite pelo banco | `institution_acceptance: not_recorded` | Não se deduz de convite aceito, proposta ou decisão do comprador |

Os estados não têm ordem, nota ou transição automática. `not_recorded` significa
que este modelo não estabelece a verificação, não que ela nunca ocorreu fora
dele. Datas/autoria ausentes permanecem null. Versão corrente do documento é
rotulada `current_version`; `version_at_recording` permanece null porque o
vínculo atual não fixa a versão no instante da declaração. Não há hash/versão
histórica inventados nem reaproveitamento automático de fatos extraídos.

## Auditoria das implementações existentes

| Estrutura | Evidência suportada | Limite encontrado |
| --- | --- | --- |
| `fin_company_profiles` | Valor/string, source, updated_by/at, verified_by/at, document_id, valid_until, review_after_days, organization/entity | Source é declaração; verified significa confirmação de atualidade; não possui método/escopo/referência de validação independente nem data econômica separada do updated_at |
| `fin_company_profile_history` | Trigger append-only de criação, alteração e confirmação; contexto original e valores/origens anteriores | Histórico não é atestado da verdade; não reconstituir automaticamente versão documental histórica a partir de current_version |
| `fin_rfq_profile_snapshots` | Captura transacional imutável de valor/source, autoria/data, frescor, used_as_is, origem grupo/entidade | Comprador apenas; não é dossiê autorizado ao banco, nem comprovação da demanda editada; vínculo de documento não equivale a bytes/hash/versão congelados |
| `lib/finance/passport.mjs` | Catálogo, tipagem, cobertura factual, frescor, prefill e resolução de escopo | Cobertura não é score; frescor usa max(updated_at,verified_at) e validade explícita; salvar/reconfirmar não renova legitimidade econômica |
| RPCs set/confirm/scoped/create RFQ | Ator via auth.uid, papéis, entidade, allowlist de origem, documento do perfil da própria organização/entidade, snapshot e trilha | Origens reservadas existem no banco mas não constituem conectores implementados; formulário não as pode atribuir |
| API profile/history/search/rfq-passport | JWT de usuário, valida comprador, contexto autorizado antes de consultar entidade; busca paginada | Leitura principal limita 200 campos/100 documentos/200 membros; histórico 50 sem paginação nessa rota; não alegar inventário completo além dos limites |
| RLS | Perfil/histórico por organização e entidade; defaults de grupo restritos; snapshots só comprador | Helper de projeção não é camada de autorização; precisa receber linhas já autorizadas. Provedor não ganha acesso pelo novo contrato |
| Documentos privados/versões | Storage privado, autorização de upload/download, versões imutáveis, MIME/tamanho/hash e extrações com revisão próprias | SHA prova igualdade de bytes, não emissor/autenticidade; extração confirmada não prova verdade; revisão da extração não confirma automaticamente campo de Passport |
| Financial Graph | Referências/contexto derivados dos sistemas de registro | Não é fonte adicional ou mecanismo de validação; nenhuma nova tecnologia necessária |

Documentação histórica de DATA_MODEL/PROCUREMENT/THREAT_MODEL ainda contém
descrições antigas de upload e Passport de grupo; a implementação posterior
de documentos privados e `FINANCIAL_PASSPORT_ENTITIES.md` prevalece para esses
detalhes. Nenhum documento compartilhado foi reescrito nesta frente.

## Evolução proposta: evidências e dossiê por finalidade

Não criar uma coluna `trusted` nem escada universal. Uma futura evidência deve
referenciar tenant/entidade, campo e revisão exata do valor; tipo de alegação,
método, escopo, resultado limitado, autor e instante da conferência; fonte e
referência, data econômica, validade declarada; documento/versão/hash e
localizador quando aplicável. Revisão interna, validação por terceiro e aceite
por instituição são registros separados, com emissores e limites próprios.
Mudança de valor/fonte/documento produz nova revisão e nunca transporta
automaticamente o resultado anterior. Divergência preserva as duas fontes e
exige resolução humana, sem last-write-wins para fatos concorrentes.

Isso exige desenho de migration/RLS/classificação/retention/export/rollback e
contratos em PR futura independente: esta rodada entrega apenas a projeção
verdadeira do modelo atual. Não tratar a proposta como persistência existente.

Reutilizar catálogo de produtos, documentos versionados, extrações e snapshots.
Um dossiê futuro seleciona campos exigidos por finalidade e RFQ, datas/validade,
valores revisados e versões exatas de documentos, com autorização explícita por
destinatário e trilha. Uma autorização de RFQ não compartilha o Passport inteiro.
Manter documentos anteriores e rever autorização no download, inclusive após
revogação. Snapshot interno atual continua privado e não é convertido em
compartilhamento por conveniência. Arquivos expirados sinalizam revisão; não
são apagados por terem sido substituídos. Não prometer dispensa de controles
próprios do banco.

## Propostas recebidas fora do portal: contrato futuro, sem personificação

Hoje `fin_providers` é o cadastro da relação comprador/instituição;
`fin_organizations(kind=PROVIDER)` é a organização autenticada do portal.
Aceite do convite vincula ambas. `fin_submit_proposal` e versões existentes
exigem autoria/vínculo do provedor e não são endpoint de importação pelo
comprador. Não criar conta sintética ou convite aceito para contornar isso.

Preparar uma entrada distinta de origem `buyer_recorded_external`, preservando
provider_id do diretório, organização/entidade/RFQ reais, canal
email/pdf/spreadsheet/manual, referência da fonte, instante recebido, autor do
registro via sessão, documento/versão/hash quando disponível, termos tipados,
data/validade/moeda, revisão humana e motivo de correção. Emissor alegado não
é usuário autenticado: provider_organization_id e submitted_by nunca devem ser
fabricados. Extração gera rascunho e mantém origem por campo; não submete pelo
banco. Registro manual sem arquivo declara essa ausência e usa referência
rastreável, sem fingir documento apresentado.

Uma implementação futura precisa ajustar o modelo de proposta/versionamento e
snapshots de decisão para preservar essa origem ponta a ponta; reaproveitar
normalização/comparação, RBAC/RLS/SoD e decisão humana. UI de Claude distingue
"enviada pelo provedor" de "registrada internamente de fonte externa". Não
implementar só um campo de texto no endpoint atual, que manteria autoria falsa.
Idempotência por tenant/entidade/RFQ/chave e fingerprint do payload; repetir o
mesmo pedido devolve a mesma versão, chave com conteúdo diferente conflita.
Versões append-only e estados esperados evitam sobrescrita concorrente; erro
de leitura/revisão não cria proposta parcialmente confirmada. Negativos
necessários: outro tenant/entidade, provider concorrente, viewer, documento
alheio/removido, emissor forjado, retry, race, termos ausentes e revisão
posterior à decisão. **Contrato proposto, não endpoint implementado.**

## Interoperabilidade: decisão e custo

| Possibilidade | Decisão | Dados, dependências e custos antes de executar |
| --- | --- | --- |
| Representar declarações e limitações honestamente | Construir agora | Projeção/testes desta PR, sem SDK, migração ou custo de serviço novo |
| Dossiê selecionado e proposta externa | Preparar contrato | Autorização por destinatário, versões/hash, proveniência, idempotência, revisão, armazenamento/egress/scanning e suporte; contrato acima, sem implementação de importação |
| Upload/extração PDF/XLSX/DOCX | Reutilizar núcleo existente; preparar contrato para Passport | Limites de bytes/descompressão, conteúdo hostil, autorização de arquivo, revisão humana; retenção e custo de processamento/Storage, sem IA externa habilitada |
| Importação ERP/TMS | Integrar futuramente | Demanda comprovada, escopos mínimos/API de origem, mapeamento/versionamento, credenciais/rotação, quotas, suporte e reconciliação; custo de licença/adapter/operação a cotar |
| Open Finance/API bancária | Integrar futuramente | Fonte e autenticação autorizadas, consentimento/base jurídica/expiração/revogação, credenciamento ou parceiro conforme caso, contratos/quotas; custo recorrente e manutenção não estimados sem fornecedor |
| Verificação cadastral/KYB | Integrar futuramente | Consulta autorizada, timestamp e resposta com escopo; formato CNPJ não comprova cadastro; custo por consulta/plano, limites e cache juridicamente adequado |
| Underwriting, score próprio, core bancário, execução | Não construir como núcleo | Fora dos boundaries; diligência/decisão da instituição e integração especializada quando autorizada |

Integração futura conserva fonte original, cursor/checkpoint e chave idempotente;
timeout/credencial revogada deixa estado pendente/falho sem substituir valores
válidos. Payload externo passa allowlist/tipagem/limites e nunca escolhe tenant
ou autor. Freshness da fonte permanece visível, divergências viram pendência
humana. Telemetria não inclui documentos, valores ou credenciais. Nenhum valor
monetário de custo foi inventado; business case precisa medir horas poupadas e
pedir cotação antes de contratar serviços.

## Qualidade, testes e lacunas operacionais

Os testes novos integram o script existente `scripts/test-finance-passport.mjs`,
já executado por check:all. Cobrem simultaneidade de documento+confirmação sem
validação externa, todas as origens reservadas, metadados de validação/autoria
forjados descartados, confirmação sem autor, documentos removidos/ausentes,
ausência de versão histórica, ausência de valores financeiros duplicados e
resposta API com escopo de entidade sem irmã. Testes de provider/tenant já
existentes continuam negativos. Sem mudança de testes UI/retries/skips/thresholds.

Reutilizar medição da #245: CPU local não é latência de API; browser lab não é
RUM; teste de concorrência SQL não prova capacidade operacional. O novo cálculo
é linear nos até 200 campos/100 documentos já consultados, sem consultas por
campo. Nenhum ensaio de carga hospedado foi executado.

RFQ/convites/propostas/decisões/contratos têm testes de domínio e SQL, incluindo
locks/idempotência/receipts e snapshots. Documentos têm negativos de versão,
autorização, integridade e parsing; Passport tem histórico/escopo/frescor;
revogação tem testes de sessão ausente/expirada/encerrada. Esses mecanismos
existentes não foram duplicados. Eventos SQL e product events não equivalem a
tracing HTTP ponta a ponta: medir tempos por operação/resultado, conflitos e
fila com correlation_id sem dados financeiros permanece lacuna operacional.
Paginação completa de perfil/histórico/documentos e métricas reais de importação
são trabalhos posteriores; não elevar limites para ocultar truncamento.

M3 exige recovery do mesmo export incluindo Auth/Storage/configuração, cutover
autorizado e jornadas reais. Sem mudanças hospedadas nesta missão. Intervenções
humanas: revisão/integração desta PR após gates; pesquisa buyer/banco e critérios
de dossiê; decisão jurídica/consentimento/fornecedores antes de dados externos;
autorização específica e custódia para recovery/cutover; validação da estação
do owner. Não são permissões necessárias para continuar os testes locais.
