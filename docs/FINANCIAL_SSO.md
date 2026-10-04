# Enterprise SSO foundation (P0.9)

| | |
|---|---|
| Migration | [`supabase-financial-sso.sql`](supabase-financial-sso.sql) (`schema_version = financial-sso-1`) |
| Rollback | [`rollback/supabase-financial-sso.rollback.sql`](rollback/supabase-financial-sso.rollback.sql) (aborta se houver conexão, domínio ou trilha) |
| Banco | [`tests/database/financial-sso.sql`](../tests/database/financial-sso.sql), [`financial-sso-rollback.sql`](../tests/database/financial-sso-rollback.sql) |
| Código | `lib/finance/sso.mjs` (validação), `lib/finance/sso-adapters.mjs` (adapters), `lib/api/domains/sso.mjs` (login), `lib/api/domains/finance-sso.mjs` (administração), `lib/api/domains/auth.mjs` (exigência e sessão) |
| Testes | `scripts/test-finance-sso.mjs` (IdP de teste com chaves RS256/ES256 reais), `tests/e2e/finance-sso.spec.js` |
| Interface | Configurações → Segurança: SSO corporativo (só admin, fora da demo); login → "Entrar com SSO" |

## Estado honesto

Esta entrega é **fundação**: modelo de configuração, verificação de domínio,
adapter para broker, validação estrita de identidade, autorização no banco que
falha fechada, exigência de SSO, limite e revogação de sessão, prontidão e
trilha. **Nenhum login SSO real foi executado** contra um IdP de cliente: isso
depende dos blockers abaixo. A interface nunca mostra "operacional" sem broker
real, domínio verificado e um login bem-sucedido registrado; e não há claim de
"SSO funcionando", certificação ou conformidade.

## Modelo

* `fin_sso_connections`: uma conexão por IdP da organização. Protocolo `saml`
  ou `oidc`; broker `supabase` (produção) ou `mock` (testes, **nunca** passa de
  `testing`, por constraint). Estados `draft → testing → active → disabled`.
  `enforce_sso` só com `active`. `max_session_hours` (1–168, padrão 12) limita
  a sessão nascida de SSO. `sessions_valid_after` implementa a revogação.
* `fin_sso_domains`: domínio de e-mail **globalmente único** (um domínio
  pertence a uma organização). Reivindicado com o hash de um token; vira
  `verified` só quando o servidor encontra o token num TXT do DNS. Domínios de
  e-mail pessoal são recusados. O hash não tem privilégio de coluna para
  `authenticated`.
* `fin_sso_events`: trilha de tentativas (sucesso/recusa com motivo estável),
  sem e-mail em claro: só domínio e `sha256(issuer|subject)`.

## Fluxo de login

1. **Descoberta**: `POST /api/auth/sso/discover {email}` → `{sso, required}`.
   Não revela organização nem provedor. Rate limit por IP.
2. **Início**: `GET /api/auth/sso/start?email=&next=` resolve a conexão pelo
   domínio, gera `state` + `nonce` + PKCE (S256), grava tudo num cookie
   `HttpOnly; Secure; SameSite=Lax` assinado com HMAC
   (`ARANDU_SSO_STATE_SECRET`), válido por 10 min e restrito a
   `/api/auth/sso`, e redireciona ao broker. O `next` só aceita páginas fixas
   de `/finance/*.html` ou `/provider/*.html`.
3. **Callback**: `GET /api/auth/sso/callback?state=&code=`:
   * valida o cookie (assinatura, validade, `state` em tempo constante);
   * troca o código no broker com o `code_verifier` e reconfirma o usuário em
     `/auth/v1/user`;
   * revalida a identidade: e-mail verificado, domínio da conexão, provedor da
     conexão, emissão recente;
   * exige que a conexão do domínio seja a mesma do `state` (organização não
     muda no meio do fluxo);
   * chama `fin_sso_authorize` (service role), que **falha fechada** em
     conexão inativa, provedor/domínio/organização divergentes, sessão
     revogada, sessão além do limite, pessoa sem vínculo com a organização
     (`member_not_found`) ou conta bloqueada no Supabase Auth
     (`banned_until`, `member_disabled`);
   * grava a trilha e emite a sessão com o marcador SSO (conexão, usuário,
     emissão, limite).
   Qualquer recusa termina em `/login.html?sso_error=<motivo>` **sem
   sessão**, e a sessão já criada no broker é encerrada (`/auth/v1/logout`).

