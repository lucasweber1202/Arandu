# Fluxo operacional — compra, reserva e proposta

Este documento define o funcionamento mínimo do processo comercial da Arandu antes de integrar pagamento online.

## 1. Objetivo

Permitir que um comprador demonstre interesse, reserve uma obra ou peça proposta curatorial com clareza, sem parecer um e-commerce genérico.

## 2. Caminhos de entrada

O comprador pode chegar por:

- página da obra;
- página de acervo;
- página de artistas;
- Minha Seleção;
- proposta curatorial;
- formulário de contato;
- WhatsApp;
- Instagram.

## 3. Reserva de obra

### Etapa 1 — interesse

O comprador clica em reservar ou entra em contato sobre uma obra.

Dados mínimos:

- nome;
- WhatsApp;
- e-mail, quando possível;
- obra desejada;
- mensagem ou contexto de interesse.

### Etapa 2 — confirmação interna

A curadoria confirma:

- se a obra está disponível;
- se o preço está atualizado;
- se o artista confirma disponibilidade;
- se há custo de embalagem ou frete;
- se há certificado disponível.

### Etapa 3 — reserva temporária

Status sugerido:

```text
requested -> confirmed -> converted
requested -> expired
requested -> cancelled
```

Prazo recomendado de reserva inicial:

```text
48 horas
```

Esse prazo pode ser ajustado para obras de maior valor ou negociações com empresas.

### Etapa 4 — proposta e pagamento

Antes de pagamento integrado, a Arandu deve enviar confirmação por mensagem com:

- obra;
- artista;
- valor;
- prazo de reserva;
- forma de pagamento combinada;
- previsão de envio;
- política de devolução;
- certificado incluído ou não.

### Etapa 5 — pós-venda

Após confirmação:

- atualizar status da obra;
- registrar comprador;
- registrar forma de pagamento;
- confirmar embalagem;
- confirmar envio;
- emitir ou vincular certificado;
- acompanhar entrega.

## 4. Minha Seleção

A página `minha-selecao.html` deve funcionar como ponte entre navegação e proposta.

Uso recomendado:

1. comprador adiciona obras à seleção;
2. envia seleção para curadoria;
3. curadoria responde com contexto, disponibilidade e sugestões;
4. seleção pode virar proposta comercial.

## 5. Proposta curatorial

A proposta deve ser usada para:

- arquitetos;
- empresas;
- compradores indecisos;
- presentes corporativos;
- composição de ambientes;
- seleção de obras por orçamento.

Dados mínimos:

- cliente;
- tipo de espaço;
- objetivo;
- orçamento aproximado;
- prazo;
- obras sugeridas;
- observações de curadoria.

## 6. Regras de confiança

Todo contato comercial deve deixar claro:

- a obra pode estar sujeita à confirmação de disponibilidade;
- a reserva não é venda concluída;
- o certificado acompanha a obra quando previsto;
- frete e embalagem podem variar por localidade;
- prazos devem ser confirmados antes do pagamento.

## 7. Métricas para acompanhar

No painel, acompanhar:

- leads recebidos;
- reservas solicitadas;
- reservas confirmadas;
- reservas convertidas;
- propostas enviadas;
- obras mais selecionadas;
- artistas com mais interesse;
- tempo médio de resposta.

## 8. Prioridade de resposta

Responder primeiro:

1. comprador com obra específica;
2. comprador com seleção enviada;
3. empresa/arquiteto com orçamento e prazo;
4. artista interessado;
5. contato institucional.
