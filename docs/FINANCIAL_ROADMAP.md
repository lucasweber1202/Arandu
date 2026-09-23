# Roadmap — Financial Procurement

## Rodada atual (entregue)

Crédito empresarial e adquirência ponta a ponta: organização, perfil financeiro,
provedores, RFQ com máquina de estados, convite de uso único, propostas
versionadas, comparação factual, pesos do usuário, decisão humana com snapshot,
contrato e janela de renovação. Portais de empresa e de provedor. RLS, RBAC e
isolamento multi-tenant testados contra PostgreSQL real.

## Próxima rodada — completar o núcleo

1. **Upload seguro de documento**, reaproveitando a infraestrutura existente:
   validação de tipo, tamanho, hash, vínculo de entidade, autorização, storage,
   política de acesso e retenção. Enquanto não existir, `fin_documents` continua
   sendo referência.
2. **Notificações** de prazo de resposta, validade de proposta e janela de
   renovação, pelo outbox transacional já existente.
3. **Exportação** da comparação (CSV/PDF) com os mesmos rótulos de neutralidade.
4. **Admin operacional** da vertical: visão de organizações, provedores, RFQs,
   convites, propostas, contratos, falhas, eventos e abuso, sob sessão
   administrativa com MFA, RBAC, auditoria e motivo.
5. **Validação de CNPJ** contra fonte oficial.

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
