# Ação obrigatória do fundador — Arandu

Este documento separa o que já pode ser resolvido por código do que depende de acesso operacional, decisão comercial ou validação externa.

## 1. O que já ficou implementado no repositório

- `/api/health` informa somente liveness, sem expor configuração.
- `/api/readiness`, protegido por identidade, papel e MFA, testa a conexão real com Supabase e valida recursos centrais:
  - `artists`
  - `artworks`
  - `v_public_catalog`
  - `v_sales_pipeline`
- `status.html` usa `/api/readiness` e mostra se o Supabase responde de verdade somente a administradores.
- `scripts/check-live-production.mjs` permite validar a URL publicada sem abrir o painel da Vercel.
- `npm run check:live:prod` roda a validação live contra `https://arandu-bice.vercel.app`.

## 2. O que Lucas precisa fazer obrigatoriamente

### Vercel

Entrar no projeto da Vercel e conferir se estas variáveis existem em Production:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_SITE_URL=
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=
```

Depois disso, rodar um novo deploy. Não recrie `sessão administrativa protegida`: a administração agora usa Supabase Auth com papel em `app_metadata` e MFA TOTP. Siga `ADMIN_AUTH_MFA.md`.

### Supabase

Entrar no projeto Supabase e confirmar:

1. `docs/supabase-schema.sql` foi rodado.
2. `docs/supabase-production.sql` foi rodado.
3. Email/senha está habilitado em Authentication.
4. As tabelas existem.
5. As views existem.
6. As policies não bloqueiam leitura pública de catálogo/artistas nem gravação de formulários.
7. O seed real foi executado ou os dados foram inseridos manualmente.

### Operação comercial

Definir e aprovar:

1. Comissão da Arandu.
2. Prazo de reserva.
3. Se haverá sinal ou pagamento integral.
4. Quem paga frete, embalagem e seguro.
5. Política de cancelamento/devolução.
6. Responsabilidade por dano/transporte.
7. Modelo de recibo, nota ou intermediação.
8. Política de certificado/autenticidade.

### Marca e catálogo

Providenciar:

1. Logo final em `assets/logo-arandu.png`.
2. WhatsApp real.
3. E-mail real.
4. Domínio oficial.
5. 5 artistas reais iniciais.
6. 20 obras reais iniciais.
7. Fotos autorizadas.
8. Biografias e dados mínimos de cada artista.
9. Preços e disponibilidade das obras.

## 3. Como validar depois de configurar Vercel e Supabase

No Codespace ou ambiente local:

```bash
npm run check:live:prod
```

Ou, para uma URL específica:

```bash
npm run check:live -- https://sua-url.vercel.app
```

No navegador:

```text
/status.html
/api/health?probe=1
/api/catalog
/api/artists
/api/auth/session
```

## 4. Interpretação rápida

### Pode divulgar para teste fechado se:

- `/api/health?probe=1` retorna `verifiedReady: true`.
- `/status.html` mostra Técnico, Banco, Contato, Domínio e API como OK.
- `/api/catalog` retorna itens reais.
- `/api/artists` retorna artistas reais.
- Formulário de contato grava no Supabase.
- Reserva ou seleção grava no Supabase.

### Não divulgar publicamente se:

- o site ainda usa obras/artistas demonstrativos;
- WhatsApp/e-mail real não está configurado;
- política comercial ainda não foi revisada;
- certificado ainda não tem critério real;
- Supabase está em modo demo ou com falha de view/tabela;
- domínio final ainda não está definido.

## 5. Próxima rodada recomendada de implementação

Depois que Lucas confirmar Vercel e Supabase, a próxima rodada técnica deve focar em:

1. Transformar o painel admin em operação diária de leads, obras, artistas e certificados.
   — entregue nos painéis operacionais e no drawer de detalhes.
2. Criar fluxo real de aprovação de artista.
   — **entregue**: `prospected → in_review → approved → published`, com identidade
   verificada e consentimento de publicação obrigatórios. Ver
   `docs/OPERATIONAL_STATUS_FLOW.md`.
3. Criar status de obra com histórico operacional.
   — **entregue**: máquina de estados sob lock e trilha imutável em
   `operational_status_history`, exibida em `historico-obra.html`.
4. Criar proposta comercial exportável.
   — entregue em `proposta-pdf.html` e `js/proposal-print.js`.
5. Criar certificado imprimível mais completo.
   — entregue em `certificado-imprimivel.html` e `js/certificate-print.js`.
6. Melhorar permissões por perfil: comprador, artista, empresa e admin.
   — parcial: RBAC administrativo (`admin`, `operator`, `curator`) cobre painéis e
   transições sensíveis. Portais dedicados de artista e empresa continuam pendentes.
7. Trocar dados demo por seed real.
   — **bloqueado por dados reais**: depende dos 5 artistas e 20 obras autorizados.
8. Ajustar SEO e sitemap com domínio oficial.
   — **bloqueado por domínio**: depende de `ARANDU_SITE_URL` definitivo.
