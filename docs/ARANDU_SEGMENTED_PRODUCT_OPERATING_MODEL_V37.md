# Arandu v3.7 — Modelo operacional das três ofertas e da adoção institucional

**20/10/2026 · Proposta de execução subordinada à guideline §§39–44.** Este documento descreve produto-alvo, prioridades, hipóteses e critérios de aceite; NÃO representa capacidade implantada, planos comercializados, integração ativa nem maturidade M3–M6. P0-A/P0-B de 29/10 (§37) continuam acima deste backlog. Para estados reais, ler `docs/IMPLEMENTATION_MATRIX.md`.

## 1. Categoria, promessa e estrutura

**Categoria:** gestão empresarial do ciclo de relacionamento e contratação de produtos financeiros, buyer-owned. **Núcleo:** condições contratuais e relacionamento → próximo trabalho → cotação/negociação → decisão humana → cumprimento/renovação, com origem, versão e escopo. **Moat pretendido:** memória operacional cumulativa com dados de qualidade; não alegar moat comercial obtido.

A mesma aplicação serve ofertas configuráveis **Essencial**, **Gestão** e **Enterprise** e o portal **Arandu Instituições**. Não criar quatro repositórios, quatro esquemas financeiros ou forks por cliente. Recursos contratados podem variar; os objetos canônicos, autorizações, trilhas e regras financeiras são compartilhados. Clientes escolhem oferta por complexidade e necessidade; rótulos pequena/média/grande são segmentação de pesquisa, não controle de acesso automático.

## 2. Matriz de público e compra

| Dimensão | Essencial: pequena operação | Gestão: operação média | Enterprise: grupo complexo |
| --- | --- | --- | --- |
| Buyer econômico provável, a testar | dono/gestor/controller | CFO/diretor financeiro | CFO/tesouraria/procurement + TI/compliance |
| Usuário diário provável | dono/analista/contador interno | tesouraria/finance manager | times por entidade e função |
| Processo a investigar | condições de produtos, vigência e custos declarados | RFQs, aprovações, renegociação e relação com múltiplos bancos | políticas, entidades, risco operacional e integração |
| Alternativa hoje | banco + ERP leve + planilha | ERP + e-mail + planilha + portal + contratos | ERP/TMS + CLM + banco + fornecedores |
| Momento de ativação | 1 instituição + 1 contrato + próximo prazo | contrato existente ou 1 negociação sem assistência | primeiro piloto com perímetro/grupo/controles definidos |
| Frequência desejada | revisitar prazos e condições no mês | acompanhamento semanal e ciclo de RFQ | operação por exceção e por equipes |
| Implantação proposta | autosserviço e CSV/manual simples | assistida leve, importação mapeada | plano por entidade, IdP, DPA, API, recovery e suporte |
| Principal risco | alimentar dados demais para pouco benefício | reproduzir trabalho antigo sem economia líquida | implementação complexa, integração, segurança e procurement |
| Validação | tarefa útil e compromisso de retorno | redução de coordenação + WTP por valor | aceitação TI/compliance + workflows e integração controlada |

**Problema aberto:** produto documental histórico cita pequenas/médias enquanto guideline recente favorece médias/grandes. Esta matriz resolve a direção B2B tripla sem declarar receita específica. BNDES por porte pode ser usado como contexto de amostragem, nunca como enquadramento de produto obrigatório: https://bndes.gov.br/wps/portal/site/home/financiamento/guia/porte-de-empresa/

## 3. Capacidades: composição alvo, não release

