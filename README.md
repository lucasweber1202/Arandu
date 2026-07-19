# Arandu

Arandu é uma plataforma de curadoria, apresentação e intermediação de arte brasileira contemporânea. A experiência relaciona obra, artista, território, procedência e acompanhamento humano, sem tratar o catálogo como um e-commerce genérico.

## Estado atual

Os Sprints 1 a 5 estão implementados no código:

- autenticação Supabase com sessão `HttpOnly`, propriedade dos dados e rate limit;
- catálogo público liberado somente após aprovação de dados reais, autorizações, volume mínimo e teste de escrita;
- navegação pública consolidada, busca visível, menu secundário fechado e paleta pau-brasil/argila/terracota;
- domínio, contato, marca e política comercial tratados como gates de lançamento;
- piloto fechado com código de acesso, sessão protegida, telemetria mínima e feedback;
- API consolidada compatível com o limite de funções do plano Hobby da Vercel;
- página de status em `status.html` e validadores automatizados.

Os dados atuais em `data/artists.json` e `data/artworks.json` continuam classificados como demonstração. O sistema não os apresenta publicamente como catálogo real.

## Rodar localmente

```bash
npm install
npm run dev
```

## Validação

Validação completa de código e contratos:

```bash
npm run check:all
npm run build
```

Os gates externos de liberação são intencionalmente estritos:

```bash
npm run check:catalog:release
npm run check:domain:release
npm run check:commercial:release
npm run check:pilot:release
npm run predeploy
```

`predeploy` só passa depois que catálogo real, domínio, marca, operação comercial e piloto estiverem configurados e aprovados.

## Arquitetura da API

A função principal é `api/[...path].js`. Funções complementares cobrem diagnóstico, coleções, operação comercial, painel MVP e upload:

```text
api/[...path].js
api/health.js
api/collections.js
api/commercial.js
api/mvp-dashboard.js
api/upload.js
```

Rotas principais:

```text
/api/forms
/api/reservations
/api/proposals
/api/catalog
/api/artists
/api/public-config
/api/events
/api/pilot/session
/api/pilot/access
/api/pilot/logout
/api/pilot/feedback
/api/pilot/metrics
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

As rotas administrativas exigem `x-arandu-admin-token`. `/api/account` exige a sessão do comprador. `/api/pilot/metrics` exige token administrativo. Catálogo, gravações e transações não possuem fallback público demonstrativo quando o Supabase ou os gates não estão prontos.

## Variáveis de produção

Use `.env.example` como referência. Os grupos essenciais são:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=

ARANDU_SITE_URL=
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=
ARANDU_BRAND_READY=false
ARANDU_COMMERCIAL_READY=false

ARANDU_PILOT_ENABLED=false
ARANDU_PILOT_APPROVED=false
ARANDU_PILOT_ACCESS_CODE=
ARANDU_PILOT_SECRET=
```

`ARANDU_SITE_URL` precisa usar HTTPS e domínio próprio; previews `*.vercel.app` não satisfazem o gate de lançamento.

## Supabase e catálogo

A ordem oficial das migrations está em `docs/supabase-migrations.json`.

Instalação nova:

```text
docs/supabase-schema.sql
docs/supabase-production.sql
docs/supabase-sprint1-auth-ownership.sql
docs/supabase-sprint2-catalog-readiness.sql
docs/arandu-mvp-collections.sql
docs/supabase-sprint5-pilot.sql
docs/supabase-sprint6-12-platform.sql
```

Banco existente:

```text
docs/supabase-sprint1-auth-ownership.sql
docs/supabase-production.sql
docs/supabase-sprint2-catalog-readiness.sql
docs/arandu-mvp-collections.sql
docs/supabase-sprint5-pilot.sql
docs/supabase-sprint6-12-platform.sql
```

A migration do Sprint 2 deve vir depois de `supabase-production.sql`, pois fecha as policies públicas do catálogo. A migration de coleções depende das views seguras criadas no Sprint 2 e deve vir logo depois dela.

```bash
npm run check:migrations
npm run seed:supabase:dry
npm run seed:supabase
ARANDU_WRITE_TEST_URL=https://preview-protegido.exemplo npm run check:supabase:write
```

O seed real é bloqueado enquanto `data/catalog-release.json` não declarar dados reais aprovados e não houver, no mínimo, 5 artistas e 20 obras verificadas.

## Piloto fechado

Com `ARANDU_PILOT_ENABLED=true`, o site abre um gate de coorte e cria uma sessão protegida no servidor. Os pontos operacionais são:

```text
/piloto.html
/painel-piloto.html
/api/pilot/session
/api/pilot/feedback
/api/pilot/metrics
```

Para proteção rígida de todo o deploy, mantenha também a proteção de acesso do provedor de hospedagem. O gate da aplicação organiza a coorte e a experiência; não substitui a barreira de infraestrutura.

Depois do ciclo, resolva os bloqueadores, defina `ARANDU_PILOT_APPROVED=true` e desative `ARANDU_PILOT_ENABLED` para a abertura pública. O gate de release distingue o piloto em execução do piloto já concluído.

## Documentação operacional

- `docs/SPRINTS_2_A_5_IMPLEMENTACAO.md` — entrega, gates e sequência operacional desta rodada.
- `docs/SETUP_PRODUCAO.md` — configuração de produção e testes.
- `docs/GO_LIVE_ARANDU.md` — roteiro de decisão para abertura.
- `docs/OPERACAO_COMERCIAL_INDEX.md` — índice da operação comercial.
- `docs/SUPABASE_OPERACAO.md` — operação do banco.
- `docs/FLUXO_COMPRA_RESERVA.md` — fluxo comercial.
- `docs/GUIA_CADASTRO_OBRAS_REAIS.md` — preparação do catálogo verdadeiro.
- `docs/CHECKLIST_PARCEIRA_ARTISTA.md` — validação da parceria com artistas.
- `docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md` — prospecção de artistas.
- `docs/PROSPECCAO_COMPRADORES_EMPRESAS.md` — prospecção de compradores e empresas.
- `docs/OBJECOES_E_RESPOSTAS.md` — respostas comerciais padronizadas.
- `docs/CALENDARIO_CONTEUDO_30_DIAS.md` — preparação editorial.
- `docs/METRICAS_FUNIL_ARANDU.md` — métricas do funil.
- `docs/PRIMEIROS_30_DIAS.md` — operação após abertura.
- `docs/SEO_DOMINIO_CHECKLIST.md` — conferência de SEO e domínio.

## Critério de lançamento

O lançamento público só deve ocorrer quando:

- migrations aplicadas e probes do Supabase aprovados;
- teste real de escrita concluído;
- ao menos 5 artistas e 20 obras reais, verificadas e autorizadas;
- domínio próprio, canal de contato e identidade final aprovados;
- política comercial e responsabilidades operacionais aprovadas;
- cadastro, confirmação de e-mail, login, seleção, reserva e logout testados ponta a ponta;
- piloto fechado concluído sem bloqueadores críticos;
- `npm run predeploy` concluído com sucesso.
