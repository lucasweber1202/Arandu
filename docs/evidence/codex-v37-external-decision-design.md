# Extensão de fonte da decisão externa

Base: 78e3bb36221c6ef4b7bfc3ea450a144bf790ab39. Desenho anterior à migration.

Alternativa A: referência discriminada na decisão/aprovação canônicas, com FK
externa e versão exata. Alternativa B: tabela imutável intermediária de seleção;
acrescenta objeto, export e retenção sem eliminar a adaptação da policy.
Alternativa C: converter transcrição em proposta institucional; rejeitada por
falsificar autoria. Escolha A: preserva integralmente convite/organização/FKs
de fin_proposals e o único motor de policy/decisão. Não cria máquina paralela.

Decisão, aprovação e contrato passam a distinguir proposta institucional e
buyer_recorded_external. Projeções internas adaptam leitura das fontes aos
procedimentos existentes. A fonte externa elegível exige revisão, versão e
revisão da RFQ atuais, entidade correta e documento atualmente disponível se
vinculado. Ausência permanece explícita. Snapshot guarda origem, fonte, termos,
revisor, documento, limitações e critérios; transcrição não autentica emissor.

Ordem: RFQ → membro/grants → registro externo → documento. Aprovação reutiliza
policy, etapas, delegação, SoD e stale detection. Comandos externos exigem
versão/revisão esperadas e intenção persistida; mesma chave com outro payload
conflita. Nenhum retry ajusta versão silenciosamente.

Continuidade é comando separado que vincula a decisão a contrato importado
existente e confirmado pelo comprador, na mesma entidade/provedor/produto/moeda.
Não cria assinatura, aceite bancário, concessão ou desembolso. Versões e tarefas
continuam canônicas. Rollback pré-uso somente; após uso material, forward-fix.

Manifesto e validadores são propriedade da Frente A nesta missão. A Frente B
não deve alterar esses arquivos em paralelo; seu delta de integração precisa
ser reconciliado após a integração autorizada de A.
