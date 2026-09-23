# Primeiro piloto do Arandu Finance — ficha operacional

Documento de trabalho. **Preencha; não invente.** Nenhuma empresa ou
instituição real aparece aqui até alguém decidir quais serão.

---

## Empresa compradora

```
Razão social:        [ definir ]
CNPJ:                [ definir ]
Setor:               [ definir ]
Faixa de faturamento:[ ate_360k | 360k_4_8m | 4_8m_30m | 30m_300m | acima_300m ]
Responsável:         [ nome ]
Cargo:               [ CFO | gerente financeiro | controller | fundador ]
E-mail (entra na allowlist): [ definir ]
Telefone:            [ definir ]
```

## Produto do piloto

```
[ ] Crédito empresarial
[ ] Adquirência / meios de pagamento
```

Escolha **um** para o primeiro ciclo. Os dois funcionam; rodar os dois ao
mesmo tempo dobra a variável sem dobrar o aprendizado.

## Necessidade

```
Crédito
  Valor:       R$ [ definir ]
  Finalidade:  [ capital_de_giro | investimento | expansao | refinanciamento | antecipacao_recebiveis | outro ]
  Prazo:       [ ] meses
  Carência:    [ ] meses
  Garantias:   [ definir ]
  Urgência:    [ baixa | media | alta ]

Adquirência
  Faturamento mensal em cartões: R$ [ definir ]
  Ticket médio:                  R$ [ definir ]
  Mix (precisa somar ~100%):     débito [ ]% · crédito à vista [ ]% · parcelado [ ]% · PIX [ ]%
  Terminais:                     [ ]
  Liquidação desejada:           [ ] dias
  Adquirente atual:              [ definir ]
```

## Provedores

Mínimo **três** — com menos, a comparação tem pouco a comparar.

```
1.  Instituição:  [ definir ]
    Tipo:         [ bank | fintech | acquirer | subacquirer | credit_provider | payment_provider | other ]
    Contato:      [ nome ]
    E-mail:       [ definir ]   ← entra na allowlist
    Como chegamos:[ indicação | relação existente | prospecção ]

2.  ...
3.  ...
```

## Datas

```
Ambiente pronto:        [ ]
Empresa cadastrada:     [ ]
RFQ aberta:             [ ]
Prazo de resposta:      [ ]
Comparação com a empresa:[ ]
Decisão registrada:     [ ]
Retrospectiva:          [ ]
```

## Responsáveis

```
Responsável Arandu (operação):   [ definir ]
Responsável Arandu (suporte):    [ definir ]
Responsável na empresa:          [ definir ]
```

---

## Checklist de execução

### Antes de convidar alguém

- [ ] revisão jurídica dos itens de `FINANCIAL_LEGAL_REVIEW_REQUIRED.md` concluída
- [ ] Supabase do piloto criado e separado de qualquer outro ambiente
- [ ] as três migrations financeiras aplicadas, nesta ordem
- [ ] `ARANDU_ENV=pilot npm run finance:env:check` sem erros
- [ ] `npm run test:pilot` aprovado
- [ ] `npm run test:database` aprovado
- [ ] allowlist (`fin_pilot_allowlist`) com os e-mails da empresa e dos provedores
- [ ] `ARANDU_PRESENTATION_MODE` **desligado** — dado DEMO não convive com dado real
- [ ] nenhum dado de seed DEMO no banco do piloto
- [ ] versão dos termos definida (ex.: `2026-09-23-pilot`) e aceite registrado
- [ ] backup verificado (ver `FINANCIAL_PILOT_PLAYBOOK.md`)

### Durante

- [ ] empresa criada pelo responsável dela, não por nós
- [ ] cadastro completo (CNPJ, setor, porte)
- [ ] perfil financeiro com ao menos três campos
- [ ] provedores cadastrados
- [ ] RFQ criada pela empresa
- [ ] RFQ aberta
- [ ] convites gerados e entregues (manualmente enquanto o envio estiver desligado)
- [ ] cada provedor aceitou
- [ ] propostas recebidas
- [ ] comparação feita **com** a empresa presente, observando onde ela trava
- [ ] pesos aplicados pela empresa, não por nós
- [ ] decisão registrada pela empresa
- [ ] contrato registrado
- [ ] tarefa de renovação conferida

### Depois

- [ ] exportação do processo salva (`Exportar este processo`)
- [ ] métricas coletadas (`GET /api/finance/pilot-metrics`)
- [ ] feedback da empresa registrado
- [ ] feedback de cada provedor registrado
- [ ] bugs abertos com passo a passo
- [ ] decisão de continuidade

---

## O que NÃO fazer no piloto

* prometer aprovação de crédito a quem quer que seja;
* dizer a um provedor qual foi a proposta de outro;
* opinar sobre qual proposta a empresa deve escolher;
* preencher a RFQ ou aplicar os pesos pela empresa — o que se quer medir é se
  **ela** consegue;
* alterar dados direto no banco para "consertar" algo durante a sessão;
* rodar `finance:seed:demo` no ambiente do piloto (o script recusa, mas não
  tente).
