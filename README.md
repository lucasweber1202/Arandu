# Arandu

Arandu é uma plataforma de curadoria, apresentação e intermediação de arte brasileira contemporânea.

A proposta não é operar como e-commerce genérico. O foco é criar uma experiência de compra e descoberta em que obras, artistas, território, procedência e confiança sejam apresentados com linguagem curatorial.

## Estado atual

O projeto já possui:

- site público com páginas de compra, acervo, obras, artistas, confiança, empresas, narrativa e contato;
- páginas dinâmicas para obra e artista;
- conta de comprador com seleções sincronizadas e reservas vinculadas;
- Minha Seleção com salvamento local, sincronização autenticada e compartilhamento seguro por API;
- proposta curatorial;
- verificação de certificado;
- painel operacional preparado para Supabase;
- API consolidada para Vercel Hobby;
- health check em `/api/health`;
- página técnica `status.html`;
- documentação de lançamento, produção, redes sociais e operação comercial;
- validações de qualidade, links, dados, backend, produção e build.

## Como rodar localmente

```bash
npm install
npm run dev
```

## Como validar antes de deploy

```bash
npm run check:quality
npm run check:all
npm run build
```

## Como validar produção publicada

Depois de cada deploy, rode uma checagem live contra a URL publicada:

```bash
npm run check:live:prod
```

Para validar outro domínio ou preview específico:

```bash
npm run check:live -- https://seu-dominio-ou-preview.vercel.app
```

A página `status.html` consulta `/api/health?probe=1`. Esse modo testa não apenas se as variáveis existem, mas também se as tabelas e views centrais do Supabase respondem.

## Arquitetura de API

A arquitetura atual usa uma função principal consolidada:

```text
api/[...path].js
```

Funções complementares cobrem diagnóstico, coleções, operação comercial, painel MVP e upload administrativo:

```text
api/health.js
api/collections.js
api/commercial.js
api/mvp-dashboard.js
api/upload.js
```

Essa estrutura mantém o projeto abaixo do limite de Serverless Functions do plano Hobby da Vercel.

Rotas públicas e operacionais preservadas:

```text
/api/forms
/api/reservations
/api/proposals
/api/catalog
/api/artists
/api/certificates
/api/certificate-document
/api/admin
/api/admin-update
/api/operational
/api/media
/api/selections
/api/account
/api/dashboard
/api/auth/session
/api/auth/login
/api/auth/signup
/api/auth/logout
/api/health
```

`/api/dashboard`, `/api/mvp-dashboard` e as rotas administrativas exigem o header `x-arandu-admin-token`. `/api/account` exige a sessão do comprador em cookie `HttpOnly` e devolve somente os dados vinculados ao usuário autenticado.

Não recriar arquivos antigos como `api/forms.js`, `api/catalog.js`, `api/admin.js`, `api/dashboard.js` ou `api/auth/login.js`, porque cada arquivo em `api/` conta como função separada na Vercel.

## Variáveis de produção

Na Vercel, configurar:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=
ARANDU_SITE_URL=
```

Depois do deploy, testar:

```text
/status.html
/api/health
/api/health?probe=1
/api/catalog
/api/artists
/api/auth/session
```

## Dados e Supabase

O schema está em:

```text
docs/supabase-schema.sql
```

Em uma instalação nova, rode nesta ordem:

```text
docs/supabase-schema.sql
docs/supabase-production.sql
docs/supabase-sprint1-auth-ownership.sql
```

Em um banco existente, aplique primeiro `docs/supabase-sprint1-auth-ownership.sql` e depois execute novamente `docs/supabase-production.sql`. A migration precisa entrar antes do deploy desta versão.

Para testar o seed:

```bash
npm run seed:supabase:dry
```

Para popular o banco real:

```bash
npm run seed:supabase
```

Bases locais principais:

```text
data/artists.json
data/artworks.json
data/certificates.json
data/search-index.json
data/catalog-intake-template.csv
```

## Documentos operacionais importantes

```text
docs/OPERACAO_COMERCIAL_INDEX.md
docs/GO_LIVE_ARANDU.md
docs/SETUP_PRODUCAO.md
docs/API_CONSOLIDADA_VERCEL.md
docs/SUPABASE_OPERACAO.md
docs/LANCAMENTO_ARANDU.md
docs/REDES_SOCIAIS_ARANDU.md
docs/FLUXO_COMPRA_RESERVA.md
docs/CHECKLIST_PARCEIRA_ARTISTA.md
docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md
docs/PROSPECCAO_COMPRADORES_EMPRESAS.md
docs/CALENDARIO_CONTEUDO_30_DIAS.md
docs/OBJECOES_E_RESPOSTAS.md
docs/METRICAS_FUNIL_ARANDU.md
docs/PRIMEIROS_30_DIAS.md
docs/SEO_DOMINIO_CHECKLIST.md
docs/ACAO_OBRIGATORIA_LUCAS.md
```

## Páginas públicas prioritárias

```text
index.html
comprar-arte.html
acervo.html
obras.html
obra.html?id=...
artistas.html
artista.html?id=...
empresas.html
confianca.html
politica-comercial.html
para-artistas.html
minha-selecao.html
proposta-curatorial.html
certificado-autenticidade.html
verificar-certificado.html
contato.html
```

## Critério para lançamento público

Antes de abrir redes sociais e prospecção ativa, confirmar:

- domínio funcionando;
- `/status.html` sem pendências técnicas críticas;
- `/api/health?probe=1` com Supabase respondendo;
- Supabase configurado;
- migration de propriedade das contas aplicada;
- cadastro, confirmação de e-mail, login, sincronização e logout testados;
- token administrativo configurado;
- WhatsApp ou e-mail real funcionando;
- logo final adicionada;
- pelo menos 5 artistas reais;
- pelo menos 20 obras reais;
- fotos autorizadas;
- política comercial revisada;
- fluxo de reserva claro;
- certificado estruturado;
- 9 posts iniciais prontos.

## Pendências reais de produção

- Configurar Supabase real no ambiente de produção.
- Configurar `ARANDU_ADMIN_TOKEN`.
- Popular Supabase com dados reais.
- Adicionar logo final em `assets/logo-arandu.png`.
- Configurar WhatsApp real em `data/whatsapp-config.js` ou via variável de ambiente.
- Revisar política comercial com apoio jurídico/contábil.
- Substituir obras e artistas demonstrativos por material real autorizado.
- Ajustar `sitemap.xml` com domínio real.