SSO **autentica**; não cria acesso. A pessoa precisa ser membro ativo da
organização (convite). Papel e escopo de entidades continuam definidos no
Arandu. JIT/SCIM ficam para P1.5.

### Motivos estáveis

`sso_unconfigured`, `sso_required`, `state_invalid`, `broker_failed`,
`malformed_token`, `alg_not_allowed`, `signature_invalid`, `issuer_mismatch`,
`audience_mismatch`, `nonce_mismatch`, `token_expired`, `token_not_yet_valid`,
`email_unverified`, `domain_mismatch`, `provider_mismatch`, `org_mismatch`,
`connection_inactive`, `member_not_found`, `member_disabled`,
`session_expired`, `session_revoked`, `mock_disabled`. Lista canônica:
`SSO_REASONS` em `lib/finance/sso.mjs`. A página de login traduz a mesma
lista, e um teste garante a paridade.

## Adapters

Interface: `beginLogin({connection, redirectTo, pkce}) → {url}` e
`completeLogin({code, verifier, idToken, nonce, connection}) → {identity, session, userId}`.

* **supabase**: Supabase Auth como broker SAML (`POST /auth/v1/sso` com
  `provider_id` e PKCE; `token?grant_type=pkce`; `/auth/v1/user`). A sessão
  emitida é do próprio Supabase, então RLS e `auth.uid()` continuam valendo
  sem segundo sistema de auth. `provider_ref` = `sso:<id do provedor>`.
* **mock**: IdP OIDC de teste com JWKS em memória. Só existe com
  `ARANDU_SSO_MOCK_IDP=true` fora de produção e nunca emite sessão (o callback
  só aceita o broker real). Serve para provar `verifyIdToken`.
* `verifyIdToken` (OIDC direto, usado pelo mock e pronto para um adapter OIDC
  futuro) aceita só RS256/ES256 por JWK (`alg: none` e HS* recusados) e confere
  `iss`, `aud` (`azp` quando há várias audiências), `nonce`, `exp`/`nbf`/`iat`
  com folga de 60 s e `email_verified`.

## Exigência de SSO e sessão

* Com conexão `active` e `enforce_sso`, `POST /api/auth/login` responde
  **403 `sso_required`** para e-mails dos domínios ligados, antes de a senha
  chegar ao provedor. Se a consulta de política falhar, o login responde
  **503** (falha fechada); não cai para senha.
* A sessão SSO dura no máximo `max_session_hours` desde a emissão (cookie com
  `Max-Age` limitado). A cada refresh, `fin_sso_session_valid` reconfere
  conexão ativa, membro ativo e revogação; se falhar, a sessão é encerrada.
* **Revogar sessões** (`fin_sso_revoke_sessions`) grava
  `sessions_valid_after = now()`: sessões emitidas antes caem no próximo
  refresh (no máximo o TTL do access token do Supabase, padrão 1 h) e novos
  callbacks com emissão anterior são recusados.
* **MFA**: para quem entra por SSO, o segundo fator é responsabilidade do IdP
  da empresa (`mfa_policy = 'arandu_totp'` está reservado; MFA próprio para
  usuários de cliente não é exigido hoje, ver P0.9-01 na matriz). Não há claim
  de MFA garantido em login SSO.

## Ativação (prontidão)

`fin_sso_set_status` impõe no banco:

* `testing` exige `provider_ref`, `metadata_url` e um domínio verificado
  ligado à conexão;
* `active` exige broker real (não `mock`) e ao menos um login bem-sucedido
  registrado para a conexão.

A tela mostra a lista de prontidão (`readiness()` em `lib/finance/sso.mjs`):
segredo de state, broker, `provider_ref`, metadados, issuer/audience (OIDC),
domínio, login de teste e estado. "Operacional" só com tudo `ok` **e** broker
`supabase`.

## Runbook

### Configurar uma organização (com os blockers resolvidos)

1. Responsável pelo ambiente: habilitar SSO no Supabase Auth do ambiente,
   cadastrar o provedor SAML com os metadados do IdP do cliente
   (`supabase sso add --type saml --metadata-url … --domains …`) e anotar o id
   (`sso:<id>`). Configurar `ARANDU_SSO_STATE_SECRET` (≥ 32 caracteres
   aleatórios) e `ARANDU_SSO_BROKER=supabase` no ambiente.