| Família | Essencial | Gestão | Enterprise | Regra transversal |
| --- | --- | --- | --- | --- |
| Relacionamentos com instituições | lista, responsáveis e contato | histórico, pendências e produto | por entidade/fornecedor, governança | mesma identidade canônica; dados confidenciais privados |
| Contratos vigentes importados | registro guiado/condições/prazo | versão, aditivo, renovação | governança/entidade/retention | conservar versões; não fabricar origem de RFQ |
| Produtos de crédito/adquirência | resumo e comparação guiada | RFQ completa, versões e pesos | templates/políticas/escopos | mesma regra no backend, sem "banco recomendado" |
| Propostas externas | entrada controlada | documentos, revisão e evidências | trilhas e integração autorizada | autoria compradora ≠ envio do provedor |
| Passaporte/dossiê | só informações relevantes ao job | perfil por fluxo e documento | escopo por entidade/destinatário | ausência ≠ zero; validade ≠ verificação |
| Instituições/portal | convite opcional | colaboração e propostas | integração e autenticação proporcional | conta do banco não obrigatória para primeiro valor |
| Dívida/facilities/fees | referências essenciais | portfólio e divergências evidenciadas | consolidado, fontes e segregação | nada de reconciliação ou savings inventados |
| Aprovação/política | revisão humana adequada | papéis e etapas | matriz formal por entidade/alçada | SoD de base; segurança não paywalled |
| Integrações | upload/documentos | conectores selecionados | contratos/versionamento/SSO | nunca executar sem direito e source of truth |
| Suporte | conteúdo e caminho humano | onboarding/revisão | contrato operacional/escalation | incidente e export funcionam em todos os tiers |

A habilitação real exige disponibilidade em código, CI, hospedagem, suporte, política comercial e revisão legal; não há billing/tiers aprovados por este documento.

## 4. Jornadas essenciais por persona: desenhar e testar

### 4.1 Essencial — contrato em uso sem banco no portal

1. Usuário escolhe objetivo "Acompanhar contrato"; não precisa conhecer RFQ.
2. Identifica instituição como cadastro privado, com CNPJ opcional somente quando adequado; não declarar registro validado.
3. Informa produto, partes, moeda, datas, aviso prévio, responsável e documento de suporte se disponível. Campos ausentes ficam explicitamente ausentes.
4. Vê resumo legível, data do próximo marco calculada somente com entrada suficiente, fonte, privacidade e botão primário de conclusão.
5. Confirma; persistência real retorna ID e estado. Em falha, não exibir "salvo" falsamente.
6. Volta com link à instituição, contrato e próxima ação, recebe explicação de como editar/aditar sem apagar histórico.
7. Não aparece "convide cinco bancos", "configure SSO" ou "preencha Passport completo" como barreira.

**Aceite:** o usuário entende o que aconteceu e consegue recuperar o registro; não se usa relógio arbitrário como sucesso medido.

### 4.2 Gestão — renegociação de adquirência

1. Seleciona contrato vigente e data-alvo; a necessidade nasce ligada ao relacionamento e à versão atual.
2. Informa ou revisa mix de recebimentos; período, volumes, antecipação, MDR/PIX, liquidação e tarifas claramente tipados, com desconhecidos explícitos.
3. Convida instituições existentes com escopo de dados por destinatário, mas também recebe resposta externa.
4. Proposta do banco ou transcrição da empresa é rotulada pela autoria real; documento e revisão ficam ligados aos termos.
5. Compara condições, cobertura, validade, serviços, garantias e premissas; nunca comparar cenários economicamente diferentes como iguais.
6. Aprovador autorizado vê resumo, diferença e fonte; não modifica preços do banco; decisão humana com snapshot.
7. Contrato/aditivo atualiza timeline e gera obrigações e próximo ciclo, sem apagar contrato anterior.
8. Explicar imediatamente o que a operação reduziu ou ainda exigiu de trabalho manual.

### 4.3 Gestão — crédito com riscos e incomparabilidades

1. Solicitação explicita finalidade, principal, cronograma, prazo, garantias, indexador, carência e moeda; banco decide enquadramento por política própria.
2. Ausência de CET informado, curvas futuras, SAC/bullet e condições não comparáveis mostra recusa de cálculo com razão.
3. Comparação de propostas com menor taxa informada NÃO indica menor custo efetivo ou "melhor banco".
4. Retificação posterior da demanda invalida aprovação da versão anterior conforme regra existente.
5. Registro de decisão não declara crédito concedido, desembolsado ou aprovado pela instituição.

