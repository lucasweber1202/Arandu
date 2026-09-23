# Provedor canônico e relação comprador–provedor

## A pergunta

O cadastro de provedor é feito por empresa compradora. Se Empresa A, B e C
cadastram o "Banco X", existem três linhas em `fin_providers`. Isso é
duplicação estrutural que impede escala?

## A resposta, com evidência

**A separação que a pergunta pede já existe no schema — com outros nomes.**

| Conceito | Tabela | O que é |
| --- | --- | --- |
| Provedor canônico | `fin_organizations` com `kind='PROVIDER'` | A identidade única do provedor no Arandu, com membros, login e portal próprios. Uma por instituição. |
| Relação comprador–provedor | `fin_providers` | O registro que **a empresa compradora** mantém: contato, gerente, notas internas, estado, evidência regulatória consultada por ela. Uma por par (comprador, provedor). |

As três linhas de "Banco X" não são três identidades do Banco X. São três
relações comerciais diferentes, com contatos e notas diferentes, que é
exatamente o que cada empresa precisa manter em separado.

O que o provedor vê já é canônico hoje: `fin_proposals.provider_organization_id`
aponta para a **conta** do provedor, não para o cadastro do comprador. Por isso
o portal do provedor mostra, numa lista só, as solicitações de todos os
compradores que o convidaram — sem nenhuma consolidação adicional.

### O que estava realmente faltando

A coluna `fin_providers.provider_organization_id` existia desde a migration
base e **nunca era preenchida**. O cadastro do comprador ficava órfão da conta
do provedor mesmo depois de o convite ser aceito, e a única forma de agrupar
"Banco X" entre compradores seria casar por nome — que é a dívida de verdade.

**Implementado nesta rodada:** `fin_accept_provider_invite` passa a preencher
esse vínculo no aceite. É aditivo, não muda API, não muda RLS e cria a chave
real de agrupamento que qualquer consolidação futura vai precisar.

## Por que NÃO fizemos a extração de `financial_provider_entities` agora

1. **Não há problema a resolver hoje.** Os dois fluxos do MVP — comparar
   propostas de uma RFQ e responder a RFQs atribuídas — nunca precisam de
   identidade cruzada entre compradores.
2. **O único caso que precisaria é o benchmarking**, que está explicitamente
   fora de escopo e bloqueado até existir política de anonimização validada.
3. **O custo é alto e o risco é de segurança.** Uma tabela de provedores
   legível por todos os compradores exige separar, linha a linha, o que é
   público (razão social, CNPJ, tipo) do que é privado de um comprador
   (contato, gerente, notas internas, evidência que ele consultou). Errar essa
   separação vaza a nota interna de uma empresa para outra — exatamente o que
   a instrução desta rodada proíbe.
4. **Quebraria o que já funciona.** `fin_rfq_invites` e `fin_proposals`
   referenciam `fin_providers` por chave composta com `organization_id`. Trocar
   o alvo dessas FKs é reescrever o isolamento multi-tenant inteiro, no meio de
   uma rodada cujo objetivo é deixar o fluxo pilotável.

## Como migrar quando for a hora

Pré-condição: existir necessidade real (benchmarking aprovado, ou diretório
público de provedores).

1. Criar `fin_provider_entities` (razão social, CNPJ, tipo, site, metadados
   regulatórios, status) — **sem nenhum campo privado de comprador**.
2. Popular a partir de `fin_organizations kind='PROVIDER'`, que já é canônica,
   e de agrupamento por CNPJ onde ele tiver sido informado.
3. Acrescentar `fin_providers.provider_entity_id` como nullable. O vínculo já
   implementado (`provider_organization_id`) é a ponte para preencher isso sem
   casar por nome.
4. Manter `fin_providers` como a relação: contato, gerente, notas, preferido,
   última interação. **Nada privado sobe para a entidade canônica.**
5. RLS da entidade canônica: leitura para `authenticated`, escrita só por
   caminho administrativo auditado.
6. Só então, se fizer sentido, migrar as FKs de convite e proposta.

Cada passo é aditivo e reversível. Nenhum exige parar o produto.

## Invariante que não pode ser quebrada

> Nenhuma canonicalização pode fazer um provedor enxergar dados de outro
> comprador, nem um comprador enxergar o cadastro, o contato ou as notas de
> outro.

Há teste de banco para isso em `tests/database/financial-procurement-hardening.sql`:
depois de o vínculo canônico ser criado, o provedor continua sem conseguir ler
`fin_providers` — que é do comprador.
