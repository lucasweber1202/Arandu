# Checklist de SEO e domínio — Arandu

Este checklist deve ser usado quando o domínio real estiver definido.

## 1. Domínio

- Escolher domínio principal.
- Apontar domínio para Vercel.
- Forçar HTTPS.
- Definir domínio canônico com ou sem `www`.
- Testar redirecionamento.
- Configurar e-mail institucional.

## 2. Variáveis e URLs

Atualizar:

```bash
ARANDU_SITE_URL=https://dominio-real.com.br
ARANDU_CONTACT_EMAIL=contato@dominio-real.com.br
ARANDU_WHATSAPP_NUMBER=55...
```

Conferir:

```text
/status.html
/api/health
```

## 3. Sitemap

Atualizar `sitemap.xml` com URLs absolutas do domínio real.

Conferir se não aparecem páginas internas como:

- painel;
- admin-preview;
- demo;
- roadmap;
- templates;
- páginas de teste.

## 4. Robots

Conferir `robots.txt`:

- permitir páginas públicas;
- bloquear páginas internas;
- apontar para sitemap público.

## 5. Títulos e descrições

Revisar títulos de:

- home;
- comprar arte;
- acervo;
- obras;
- artistas;
- confiança;
- empresas;
- para artistas;
- política comercial;
- verificação de certificado.

Cada página deve deixar claro:

- o que é a Arandu;
- que trabalha com arte brasileira contemporânea;
- qual ação o usuário pode tomar.

## 6. Open Graph

Criar imagem de compartilhamento da Arandu.

Adicionar ou revisar:

- `og:title`;
- `og:description`;
- `og:image`;
- `og:url`;
- `twitter:card`.

Priorizar:

- `index.html`;
- `obras.html`;
- `obra.html`;
- `artistas.html`;
- `para-artistas.html`;
- `confianca.html`.

## 7. Conteúdo indexável

Antes de abrir Google/SEO, garantir que o site tenha:

- obras reais;
- artistas reais;
- imagens autorizadas;
- textos curatoriais únicos;
- páginas sem conteúdo placeholder;
- política comercial clara;
- contato real.

## 8. Métricas

Configurar quando fizer sentido:

- Vercel Analytics;
- Google Search Console;
- Google Analytics ou alternativa leve;
- eventos de clique em obra;
- eventos de seleção;
- eventos de reserva;
- eventos de formulário.

## 9. Busca orgânica inicial

Termos que podem orientar páginas e posts:

- arte brasileira contemporânea;
- comprar arte brasileira;
- comprar pintura contemporânea brasileira;
- fotografia brasileira contemporânea;
- arte para apartamento;
- arte para escritório;
- arte para arquitetos;
- certificado de autenticidade de obra de arte;
- artistas brasileiros emergentes.

## 10. Critério de publicação

Só enviar sitemap ao Google quando:

- domínio estiver correto;
- logo estiver finalizada;
- obras reais estiverem cadastradas;
- páginas internas estiverem fora do sitemap;
- WhatsApp ou e-mail real estiver funcionando;
- `npm run check:production` não apontar problemas críticos além de alertas esperados.