### 4.4 Enterprise — múltiplas entidades e políticas

1. Operador confirma entidade legal e política antes de editar dados; papéis são restritos no backend.
2. Pesquisa e relatórios nunca agregam valores de múltiplas moedas/unidades sem conversão documentada.
3. Aprovação, evidências, contas relacionadas e obrigações são escopadas por entidade; histórico não muda com alteração organizacional.
4. SSO/MFA e integração só com contrato/ambiente comprovado; falha de IdP oferece caminho seguro de recuperação administrativa.
5. Export e offboarding preservam trilha e obrigações de retenção sob direito e policy aplicáveis.
6. Auditável não equivale a certificação jurídica ou financeira.

### 4.5 Instituição — avaliar, responder ou recusar sem duplicar trabalho

1. Link chega ao contato correto e expirável; não vazar token em log/referrer; convite não demonstra que a instituição já tem conta.
2. Antes de exigir esforço, a instituição vê produto, período, prazo, condições de participação e escopo autorizado.
3. Recusa simples registra motivo opcional e não expõe preços nem penaliza uma futura relação.
4. Aceite concede apenas a RFQ autorizada; documentos de outros buyers/provedores nunca aparecem.
5. Resposta com rascunho, versão e estado; destacar campos obrigatórios e inválidos sem apagar trabalho.
6. Reutilizar informações institucionais não-confidenciais, nunca preços de outros clientes.
7. Exposição de resultado e motivo somente com autorização granular do buyer; não sugerir "você perdeu por preço" sem evidência.
8. Export/CRM futuro respeita escopo, minimização, compatibilidade e consentimento. Não copiar CRM inteiro.

## 5. Central de Relacionamentos — blueprint de superfície

**Resumo:** nome normalizado da instituição cadastrada pelo buyer, entidade, produtos vinculados, estado documentado, relacionamento responsável, alertas. Nome não é KYC. **Tabs adaptativos:** Visão geral; Contratos; Condições e tarifas; Negociações; Limites/obrigações; Contatos e histórico. Mostrar apenas as áreas com valor real e dar descoberta de módulos adicionais.

**Ações:** primária é contextual (revisar vencimento, avaliar oferta, cadastrar contrato) e depende de papel, dados e prioridade; secundárias ficam no lugar previsível. Não fixar "Abrir RFQ" como ação principal em toda instituição. **Estado e evidência:** cada KPI/termo traz fonte, período, comparabilidade, revisão e ator quando relevante. Divergência de tarifa tem status "identificada"/"em análise"/"confirmada" diferentes. **Timeline:** evento humano versus evento do sistema e envio externo versus registro manual marcados de maneira distinta.

**Dados:** derivar de módulos existentes em consultas autorizadas, nunca duplicar um segundo estado canônico. **Limites:** página e busca retornam indicação de resultado parcial, paginação e total somente se consultados; empty state não insinua zero de instituição se faltam dados. **Integração:** conta bancária é referência, sem credentials/token ou execução transacional.

## 6. Passaporte/dossiê e dados externos — desenho de confiança

1. Declarar objeto, finalidade, entidade, campo, fonte, autor e momento econômico.
2. Diferenciar metadata de arquivo, conteúdo extraído, revisão, autenticação da fonte e aceitação por destinatário. Estados independentes; sem score global.
3. Compartilhamento explicita campos, arquivos/versões, período, destinatário, prazo, autorização e trilha; não compartilha o Passport completo.
4. Provedor só recebe a declaração enviada à própria RFQ e arquivos autorizados. Revogação impede acessos futuros permitidos; não promete eliminar cópias externas.
5. Bancos ainda executam KYC/KYB/underwriting. Não chamar "validado pelo banco" se este não registrou aceite específico.
6. CSV/XLSX/PDF são entradas não confiáveis: tamanho, MIME/magic, zip-bomb, macros, conteúdo malicioso e fórmula/célula perigosas; revisão humana do mapeamento e origem.
7. Erro de parser, fonte indisponível, consentimento revogado ou documento expirado não viram valores estimados silenciosamente.
8. Idempotência por fonte, arquivo, versão e escopo; divergências são resolvidas por reconciliação auditável.

