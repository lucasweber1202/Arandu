# Runbook do MVP — Financial Procurement

## Pré-requisitos

* Node 22, PostgreSQL 16 para os testes de banco.
* Supabase configurado (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) para o fluxo real.
  Sem essas variáveis, os portais mostram o estado "entre na sua conta" e as
  rotas `/api/finance/*` respondem 503 — comportamento fail-closed esperado.

## Aplicar a migration

As migrations entram por último na ordem canônica, nos dois fluxos
(`cleanInstall` e `existingDatabase`) de `docs/supabase-migrations.json`, nesta
ordem:

```
docs/supabase-financial-procurement.sql
docs/supabase-financial-procurement-hardening.sql
docs/supabase-financial-pilot.sql
```

Ela é aditiva e reaplicável. Rollback manual (nunca automático):

```
docs/rollback/supabase-financial-procurement.rollback.sql
```

O rollback remove as policies `fin_*` antes das tabelas, para não precisar de
`cascade` e não alcançar nada fora desta migration.

## Fluxo ponta a ponta — crédito

1. **Criar organização compradora**
   `POST /api/finance/organizations` com `kind: "BUYER"`.
   O criador vira `admin` atomicamente.
   Depois, `PATCH /api/finance/organizations` completa nome fantasia, CNPJ,
   setor e porte. O CNPJ é conferido em formato e dígitos; a resposta separa
   `format_valid` de `externally_verified`, que é sempre falso nesta fase.
2. **Preencher o perfil financeiro** (opcional, reutilizável)
   `POST /api/finance/profile` — cada campo guarda origem, responsável e data.
3. **Cadastrar provedores**
   `POST /api/finance/providers`.
4. **Criar a RFQ**
   `POST /api/finance/rfqs` com `product: "credit"` e a demanda. Nasce `draft`.
5. **Abrir a RFQ**
   `POST /api/finance/transition` `{kind:"rfq", from:"draft", status:"open"}`.
6. **Convidar provedores**
   `POST /api/finance/invites/send` — devolve o token **uma única vez**.
7. **Provedor aceita**
   O provedor cria a organização `PROVIDER` e chama
   `POST /api/finance/invites/accept`. A proposta é criada vazia.
8. **Provedor envia proposta**
   `POST /api/finance/proposals`. A RFQ passa sozinha de `open` para
   `collecting`. Reenvios criam versões novas.
9. **Comparar**
   `POST /api/finance/comparison` com `rfq_id`. Sem `weights`, a resposta é
   estritamente factual. Com `weights`, vem também o bloco rotulado como
   resultado da empresa.
10. **Decidir**
    `POST /api/finance/transition` para `comparing`, depois
    `POST /api/finance/decisions`. A RFQ vai para `decided` e o snapshot é
    gravado.
11. **Registrar contrato**
    `POST /api/finance/contracts`. A RFQ vai para `contracted`.
12. **Acompanhar renovação**
    `GET /api/finance/contracts` devolve `review_from` e `days_to_end`, e o
    registro do contrato já criou a tarefa de revisão em `fin_tasks`.

Para montar o portal inteiro em uma chamada, `GET /api/finance/overview`
devolve organização, RFQs com propostas, provedores, contratos, perfil e
tarefas. O portal do provedor usa `GET /api/finance/assignments`.

## Fluxo ponta a ponta — adquirência

Idêntico, com `product: "acquiring"`. A demanda traz o perfil transacional
(volume, ticket, fatias de débito/crédito/parcelado/PIX, terminais, liquidação
desejada) e as propostas trazem MDR, taxa PIX, antecipação, aluguel de
terminal, gateway, liquidação, chargeback, prazo, multa e extras.

## Validação local

```bash
npm ci --include=optional
npm run finance:env:check  # ambiente: o que falta e o que é combinação proibida
npm run test:pilot         # jornada ponta a ponta, sem banco real
npm run check:all          # inclui check:finance, que inclui test:pilot
npm run build
npm run check:dist-assets
npm run check:build-size
npm run check:navigation
npm run test:database      # PostgreSQL real: clean install, upgrade, replay, rollback
npm run test:e2e:list
npm run test:e2e
npm run test:e2e:presentation
git diff --check
```

## Modo de demonstração

```bash
ARANDU_PRESENTATION_MODE=true VERCEL_ENV=preview npm run build
```

O conjunto fictício vive no motor da demonstração (`finance/demo/`), com
organizações, provedores, RFQs e propostas claramente marcadas como `DEMO`. O build **falha**
se `ARANDU_PRESENTATION_MODE` for ligado com `VERCEL_ENV=production`
(`assertPresentationModeIsSafe`). No build publicado normal, nenhuma página do
portal carrega dado demonstrativo — há teste E2E que verifica isso.

## Limitações conhecidas desta rodada

* **Upload de documento não existe.** `fin_documents` guarda apenas referência
  `https://`. Não improvisamos upload: fazê-lo com segurança exige validação de
  tipo, tamanho, assinatura, vínculo de entidade, autorização, storage, política
  de acesso e retenção. Enquanto isso não for reaproveitado corretamente da
  infraestrutura existente, a limitação fica declarada.
* **CNPJ não é validado** contra base oficial. O campo aceita 14 dígitos.
* **Assinatura eletrônica não existe.** O contrato é um registro, não um
  instrumento assinado.
* **Benchmarking não é exibido.** A estrutura existe; o dado agregado, não.
* **Economia não é calculada.** O painel declara isso explicitamente.
* **Notificações de renovação são exibidas na interface**, não enviadas por
  e-mail. Os oito modelos estão prontos em `lib/finance/email-templates.mjs` e
  produzem a linha da outbox existente, mas nada é enfileirado nem enviado —
  ver [`FINANCIAL_EMAIL_TEMPLATES.md`](FINANCIAL_EMAIL_TEMPLATES.md).
* **O texto dos termos não existe.** O registro de aceite existe (versão, quem,
  quando); o documento a ser aceito continua `LEGAL_REVIEW_REQUIRED`.
* **Não há preferência de notificação por membro**, o que é pré-requisito para
  ligar os e-mails.
* **Não há console administrativo** cruzando organizações. O diagnóstico usa o
  painel da organização, a trilha de eventos e as métricas do piloto.
* **Admin da vertical é leitura pelo painel da própria organização.** Não há
  console administrativo cruzando organizações; ações sensíveis continuam
  restritas ao modelo administrativo existente do Arandu.
