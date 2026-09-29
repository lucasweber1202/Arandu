# Perfis, capacidades e portais — Arandu

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

A Arandu tem **dois sistemas de identidade separados**, que nunca se cruzam.

| Sistema | Onde vive o papel | Como é concedido | Documento |
| --- | --- | --- | --- |
| Administração | `app_metadata` + MFA TOTP `aal2` | Provisionamento interno | `docs/ADMIN_AUTH_MFA.md` |
| Contas do público | capacidades derivadas do banco | Fato verificado no servidor | este documento |

Nada neste documento concede acesso administrativo.

## A regra que sustenta tudo

`profile_type` fica em `user_metadata`. A própria pessoa consegue alterar esse
campo pela API do Supabase Auth com o próprio token. Portanto:

> `profile_type` é uma **declaração**, nunca uma permissão.

Ele orienta navegação e comunicação. Não abre porta. Toda capacidade deriva de
um fato que só o servidor controla.

No cadastro, `/api/auth/signup` grava `comprador` de forma fixa — a pessoa não
escolhe o próprio tipo no momento da criação da conta. Ainda assim o código
trata o valor como não confiável em qualquer leitura posterior, porque o
metadado continua editável depois.

## Capacidades

| Capacidade | Concedida quando | Fonte da verdade |
| --- | --- | --- |
| `account:read` | conta autenticada | sessão Supabase |
| `company-portal:read` | a conta possui briefing empresarial | `company_briefs.user_id` (RLS) |
| `artist-portal:read` | a conta tem vínculo ativo com artista aprovado | `artist_accounts` |

`GET /api/account` devolve `capabilities` e `declaredProfileType`. O primeiro
autoriza; o segundo apenas descreve.

## Portal do artista

Acesso exige vínculo ativo em `public.artist_accounts`, criado por curadoria.
O vínculo só é aceito se o artista já estiver `approved` ou `published` na
máquina de estados operacional — o portal não antecipa curadoria.

Invariantes garantidos por índice único parcial:

- uma conta ativa por artista;
- um artista ativo por conta.

Gestão pelo painel:

```text
GET    /api/artist-accounts   lista vínculos          (artists:read)
POST   /api/artist-accounts   cria vínculo            (artists:review)
DELETE /api/artist-accounts   revoga vínculo ativo    (artists:review)
```

`GET /api/portal/artist` devolve, apenas para a conta vinculada:

- o próprio perfil de artista;
- as próprias obras, com situação operacional;
- a trilha de transições do próprio perfil.

### Minimização

O portal devolve um conjunto explícito de campos. Ficam de fora nome legal,
referências de origem, leitura curatorial, notas internas e o `payload` bruto do
cadastro. As listas estão em `lib/profile-access.mjs` e são verificadas por
teste — acrescentar um campo interno à lista quebra a suíte.

A leitura das obras usa service role porque obras não são legíveis por RLS de
comprador. A propriedade é verificada **antes**, no vínculo, e a consulta é
filtrada por `artist_id`.

## Portal da empresa

`GET /api/portal/company` devolve os briefings da própria conta, via RLS de
`company_briefs`, com status e prazo. Não devolve orçamento negociado, mensagem
original, contato nem qualquer campo comercial interno.

Não existe entidade `companies` no banco: a capacidade nasce da posse de
briefings, não de um cadastro de empresa. Um portal empresarial mais completo
(vários usuários por empresa, papéis internos) exige criar essa entidade antes.

## Revogação

`DELETE /api/artist-accounts` marca o vínculo como `revoked`, com responsável e
data. O acesso fecha na requisição seguinte, porque a capacidade é resolvida a
cada chamada — não há cache de permissão na sessão.

Depois da revogação o artista pode ser vinculado a outra conta.

## Erros

| Código | HTTP | Significado |
| --- | --- | --- |
| `profile_capability_denied` | 403 | Conta autenticada sem a capacidade exigida |
| — | 401 | Sem sessão de comprador |

## O que ainda não existe

- Portal empresarial com múltiplos usuários por empresa.
- Autoatendimento de vínculo: hoje o vínculo é sempre criado por curadoria, de
  propósito.
- Escrita pelo artista (editar obra, propor preço) — o portal é somente leitura;
  a revisão de preço continua por formulário.
