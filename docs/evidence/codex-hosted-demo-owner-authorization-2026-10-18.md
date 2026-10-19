# Autorizações mínimas — conversão preservada do Pilot

**Nenhuma autorização abaixo foi concedida por este documento.** Escolher A
autorizou preparar a conversão, não exportar, migrar ou fazer cutover. Owner
aprova cada etapa separadamente; execução só depois das pré-condições.

| Etapa / recurso exato | Menor autorização e operação | Dados, risco e reversibilidade | Pré-condição, recuperação e prova |
| --- | --- | --- | --- |
| 1. Vercel arandu-demo, scope lucas-projects467 | Leitura de projeto/deploy/build logs/aliases e nomes/estados de variáveis, sem descriptografar ou divulgar valores. Alternativa: fornecer diagnóstico sanitizado equivalente | Sem escrita. 403 atual impede confirmar build/configuração/rollback target. Não é pedido de acesso administrativo global | Credencial legitimamente autorizada nesse scope. Conferir branch/main, SHA completo, build/output/root/Node, domínio, proteções e configuração contraditória. Sem isso, configuração efetiva continua ACCESS_BLOCKED |
| 2. Preservação de offgpyysgdhfemjlchod, Arandu Pilot, sa-east-1 | Autorizar export cifrado e transferência somente para destino privado durável aprovado; fornecer conexão por canal privado, destinatário age, custódio separado e retenção/escopo/janela. Não enviar chaves no chat | Leitura/cópia de dados existentes, inclusive legados e possíveis dados pessoais. Cópia não se desfaz por rollback: retenção/exclusão precisam de decisão. Nunca worktree, Git, runner ou /tmp como custódia | Inventário/classificação assinados; PG17, TLS, escopo PostgreSQL/roles/Auth/Storage/configuração. Doctor/preflight do recovery devem PASS antes do export. Manifesto/hash, custódia comprovada e identidade separada; sem isso HOSTED_RECOVERY_BLOCKED |
| 3. Restore do mesmo export, destino descartável privado aprovado | Autorizar recuperação em destino identificado, comparação e teardown; nenhuma sobrescrita do Pilot ou do histórico igacnfjeuqhxcmfyepgj | Escrita de cópia potencialmente sensível no destino. Remoção controlada ao fim; não apagar origem. Binários, Auth e configuração gerenciada precisam de escopo e procedimento próprios | Artefato da etapa 2 íntegro, hash correspondente, destino/custódia aprovados. Reconciliar dados/catálogo/grants/RLS/refs e serviços recuperáveis; limites externos explícitos. Backup sem restore não libera etapa 4 |
| 4. Conversão e schema do mesmo Pilot para Demo | Aprovar janela de conversão, sequência integral do manifesto e migração desde o marker observado. Não inclui seed ou cutover | Escrita/DDL, inclui fronteira destrutiva de aposentadoria legada; não totalmente reversível. Não usar reset como atalho. Assignment ativa só após decisão comprovada | Restore e custódia verificados, ausência de cliente/PII necessária, aceite específico da fronteira destrutiva. Pausar se marker/grants/catálogo divergir. Preferir forward-fix; restore somente para destino explicitamente autorizado, sem sobrescrita improvisada |
| 5. Dataset/Auth/Storage/pool da Demo convertida | Autorizar contas e dados exclusivamente sintéticos, objetos fictícios privados e manutenção/TTL do pool pelos scripts existentes | Escrita de usuários, objetos e registros Demo. Sem contas de cliente, reset global, bucket público ou efeito financeiro/e-mail real. Não autoriza mudar SMTP, chaves ou configuração global por conveniência | Etapa 4 comprovada, destino atribuído e marker correto; inventário de fixture e escopo de limpeza definidos. Validar duas sessões/visitantes, privacidade, persistência e cota; remover apenas recursos sintéticos identificados pelo procedimento aprovado |
| 6. Cutover de arandu-demo/alias arandu-demo.vercel.app, mesmo scope | Aprovar configuração Demo, secrets exclusivos via canal privado, deployment de main, alteração do alias e janela de jornadas sintéticas hospedadas | Muda atendimento público. Remover seletores standalone só com candidato pronto. Não modificar arandu/Production. Reversão de alias/configuração é separada da reversão de schema | Candidato validado com datasource/schema/Auth/Storage/pool sintéticos, SHA exato e quatro gates. Guardar deployment/configuração anteriores em custódia privada. Doctor/canário/jornadas autorizadas após cutover; falha interrompe escrita e aciona rollback compatível/forward-fix aprovado |

Production (`arandu`) é secundária: somente leitura de configuração/logs nesse
mesmo scope basta para avançar diagnóstico; nenhuma permissão de escrita em
Production é solicitada. O recurso retornou 403. Não é possível atribuir causa
conclusiva ao build sem esses logs; guardas locais continuam recusando destino
permanente sem atribuição aprovada.

Sem 2–3 não há conversão segura; sem 4–5 não há backend utilizável; sem 6 o alias
continua ilustrativo. As aprovações não se substituem. Procedimentos executáveis:
`docs/SUPABASE_ENCRYPTED_PRESERVATION.md`, `docs/HOSTED_SCHEMA_ROLLOUT.md` e
`docs/CANONICAL_HOSTED_DEMO_RELEASE.md`. Resolver o handoff do verificador
hospedado antes de utilizá-lo como prova de GO. Não criar projeto novo nem
reutilizar Production: a alternativa A permanece a decisão de preparação.