## 7. Checklists de experiência por superfície

| Superfície | Questões de qualidade obrigatórias |
| --- | --- |
| Site | Quem é usuário? Qual problema? O que NÃO fazemos? Visita ≠ backend? Alguma promessa não verificada? |
| Entrada | Primeiro valor sem banco? Dá para pular setup avançado? Exibe progresso e tempo/efeito sem inventar? |
| Dashboard | Próximo trabalho, motivo, prazo, entidade, responsável? Há ruído, métricas decorativas, tarefas escondidas? |
| Instituições | Origem do cadastro, contatos, visão de contratos/negociações e nenhuma confusão com conta autenticada? |
| Contratos | Termo vigente, data, aviso prévio, aditivo, documentos, fuso, titular, fonte, erro recuperável e histórico? |
| RFQ | Rascunho, revisão, limite de mudanças após aberta, convidados, dados compartilhados por destinatário e prazo? |
| Proposta | Canal e autoria, precisão dos valores, revisão, diferença entre rascunho e enviado, status transparente? |
| Comparação | Unidade/moeda/periodicidade, campos ausentes, cobertura, premissas, neutralidade, sem vencedor implícito? |
| Aprovação | Papéis/SoD, versão decidida, critérios e conflito; comentário e reversão sob permissão? |
| Passport | Dados declarados, fonte, data, expiração, provas parciais e limites de confiança compreensíveis? |
| Fee/Value | Diferença ≠ erro ≠ economia; período e comparabilidade; baselines e metodologia; não somar coisas diferentes? |
| Provedor | Tempo de responder, recusa rápida, documentos só autorizados, versões, visibilidade compartilhada? |
| Admin | Entrada/saída de membro, MFA, desligamento seguro, retenção, logs sem PII, suporte e recovery? |
| Mobile | 390px, leitura da comparação, teclado, foco, zoom, target, não perder rascunho nem esconder ações? |

## 8. Qualidade por estado: defeitos que matam confiança

- **Sem dados:** ação útil; nenhuma ficção para preencher o painel.
- **Dado parcial:** cobertura e limite visíveis; "não encontrado" diferente de "não consultado".
- **Carregando:** skeleton/foco sem deslocamento abusivo; bloquear ação repetida.
- **API lenta:** progresso honesto, timeout, retry seguro; não confirmar operação antes do ACK real.
- **Erro de autorização:** redação clara sem revelar dados ou existência de tenant alheio.
- **Sessão expirada:** preservar somente rascunho acessível no escopo, reautenticar, revogar localmente e não vazar contexto.
- **Conflito de versão:** mostrar versão atual e exigir reabrir; não sobrescrever decisão ou proposta silenciosamente.
- **Arquivo inválido:** motivo e alternativa manual sem baixar proteção.
- **Fonte vencida:** impedir rótulo "validada"; opção de revisão com trilha.
- **Sem internet:** modo de leitura explicitamente local quando possível; jamais enfileirar submissões financeiras não autorizadas.
- **Operação crítica irreversível:** resumo e confirmação proporcionais, retorno do servidor, trilha e possível cancelamento conforme regra.
- **Notificação:** deduplicação, opt-in quando exigido, sem dados financeiros confidenciais e caminho claro ao objeto autorizado.

## 9. Banco e comercial: funil proposto sem falsas métricas

Funil operacional: oportunidade autorizada → convite entregue de modo comprovado → convite aberto → aceite/recusa → primeira interação → resposta completa → versão final → continuidade permitida → reutilização. Eventos devem discriminar canal externo, bounce, abandono, falta de autorização, prazo expirado e pedido de documentação. Denominadores fixos e dedup por oportunidade/provedor; não inferir interesse de "opened" isolado.

