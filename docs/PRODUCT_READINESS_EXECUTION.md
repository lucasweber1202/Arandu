# Product readiness execution — Arandu

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

Este pacote implementa a parte de código do plano de prontidão executado pelo Work sem promover dependências externas como concluídas.

## O que entrou

### Staging protegido

- `.github/workflows/staging-release.yml` usa `workflow_dispatch` e o GitHub Environment `staging`.
- exige confirmação literal `ARANDU-STAGING`;
- exige referência verificável de backup e de restore;
- usa apenas segredos do ambiente de staging;
- executa preflight e aplicação pelo fluxo canônico existente;
- gera relatório sem alterar `ops/release-evidence.json`.

Antes de usar, configure no GitHub Environment `staging`:

- `ARANDU_STAGING_DATABASE_URL`;
- `ARANDU_STAGING_WRITE_TEST_URL`;
- `ARANDU_STAGING_SUPABASE_URL`;
- `ARANDU_STAGING_SUPABASE_ANON_KEY`;
- `ARANDU_STAGING_SUPABASE_SERVICE_ROLE_KEY`.

Ative required reviewers no ambiente `staging`. A execução real continua dependente de backup e restore comprovados fora do Git.

### Política comercial

O snapshot comercial passa a exigir também uma referência específica de embalagem:

`ARANDU_PACKAGING_POLICY_REFERENCE`

Decisões reais continuam externas. Use `DECISION_REQUIRED` em documentação de trabalho, mas o runtime rejeita esse valor como evidência aprovada.

### Pedidos

A migration `docs/supabase-orders.sql` adiciona uma entidade `orders` provider-agnostic.

O pedido:

- nasce de uma reserva confirmada;
- copia preço, moeda, comissão e política do snapshot imutável da reserva;
- não aceita preço ou comissão do navegador;
- calcula comissão e valor do artista no banco;
- usa a infraestrutura existente de idempotência;
- possui RLS de leitura própria;
- bloqueia escrita direta de usuários;
- possui auditoria administrativa;
- mantém estados separados de pedido, pagamento, fulfillment e certificado.

A rota `api/orders.js` é administrativa e reutiliza o permissionamento comercial existente.

Nenhum gateway de pagamento foi integrado.

### E-mail transacional

`lib/email.mjs` oferece três providers:

- `disabled` — padrão e sem rede;
- `mock` — testes sem envio;
- `resend` — envio HTTPS quando explicitamente configurado.

Os sete templates atuais cobrem:

- reserva recebida;
- reserva confirmada;
- reserva expirada;
- proposta recebida;
- proposta atualizada;
- contato recebido;
- alerta administrativo.

Nenhum e-mail real é enviado durante os checks.

### Readiness e observabilidade

O readiness agora verifica:

- existência da tabela `orders`;
- configuração efetivamente pronta do e-mail transacional.

A observabilidade ganhou campos operacionais adicionais e redação básica de e-mail, telefone e segredos antes do envio a um endpoint externo.

## Validação

O gate `npm run check:product-readiness` garante estaticamente que:

- orders está no final dos dois fluxos de migration;
- RLS, idempotência e auditoria existem na migration;
- a API não aceita preço/moeda/comissão do cliente;
- e-mail está desativado por padrão e possui sete templates;
- staging real é manual, protegido e não promove gates;
- embalagem faz parte do snapshot comercial;
- readiness cobre orders e e-mail.

## Gates externos preservados

Este pacote não conclui automaticamente nenhum dos 13 gates de `ops/release-evidence.json`.

Continuam exigindo evidência real:

1. preflight/migration em staging;
2. backup e restore;
3. write canary;
4. isolamento RLS no ambiente real;
5. concorrência de reserva no ambiente real;
6. catálogo real;
7. política comercial aprovada;
8. monitoramento real;
9. contato LGPD;
10. domínio HTTPS;
11. piloto fechado.

## Ordem recomendada

1. revisar e integrar esta PR;
2. habilitar o GitHub Environment `staging` com required reviewers;
3. preencher somente segredos de staging;
4. executar rehearsal;
5. realizar backup e restore real;
6. executar `Arandu Protected Staging Release`;
7. revisar relatórios;
8. só então atualizar manualmente os gates com responsável, data e referência verificável.
