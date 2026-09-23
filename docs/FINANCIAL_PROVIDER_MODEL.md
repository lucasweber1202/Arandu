# Modelo de provedor

## Duas entidades diferentes

O produto distingue, de propósito, duas coisas que costumam ser confundidas:

1. **`fin_providers`** — o **cadastro** que a empresa compradora faz do provedor
   com quem quer cotar. É um registro da empresa, no tenant da empresa. Serve
   para convidar, comparar e contratar mesmo que o provedor nunca use o Arandu.
2. **`fin_organizations` com `kind='PROVIDER'`** — a **conta** do provedor no
   Arandu, com seus próprios membros. É ela que aceita convites e envia
   propostas.

O convite (`fin_rfq_invites`) é a ponte: nasce apontando para o cadastro
(`provider_id`) e, quando aceito, passa a apontar também para a conta
(`provider_organization_id`).

## Tipos iniciais

`bank`, `fintech`, `acquirer`, `subacquirer`, `credit_provider`,
`payment_provider`, `other`.

Seguradoras, corretoras de seguros, instituições de câmbio, empresas de leasing
e garantidoras entram quando os produtos correspondentes entrarem — não antes.

## Afirmações regulatórias

O Arandu **não afirma que um provedor é regulado**. O campo
`verification_state` nasce `NAO_VERIFICADO` e só passa a `EVIDENCIA_REGISTRADA`
quando existirem, simultaneamente:

* `regulator_authority` — qual autoridade;
* `regulator_registry` — qual registro;
* `regulator_evidence_url` — evidência acessível por `https://`;
* `regulator_checked_at` — data da consulta.

A constraint `fin_provider_evidence_required` recusa a linha caso contrário, e
há teste de banco verificando essa recusa. Mesmo com evidência, o rótulo na
interface é "evidência registrada em <data>", não "instituição regulada" — a
diferença é deliberada.

## O que o portal do provedor permite

* aceitar convite (uso único, com expiração);
* ver as RFQs atribuídas à própria organização;
* ver os requisitos da solicitação;
* preencher a proposta nos campos padronizados do produto;
* salvar rascunho local no próprio navegador;
* enviar;
* revisar a própria proposta, criando uma nova versão;
* acompanhar o estado da própria proposta.

## O que o portal do provedor não permite

* ver propostas de concorrentes;
* ver notas internas da empresa compradora;
* ver a decisão antes de registrada;
* trocar de organização ao responder;
* personificar outro provedor;
* manipular identificadores para alcançar RFQ não atribuída.

Cada um desses pontos é bloqueado no banco (RLS + chaves compostas +
`SECURITY DEFINER`), não apenas na interface.

## Monetização futura (não implementada)

Nenhum billing existe nesta rodada. As hipóteses registradas para o lado do
provedor são: assinatura, lead qualificado, taxa de sucesso e acesso
corporativo.

> **LEGAL_REVIEW_REQUIRED** — qualquer modelo ligado a *success fee* sobre
> contratação de produto financeiro precisa de análise jurídica humana antes de
> ser desenhado, comunicado ou implementado.