Proposta inicial: participação leve e sem cobrar para responder; buyer SaaS como hipótese. Futuras opções institucionais (templates, colaboração, CRM, métricas próprias) somente depois de evidência de benefício e revisão jurídica. Não criar network lead resale, pay-to-win ou favorecimento. Relação entre dados de bancos concorrentes continua fechada em RLS/API/relatórios/analytics.

## 10. Arquitetura de ofertas e migração entre tiers

- Configuração de capacidades sob policy server-side; frontend apresenta apenas estado autorizado e rótulos sem vender segurança básica.
- Mudança de tier não altera organization_id/entity_id ou autores; manter audit logs, documentos, versões, decisões e contratos, evitando downgrade destrutivo.
- Cotas e preços versionados com efeito explícito e prévia de excedentes; proibir cobrança silenciosa ou bloqueio de export necessário.
- Trial/upgrade/downgrade/cancelamento usam política explícita, auditada e juridicamente revisada. O produto não tem billing aprovado nesta revisão.
- Integrações possuem contratos semânticos e idempotência; clientes Enterprise não recebem fork de cálculo; personalização via schemas e templates controlados.
- Gestão é hipótese de ICP inicial, não entitlement forçado por receita. Cliente pequeno com hierarquia complexa pode contratar Enterprise.

## 11. Concorrentes e sistemas adjacentes — benchmark verificável, não paridade

| Referência | Categoria | Lição e limite | Evidência pública de contexto |
| --- | --- | --- | --- |
| Treasury Delta | RFP financeira bidirecional | fluxo corporate→instituição tem competidor; precisa diferenciar no ciclo e no Brasil | https://treasurydelta.com/ |
| Kyriba | tesouraria/contas/tarifas | conta e fee analysis já existem em TMS; integrar, não duplicar TMS | https://www.kyriba.com/es/resources/fact-sheets/bank-relationship-management/ |
| BNDES | tipologia econômica | porte como contexto de amostragem, não regra automática de software | https://bndes.gov.br/wps/portal/site/home/financiamento/guia/porte-de-empresa/ |
| Banco Central (Open Finance) | consentimento/participação regulada | PJ, escopos e papéis; não presumir livre acesso do Arandu a dados | https://www.bcb.gov.br/meubc/faqs/s/open-finance |

Documentar versão, data, segmento/jurisdição e confiança em pesquisa futura. Estas URLs são informações públicas; não provam preço, implantação, ROI, PMF ou conformidade do Arandu. Outras alternativas a entrevistar: ERP leve, ERP de médio porte, TMS, CLM, planilhas/e-mail, portal de banco, consultoria.

## 12. Sequência proposta por dependência

**Imediato até 29/10:** fechar P0-A/P0-B, ensaiar, congelar, evitar dispersão; pesquisa de mercado não sensível pode começar sem construir. **Depois:** (1) entrevistas e teste de três propostas de entrada; (2) concluir central contextual por instituição/contrato com recursos existentes; (3) proposta externa com integridade; (4) dossiê autorizado e portal institucional de baixo atrito; (5) medir uso/valor; (6) adaptar jornadas e packaging por porte; (7) só então integrações selectivas. M3 hospedada corre paralelamente em trilha técnica isolada com autorização; pilot com cliente real depende de legal/security/recovery. Nenhuma fase presume que o passo anterior está entregue.

## 13. Entregáveis por incremento

Cada PR deve conter owner/superfície, problema/alternativa, segmento e persona, objeto existente reutilizado, diff, casos positivos e negativos, provas de isolamento/autorização, compatibilidade com três ofertas, impacto de performance/bundle, screenshots e QA quando visual, métricas de usabilidade, risco legal/comercial, modo demo vs hosted, rollback, evidência no SHA/ambiente, decisão atual e o que deliberadamente NÃO fez.

**Nada deste operating model é licença para abrir uma sprint de todas as capacidades.** O compromisso é com direção e critérios; a liberação de cada capability depende do gate real.
