# Arandu — operação pronta para uso

Este documento resume o que já pode ser usado agora e o que ainda depende de configuração real de produção.

## O que já está utilizável

### Site público

- `index.html` — entrada pública sem aba de MVP.
- `comprar-arte.html` — catálogo com filtros, coleções e reserva assistida.
- `colecoes.html` — coleções curatoriais comerciais.
- `artistas.html` — vitrine de artistas.
- `confianca.html` — certificados, reserva, envio e privacidade.
- `pesquisa.html` — busca por intenção.
- `narrativa.html` — hub editorial.

### Comercial e operação

- `go-live.html` — cockpit de prontidão real.
- `diagnostico-catalogo.html` — score de completude por obra/artista.
- `kanban-comercial.html` — kanban comercial com modo demo e modo Supabase.
- `funil-comercial.html` — métricas do funil com modo demo e modo Supabase.
- `templates-comunicacao.html` — mensagens copiáveis para artistas, compradores, empresas, reservas e propostas.

### Confiança e venda assistida

- `certificado-imprimivel.html` — certificado imprimível com código, hash e link de verificação.
- `verificar-certificado.html` — verificação pública.
- `proposta-publica.html` — proposta curatorial pública com modo demo e impressão/PDF.
- `minha-selecao.html` — seleção de obras.

## O que ainda precisa de dados reais

1. Inserir `assets/logo-arandu.png` final.
2. Configurar WhatsApp real em `data/whatsapp-config.js` ou variável equivalente.
3. Configurar variáveis na Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ARANDU_ADMIN_TOKEN`
   - `ARANDU_SITE_URL`
4. Rodar schema Supabase e seeds.
5. Substituir artistas/obras demonstrativos por registros reais autorizados.

## Como validar agora

```bash
npm run check:production
npm run check:backend
npm run check:quality
npm run check:ux
npm run check:all
```

## Ordem recomendada para lançar rápido

1. Rodar os checks locais.
2. Abrir `go-live.html`.
3. Conferir `diagnostico-catalogo.html`.
4. Configurar WhatsApp/e-mail.
5. Configurar Supabase e token na Vercel.
6. Subir logo final.
7. Testar reserva de obra.
8. Testar certificado imprimível.
9. Testar proposta pública.
10. Divulgar apenas depois de validar contato e reserva.
