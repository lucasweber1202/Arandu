# Roadmap — Financial Procurement

## Entregue até aqui

**Pivot (PR #64):** crédito empresarial e adquirência ponta a ponta —
organização, perfil financeiro, provedores, RFQ com máquina de estados, convite
de uso único, propostas versionadas, comparação factual, pesos do usuário,
decisão humana com snapshot, contrato e janela de renovação. Portais de empresa
e de provedor. RLS, RBAC e isolamento multi-tenant testados contra PostgreSQL
real.

**Hardening para piloto (esta rodada):** travas de unicidade em decisão e
contrato, idempotência no envio de proposta, correção da pontuação por pesos
(empates e cobertura), estimativas que recusam SAC/bullet/carência/pós-fixado
dizendo o motivo, validação do mix de recebimentos, validação local de CNPJ,
completar cadastro da empresa, evidência regulatória de provedor, rotas de
documento e tarefa, página de aceite de convite com estados, comparação em
cartões no celular, assistente de criação de RFQ e consultas com número fixo.

## Próxima rodada — completar o núcleo

1. **Upload seguro de documento**, reaproveitando a infraestrutura existente:
   validação de tipo, tamanho, hash, vínculo de entidade, autorização, storage,
   política de acesso e retenção. Enquanto não existir, `fin_documents` continua
   sendo referência.
2. **Ligar as notificações**: os modelos e a linha da outbox já existem; falta
   credencial de envio, domínio verificado e preferência de notificação por
   membro.
3. **Registro de aceite de termos** no produto, hoje feito fora dele.
4. **Instrumentar a abertura da comparação**, para que a métrica
   correspondente deixe de ser incalculável.
5. **Exportação** da comparação (CSV/PDF) com os mesmos rótulos de neutralidade.
6. **Console administrativo** da vertical, sob sessão administrativa com MFA,
   RBAC, auditoria e motivo.
7. **Validação de CNPJ** contra fonte oficial — hoje só formato e dígitos.

## Depois — consolidar a identidade de provedor

O vínculo entre o cadastro do comprador e a conta canônica do provedor já é
preenchido no aceite do convite. A extração de uma tabela global de provedores
tem plano de migração escrito em
[`FINANCIAL_PROVIDER_CANONICALIZATION.md`](FINANCIAL_PROVIDER_CANONICALIZATION.md),
e só se justifica quando houver necessidade real — nenhum dos dois fluxos atuais
precisa dela.

## Depois — mais produtos financeiros

A arquitetura já comporta: um produto novo é uma entrada em
`lib/finance/products.mjs` (campos de demanda, campos de proposta, direção de
comparação) mais o valor correspondente no `check` de `product`. Ordem sugerida:

1. garantias e fianças;
2. câmbio;
3. leasing;
4. seguros empresariais;
5. antecipação de recebíveis estruturada.

Cada um entra com revisão jurídica própria. Nenhum entra "de graça" só porque o
schema aceita.

## Depois — benchmarking anonimizado

Só quando existirem, simultaneamente:

* volume suficiente para que nenhuma linha seja reidentificável;
* política de anonimização validada juridicamente;
* consentimento claro das empresas;
* metodologia publicada.

Antes disso, nenhum agregado é exibido.

## Monetização (documentada, não implementada)

**Empresa:** Free/Trial, Finance, Enterprise.
**Provedor:** assinatura, lead qualificado, taxa de sucesso, acesso corporativo.

> **LEGAL_REVIEW_REQUIRED** — modelos ligados a taxa de sucesso sobre a
> contratação de produto financeiro exigem análise jurídica humana antes de
> qualquer desenho ou comunicação.

## Fora do roadmap desta fase

Conceder crédito, custodiar recursos, executar pagamentos, operar crowdfunding,
virar VC, gerir investimentos ou automatizar a escolha da proposta. Essas não
são "fases futuras" deste produto: são outros produtos, com outro enquadramento.
