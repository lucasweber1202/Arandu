# Primeiro cliente Pilot — checklist

Estado de 05/10/2026: **não pronto**. Evidência técnica e blockers em
[`FINANCIAL_RELEASE_EVIDENCE_2026-10-05_V3_BASELINE.md`](FINANCIAL_RELEASE_EVIDENCE_2026-10-05_V3_BASELINE.md)
(rodada anterior em `FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md`; observações hospedadas de 04/10 em `FINANCIAL_RELEASE_EVIDENCE_2026-10-04.md`).
Demo sandbox, código validado e Pilot autenticado são estados distintos.

| Item | Estado | Ação e verificação |
| --- | --- | --- |
| Ambiente dedicado | partial | Identidade Vercel/Supabase observada; instalar marker atual após recuperabilidade; doctor completo GO |
| Domínio | OWNER_ACTION_REQUIRED | Confirmar domínio autorizado e DNS/HTTPS; conferir URLs e cookies |
| Admin e participantes | OWNER_ACTION_REQUIRED | Contas consentidas, comprador/aprovador/provedor; allowlist; testar login, revogação e logout |
| Operador | OWNER_ACTION_REQUIRED | Nomear finance_ops, registry e MFA; sem dado sensível no console |
| Entidades | code_complete | Configurar duas entidades fictícias de ensaio e escopos; provar isolamento com conta restrita |
| Passport | ci_validated na baseline | Preencher fatos com fontes e entidade correta; verificar leitura autorizada |
| SSO | opcional / provider externo pendente | Somente habilitar depois de domínio verificado e teste real de IdP; não bloquear entrada manual autorizada antes disso |
| Contato de segurança | OWNER_ACTION_REQUIRED | Configurar URI e expiração reais e responsáveis; verificar security.txt |
| Tratamento de dados e termos | OWNER_ACTION_REQUIRED | Parecer jurídico, controlador/operador, bases e termos aprovados; não usar fixtures como aceite legal |
| Retenção, legal hold e export | OWNER_ACTION_REQUIRED | Política aprovada por classe/entidade, hold testado, export autorizado e verificável |
| Provedores | OWNER_ACTION_REQUIRED | Selecionar participantes e contatos reais; testar convite vinculado ao e-mail e visibilidade por provedor |
| RFQ de ensaio | code_complete | Crédito e adquirência fictícios, respostas, comparação, aprovação, decisão e contrato com backend real |
| Contrato e portfolio | ci_validated na baseline | Capturar contrato, marcos e uma facility; verificar fonte e moeda |
| Fees e Value | ci_validated na baseline | Schedule versionada, observação, variance revisada e valor verificado com fonte; não agregar moedas/tipos |
| Opportunities e executivo | ci_validated na baseline | Regra explícita, oportunidade explicada e ação humana; verificar links e cobertura do dashboard |
| Documentos privados | partial | Bucket privado observado; testar upload/view/download e RLS no schema atual |
| Extração/revisão/mapping P1.4 | missing | Implementar foundation e todos os gates de segurança, provenance, review e mappings antes de declarar o fluxo documental pronto |
| Jobs | partial | Agenda diária e renewals observados; validar webhooks/governance/opportunities/deadlines depois do upgrade; registrar cadência real |
| Backup e restore | BLOCKED | Mecanismo comprovado só localmente (05/10). Hospedado: backup real, SHA, destino descartável, probes e duração observada, antes de MFA/uploads; binários do Storage e MFA fora do drill; não afirmar RTO garantido |
| Suporte/escalation | OWNER_ACTION_REQUIRED | Responsáveis, canais, severidades e exercício de incidente; runbooks existentes |
| Proteção e merge | OWNER_ACTION_REQUIRED | Importar `.github/rulesets/{pilot,main}.json`; merge:gates (quatro checks + base contida) imediatamente antes do merge |
| GO operacional | BLOCKED | Doctor, canário, jornada real e gate de evidência GO; zero blocker P0 requerido pelo Pilot |

## Critérios de sucesso a acordar

Medir RFQs concluídas, cobertura de resposta dos provedores, tempo até decisão,
contratos capturados, cobertura de fees, registros de valor verificados,
oportunidades tratadas e documentos revisados (quando P1.4 existir).
Baseline, janela, responsável e meta são definidos com o cliente; nenhum
benchmark, economia ou taxa de conversão é inventado nesta checklist.

A empresa não deve entrar com dados reais enquanto os itens de segurança,
jurídicos, recuperação e jornada hospedada obrigatórios estiverem abertos.
