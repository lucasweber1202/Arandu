# Auditoria do pivot: o que foi reaproveitado, portado e removido

## Estado encontrado

| Item | SHA / referência |
| --- | --- |
| `main` no início da rodada | `76c50bf` (merge da PR #62) |
| PR B2B draft existente | [#63](https://github.com/lucasweber1202/Arandu/pull/63), branch `work/arandu-b2b-platform-pivot`, head `26a7b37`, 10 commits, 32 arquivos, +861/−6 |
| CI da PR #63 | verde (`validate`, `database`, `deploy-boundaries`) |
| Branch desta rodada | `claude/lucid-hopper-6zcuqj`, criada a partir de `main` |

A PR #63 introduzia um núcleo B2B genérico **e** uma vertical de Export
Compliance / CBAM, com um piloto de Financial Procurement propositalmente
genérico (`b2b_rfqs.details` e `b2b_quotes.terms` como `jsonb` livre, sete
categorias de produto, nenhuma normalização por produto).

## Decisão: nova branch a partir da `main`, com port seletivo

A PR #63 **não foi continuada nem mesclada**. Motivos objetivos:

1. A definição de produto mudou. A migration da #63 mistura, no mesmo arquivo e
   na mesma sequência canônica, tabelas de Export Compliance (`b2b_products`,
   `b2b_requirements`, `b2b_evidence`, `b2b_passports`, `b2b_cbam_cases`,
   `b2b_cbam_evidence`) com o núcleo de procurement. Limpar isso significaria
   reescrever a migration inteira — o mesmo esforço de escrever uma nova, com
   histórico mais confuso.
2. O `check-migrations` e o `check-product-readiness` da #63 fixam a migration
   B2B como último item da sequência. Duas migrations disputando essa posição
   dariam conflito garantido.
3. O modelo de proposta da #63 é `jsonb` livre. O produto desta rodada exige
   campos normalizados por produto financeiro, comparação factual por campo e
   versionamento — o que muda o schema, a API e o front.

O trabalho da #63 **permanece preservado** no histórico do Git, na branch
`work/arandu-b2b-platform-pivot` e na própria PR. Nada foi apagado.

## O que foi portado da PR #63 (e melhorado)

| Padrão portado | Onde está agora | O que mudou |
| --- | --- | --- |
| Bootstrap atômico de organização (cria org + admin numa transação) | `fin_create_organization` | `kind` reduzido a `BUYER`/`PROVIDER`; emite evento de trilha |
| Convite de membro com hash do token, expiração e conferência de e-mail | `fin_invite_member` / `fin_accept_member_invitation` | idêntico em espírito; papéis financeiros |
| `has_role(org, roles[])` como base de toda policy | `fin_has_role` | idem |
| Chaves compostas `(organization_id, id)` para impedir vínculo cruzado | todas as tabelas `fin_*` | ampliado: decisão amarrada a org **e** RFQ; proposta amarrada ao produto da RFQ |
| RLS com `revoke all from anon, authenticated` e grants explícitos | migration financeira | acrescentado `force row level security` |
| Escrita de estado apenas por `SECURITY DEFINER` | `fin_transition` e demais RPCs | máquina de estados completa, não só `draft→open` |
| Redação de erro upstream na borda da API | `api/[...path].js`, ramo `finance/` | mesma técnica, serviço próprio |
| Páginas B2B fora da casca pública, com SEO sem canônica | `vite.config.js`, `FINANCE_PAGE_PREFIXES` | acrescentada a injeção do modo de apresentação |
| Teste de fronteira de API com `fetch` substituído | `scripts/test-finance-api.mjs` | ampliado para allowlist, spoofing de produto e transições |

## O que foi deixado de fora (Export Compliance / CBAM)

Retirado desta branch: `b2b_products`, `b2b_requirements`,
`b2b_product_requirements`, `b2b_documents`, `b2b_evidence`, `b2b_passports`,
`b2b_cbam_cases`, `b2b_cbam_evidence`, a função pública de passaporte
`b2b_public_passport`, as páginas `b2b/export.html` e `b2b/passport.html`, os
dados `data/regulations/eu/*.json` e os documentos
`EXPORT_COMPLIANCE_VERTICAL.md`, `REGULATORY_SOURCES.md`.

Motivo: deixou de ser prioridade e **não é isolada o suficiente** para ficar
como módulo experimental desativado. Ela compartilha a migration, a tabela de
documentos, o roteador de API e o front com o núcleo B2B da #63 — mantê-la
aumentaria a superfície de build, de teste e de revisão de segurança sem
servir ao produto desta rodada.

**Preservação:** o código continua acessível em `work/arandu-b2b-platform-pivot`
e na PR #63. Nenhuma migration de Export Compliance foi aplicada ao fluxo
principal, e nenhum `DROP` foi executado sobre ela — ela simplesmente nunca
entrou nesta branch.

## O que foi reaproveitado da vertical de Arte

Reaproveitado sem alteração:

* `lib/api-core.mjs` — `HttpError`, `json`, `readBody` com limite de corpo,
  `clean`, `limited`, `safeObject`;
* `lib/supabase.mjs` — `userSupabaseRequest` com token do usuário (o RLS
  continua sendo a fronteira; a chave de serviço não é usada);
* `api/[...path].js` — `enforceSameOrigin`, `requireUser`, `enforceRateLimit`,
  `reportError`, `safeRequestId`;
* `lib/http-security.mjs` — cabeçalhos de segurança da API;
* `lib/presentation-mode.mjs` — o gate fail-closed do modo de demonstração;
* `scripts/seo-meta.mjs` — bloco de SEO das páginas;
* `scripts/test-database.sh` e `tests/database/bootstrap.sql` — harness de banco;
* CI, gates de release e o manifesto de migrations.

**Nada da vertical de Arte foi destruído.** Nenhuma tabela foi removida, nenhuma
página foi apagada, nenhuma rota foi desligada e nenhuma migration destrutiva
foi criada. As páginas de arte continuam publicadas e cobertas pelos mesmos
testes de antes. A estratégia de convivência daquela rodada (documento
`FINANCIAL_ART_COEXISTENCE.md`, hoje só no histórico do Git; a vertical foi
aposentada depois, ver `LEGACY_ART_RETIREMENT.md`) era simplesmente: **coexistência aditiva**, com prefixo `fin_` no banco e
diretórios `finance/` e `provider/` no front.

## O que ficou fora de escopo

Upload de documento, assinatura eletrônica, validação de CNPJ, notificações por
e-mail, exportação da comparação, admin operacional da vertical, benchmarking,
billing e todos os produtos financeiros além de crédito e adquirência. Registrado
em `FINANCIAL_ROADMAP.md` e nas limitações de `FINANCIAL_MVP_RUNBOOK.md`.

## O que exige ação humana

* Todos os doze itens de `FINANCIAL_LEGAL_REVIEW_REQUIRED.md`.
* Decidir o destino da PR #63: fechar, manter aberta como referência de Export
  Compliance, ou reabrir depois com a vertical isolada de verdade.
* Prover credenciais de Supabase para exercitar o fluxo real fora dos testes.
* Confirmar se o nome "Arandu" permanece compartilhado entre as duas verticais
  (nenhum rebranding irreversível foi feito nesta rodada).