2. Admin do cliente: Configurações → Segurança → reivindicar o domínio,
   publicar o TXT `_arandu-challenge.<domínio>` e clicar em Verificar.
3. Admin: criar a conexão (SAML, `provider_ref`, URL de metadados, sessão
   máxima), ligar o domínio à conexão, colocar em teste.
4. Uma pessoa convidada entra com "Entrar com SSO". O evento de sucesso aparece
   em "Tentativas recentes".
5. Admin: ativar. Só depois de confirmar que ao menos um administrador entra
   pelo provedor: "Exigir SSO".

### Incidentes

* **IdP fora do ar ou certificado expirado**: "Liberar senha" (desliga
  `enforce_sso`) ou desativar a conexão. O login volta a ser por senha. Não
  apague a conexão.
* **Conta comprometida no IdP**: desativar a conta no IdP, remover o membro
  da organização no Arandu ou bloquear a conta no Supabase Auth (`banned_until`),
  com efeito no próximo refresh, e revogar sessões da conexão.
* **Admin trancado fora** (SSO exigido e IdP quebrado): owner com acesso ao
  banco do ambiente executa, com registro em incidente,
  `update public.fin_sso_connections set enforce_sso = false where id = '<id>';`
  e registra o evento na trilha.
* **Diagnóstico**: `fin_sso_events` por `reason_code` (sem PII) e
  `correlation_id`; `npm run finance:pilot:doctor` confere schema e RPCs.

### Rollback

Preferir forward-fix: desativar a conexão (reabre a senha, preserva a trilha).
O rollback de banco só roda sem conexão, domínio ou trilha. O código anterior
ignora as tabelas. Reverter o código sem a migration é seguro: login por senha
volta a ser a única via.

## Segurança

* Nenhum segredo no banco: o banco guarda só o hash do token de domínio. O
  segredo de state fica no ambiente, e as asserções SAML são validadas pelo
  broker.
* Funções de serviço (`fin_sso_discover`, `fin_sso_password_allowed`,
  `fin_sso_authorize`, `fin_sso_session_valid`, `fin_record_sso_event`,
  `fin_sso_mark_domain_verified`) não são executáveis por `anon` nem por
  `authenticated`. As de administração exigem papel `admin` na organização.
* Threat model: replay de callback (state de uso único por cookie + PKCE),
  login CSRF (state ligado ao cookie), troca de organização (conexão do state
  = conexão do domínio), open redirect (`next` com lista fixa), tomada de
  domínio (TXT + domínio global único + bloqueio de domínios pessoais),
  enumeração (descoberta mínima + rate limit), downgrade para senha (403 com
  enforcement; 503 se a política não puder ser lida).

## Blockers externos

| BLOCKER | WHY | WHO MUST ACT | EXACT ACTION | WHAT IS READY | HOW TO VERIFY |
|---|---|---|---|---|---|
| SSO no Supabase Auth do ambiente | SAML SSO depende de plano/feature do projeto Supabase | owner da conta Supabase do piloto/produção | habilitar SSO e cadastrar o provedor do cliente (`supabase sso add …`) | adapter, callback, autorização e prontidão | prontidão "broker" ok; login de teste grava evento `success` |
| IdP do cliente | sem tenant e app do cliente não há asserção real | admin de TI do cliente | criar app SAML com ACS/Entity ID do Supabase e enviar metadados | conexão em `draft` com metadados | evento `success` em "Tentativas recentes" |
| DNS do domínio | prova de posse do domínio | admin de DNS do cliente | publicar `_arandu-challenge.<domínio>` TXT | reivindicação e verificação | domínio `verificado` na tela |
| `ARANDU_SSO_STATE_SECRET` / `ARANDU_SSO_BROKER` | segredos e flags por ambiente não vão para o repositório | responsável pelo ambiente (Vercel) | gerar segredo ≥ 32 caracteres; `ARANDU_SSO_BROKER=supabase` | leitura e prontidão | aviso de ambiente some da tela |
| Rollout hospedado da migration | banco do piloto atrasado em relação ao código | owner com acesso ao Supabase do piloto | backup, restore drill em destino descartável, aplicar a migration, doctor e canário | migration, rollback e testes | doctor espera `financial-sso-1` e as RPCs `fin_sso_*` |

## Histórico

* 2026-10-04 — fundação P0.9 (`financial-sso-1`).
