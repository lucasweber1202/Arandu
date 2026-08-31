# Release Candidate 1 — o que falta para lançar, e de quem é

Este documento existe para responder duas perguntas, sem abrir o código:

1. **O que ainda falta para lançar?**
2. **Isso é código ou é operação?**

Ele é o ponto de passagem entre o desenvolvimento e a operação real. Depois
desta rodada a intenção é congelar features e passar a executar o que só se
resolve fora do repositório.

Base: `main` em `bd60a44` (merge do PR #58).

---

## Leitura rápida

| Frente | Estado | Depende de |
|---|---|---|
| Código e contratos | **Pronto** | — |
| Beta pública (acervo fechado) | **Falta ambiente** | Supabase, migrations, env, domínio |
| Catálogo real publicado | **Bloqueado** | Artistas, obras, autorizações |
| Comércio aberto (reserva/pagamento) | **Bloqueado** | Jurídico e comercial |
| Go-live completo (`predeploy`) | **Bloqueado, por projeto** | Todas as evidências externas |

`npm run predeploy` **deve continuar falhando** enquanto as evidências externas
não existirem. Isso não é um defeito: é o gate que impede publicar um catálogo
demonstrativo como real e uma política comercial rascunho como aprovada.

**A beta não depende do `predeploy`.** A beta é um estado menor e legítimo do
produto: site publicado, acervo declaradamente fechado, compra declaradamente
fechada, e dois canais abertos que funcionam de verdade — submissão de
portfólio e contato com a curadoria.

---

## A. Código concluído

Nada abaixo depende de mais desenvolvimento para a beta.

**Jornada do comprador**
- Home, navegação pública, pesquisa, acervo, artistas, coleções, página da
  obra, comparação de obras, minha seleção, login, criar conta, minha conta,
  contato com a curadoria.
- Com o acervo em validação, o produto diz isso e oferece as saídas que
  existem. Nenhum controle inerte fica na página: filtro, ordenação, atalhos
  de coleção e o painel de compra rápida saem quando não há listagem para
  operar (catraca em `tests/e2e/public-journeys.spec.js`).
- Links com recorte (`comprar-arte.html?q=...`) entregam o recorte prometido.

**Jornada do artista**
- Convite, critérios, checklist, formulário de submissão, mensagem de sucesso
  específica, portal do artista com explicação de acesso.
- Com o banco indisponível, o envio **falha de forma honesta**: não inventa
  sucesso, guarda rascunho local por 24 h e oferece canal alternativo.

**Jornada de empresas e arquitetos**
- Proposta, briefing, confirmação, portal de empresa com 401 explicado.

**Superfícies internas**
- Admin, painéis, console e manuais (`/docs/*.md`) exigem sessão
  administrativa no servidor (`api/internal-page.js`) e redirecionam para o
  login. Nenhuma página pública aponta para elas.

**Plataforma**
- Autenticação, RBAC, RLS, MFA, proteção contra enumeração, minimização de
  DTO, rate limit, CSP, `no-store`, `noindex` interno, validação de upload,
  retenção/LGPD, legal hold, outbox com fencing.
- Testes de banco reais (instalação limpa, upgrade, reaplicação, rollback,
  RLS, transações, pedidos, outbox, retenção) passam contra PostgreSQL 16.

**Medição da beta** (ver seção sobre analytics abaixo)
- `catalog_view`, `artwork_view`, `selection_add`, `contact_start` (formulário,
  WhatsApp e e-mail), `submit_artist_application`, `search`, com UTM e página
  de entrada em todo evento.

---

## B. Exige ambiente

Isto é configuração, não código. Sem isto a beta sobe, mas **não persiste
nada** — os formulários falham de forma honesta e nenhuma candidatura é
gravada.

### B1. Supabase (bloqueia a beta)

| Variável | Para quê |
|---|---|
| `SUPABASE_URL` | Leitura pública e escrita dos formulários |
| `SUPABASE_ANON_KEY` | Login e leitura pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Escrita servidor (segredo, nunca no browser) |

### B2. Migrations (bloqueia a beta)

Aplicar na ordem de `docs/supabase-migrations.json`
(`cleanInstall` para banco novo, `existingDatabase` para banco já existente).
Runbook: `docs/MIGRATION_RELEASE_RUNBOOK.md`.

Para a beta, o mínimo é o que cria `artist_submissions`, `leads`,
`company_briefs`, `conversion_events` e a view `v_catalog_readiness`. Sem
`docs/supabase-beta-conversion-events.sql`, o envio de portfólio **funciona**
mas o evento `submit_artist_application` é recusado — ou seja, você recebe a
candidatura e não consegue medi-la.

### B3. Contato público (bloqueia a beta)

| Variável | Efeito se ausente |
|---|---|
| `ARANDU_CONTACT_EMAIL` | CTAs de contato caem para `contato.html` |
| `ARANDU_WHATSAPP_NUMBER` | Sem link de WhatsApp em nenhuma página |

### B4. Consentimento e métricas (bloqueia a medição, não a beta)

`ARANDU_CONSENT_VERSION` — sem ela, **analytics fica permanentemente
desligado** e o banner diz isso ao visitante. Nenhum UTM é registrado. Se você
vai divulgar no TikTok e quer saber o que o tráfego virou, esta variável é
obrigatória.

### B5. Domínio e indexação

`ARANDU_SITE_URL` com HTTPS em domínio próprio. Sem ele o build marca o site
como `noindex` (comportamento correto para preview, errado para uma beta que
você quer divulgar).

### B6. Vercel

Projeto conectado, variáveis acima no ambiente de produção, `vercel-build`
como comando de build. `VERCEL_ENV=preview` e `VERCEL_ENV=production`
validados nesta rodada.

### B7. Depois da beta

E-mail transacional (`ARANDU_EMAIL_*`, `RESEND_API_KEY`), monitoramento de
erros (`ARANDU_ERROR_MONITORING_*`), rate limit distribuído
(`ARANDU_DISTRIBUTED_RATE_LIMIT`), backup verificado
(`ARANDU_BACKUP_VERIFIED_AT`). Todos ficam desligados e fail-closed até serem
provados.

---

## C. Exige Lucas

Decisões e execuções que só o proprietário pode fazer.

- Escolher e apontar o domínio; confirmar HTTPS.
- Criar o projeto Supabase e rodar as migrations.
- Definir o número de WhatsApp e o e-mail da curadoria que vão aparecer no site.
- Definir a versão do texto de consentimento (`ARANDU_CONSENT_VERSION`) e
  publicar a política correspondente.
- Aprovar a identidade visual final (`ARANDU_BRAND_READY`).
- Decidir **quando** a beta vai ao ar e com que promessa pública.
- Fazer o primeiro contato com artistas (nenhum código substitui isso).
- Testar o site em um celular real antes de divulgar.
- Definir o e-mail de contato de privacidade (`ARANDU_PRIVACY_CONTACT_EMAIL`)
  e o contato de segurança (`ARANDU_SECURITY_CONTACT`).

---

## D. Exige artista / dado real

O catálogo continua fechado por decisão, não por defeito. Para abri-lo:

- 5 artistas verificados e 20 obras verificadas (mínimos em
  `data/catalog-release.json`).
- Por obra: autoria confirmada, ficha técnica, dimensões, técnica, ano,
  edição, imagem em qualidade adequada, faixa de preço, disponibilidade real.
- Autorização escrita do artista para publicar obra, imagem e preço.
- Certificado, quando aplicável.

Só depois disso: `datasetKind` vira `real` e `verifiedReady` vira `true`.
**Não altere esses campos antes** — eles são o que impede publicar demonstração
como acervo.

Guia: `docs/GUIA_CADASTRO_OBRAS_REAIS.md` e `docs/ARTIST_ONBOARDING.md`.

---

## E. Exige jurídico / comercial

Nada disto é código. Enquanto não existir, `ARANDU_COMMERCIAL_READY` fica
`false` e o site diz que compra e reserva não estão abertas.

- Comissão (fração aprovada) e moeda.
- Prazo de reserva.
- Modelo de pagamento e política de pagamento.
- Frete: responsabilidade, modelo e política.
- Seguro e embalagem.
- Cancelamento, devolução e avaria.
- Modelo fiscal e emissão.
- Termos do artista e contrato de consignação/intermediação.
- Política de privacidade revisada e política comercial aprovada, com
  responsável operacional, aprovador e data.

Destino: `data/commercial-policy.json` e as variáveis `ARANDU_COMMERCIAL_*`.

---

## F. Pode ficar para depois da beta

Nada aqui deve atrasar o lançamento inicial.

- Pagamento online e checkout completo.
- E-mail transacional automatizado.
- Piloto fechado (`ARANDU_PILOT_*`) — a beta aberta não precisa dele.
- Rate limit distribuído.
- Monitoramento de erros com canário.
- Eventos de conversão para criação de conta, login e comparação de obras
  (exigem ampliar o `CHECK` de `conversion_events`, ou seja, uma migration
  nova).
- Breadcrumbs nas demais páginas públicas (hoje em `comprar-arte`,
  `como-funciona` e `faq`).
- Deduplicar a consulta de `/api/auth/session`, feita duas vezes em
  `login.html`.
- Recomendação, feed, avaliações, seguidores, app.

---

## Checklist de beta

Curta e na ordem de execução. Cada item é seu, não do código.

### Antes de publicar

- [ ] Projeto Supabase criado
- [ ] Migrations aplicadas na ordem de `docs/supabase-migrations.json`
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` na Vercel
- [ ] `ARANDU_CONTACT_EMAIL` e `ARANDU_WHATSAPP_NUMBER` configurados
- [ ] `ARANDU_CONSENT_VERSION` configurada e política publicada
- [ ] `ARANDU_SITE_URL` no domínio próprio, com HTTPS
- [ ] Deploy de produção concluído sem erro

### Validar no ar (não no código)

- [ ] Formulário de artista enviado de verdade, pelo site publicado
- [ ] Linha correspondente confirmada em `artist_submissions` no Supabase
- [ ] Briefing de empresa enviado e confirmado em `company_briefs`
- [ ] Link com UTM aberto e evento visto em `conversion_events`
- [ ] Clique no WhatsApp abre a conversa certa
- [ ] Site percorrido em um celular real: home → acervo → artista → contato
- [ ] `/painel.html` e `/docs/README.md` redirecionam para o login administrativo

### Divulgação

- [ ] Link com UTM preparado (TikTok, Instagram, bio)
- [ ] Texto público não promete compra aberta
- [ ] Primeiro artista convidado
- [ ] Primeira obra real autorizada por escrito

### Não fazer

- [ ] Não mudar `verifiedReady` para `true` sem catálogo real conferido
- [ ] Não mudar `commercial-policy.json` para `approved` sem aprovação real
- [ ] Não ligar `ARANDU_COMMERCIAL_READY` sem política comercial aprovada
- [ ] Não ligar `ARANDU_PRESENTATION_MODE` em produção (o build recusa)

---

## O que a beta consegue medir

Com `ARANDU_CONSENT_VERSION` configurada e o visitante aceitando métricas:

| Pergunta | Evento | Estado |
|---|---|---|
| De onde veio o tráfego | UTM + página de entrada em todo evento | ✅ |
| Chegou ao acervo | `catalog_view` | ✅ |
| Viu uma obra | `artwork_view` | ✅ (quando o acervo abrir) |
| Salvou uma obra | `selection_add` | ✅ (quando o acervo abrir) |
| Falou com a curadoria | `contact_start` | ✅ |
| Clicou no WhatsApp | `contact_start` (`target: whatsapp`) | ✅ |
| Clicou no e-mail | `contact_start` (`target: email`) | ✅ |
| Enviou portfólio | `submit_artist_application` | ✅ (exige a migration B2) |
| Enviou briefing de empresa | `contact_start` (`form_type`) | ✅ |
| Criou conta / entrou | — | ❌ exige migration nova |
| Iniciou comparação | — | ❌ exige migration nova |

Limites conhecidos, por desenho: a primeira página da visita não gera evento,
porque o consentimento ainda não foi dado quando ela carrega; `Do Not Track` e
a recusa de métricas desligam tudo.

---

## Como o software distingue os quatro estados

Não force nenhum destes. Cada um tem a sua evidência.

| Estado | Onde vive | Como abre |
|---|---|---|
| Beta pública | ambiente (Supabase, contato, domínio) | configurando B1–B5 |
| Catálogo real | `data/catalog-release.json` | 5 artistas e 20 obras conferidos |
| Comércio aberto | `data/commercial-policy.json` + `ARANDU_COMMERCIAL_READY` | política aprovada |
| Go-live completo | `ops/release-evidence.json` | evidência externa por item |

`npm run release:status` mostra, a qualquer momento, o que falta em cada um.
