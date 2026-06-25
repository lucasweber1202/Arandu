# Modo produção — Arandu

Este documento separa o que é demonstração, pré-lançamento e produção.

## Demo

Uso apenas para validar layout, navegação e narrativa.

Sinais de demo:

- Supabase ausente.
- Dados locais ou demonstrativos.
- WhatsApp placeholder.
- Logo provisória.
- Política comercial sem revisão final.

## Pré-lançamento

Uso para testar operação com poucos artistas e compradores.

Critérios:

- `/status.html` respondendo.
- `/admin.html` acessível com token.
- Formulário de artista funcionando.
- Reserva de obra funcionando.
- Checklist em `/lancamento.html` acompanhado.
- Pelo menos parte do catálogo já conferida.

## Produção

Uso público e comercial.

Critérios:

- Supabase real configurado.
- Token administrativo configurado.
- Domínio final configurado.
- WhatsApp ou e-mail real configurado.
- Catálogo real com autorização.
- Política comercial revisada.
- Certificados testados.
- Páginas internas fora do sitemap.

## Regras práticas

1. Não divulgar redes sociais enquanto `/status.html` mostrar pendências críticas.
2. Não publicar obra sem autorização de imagem e ficha técnica.
3. Não confirmar venda sem disponibilidade, envio, preço, pagamento e certificado.
4. Não tratar reserva como compra automática.
5. Não usar dados demonstrativos em produção.
