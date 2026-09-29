# Máquina de estados operacional — Arandu

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

A Arandu tem **dois eixos de status** que não se misturam.

| Eixo | Onde vive | Trilha | Quem decide |
| --- | --- | --- | --- |
| Editorial | `editorial_status` em artistas e obras | `catalog_review_history` | Curadoria, via `/api/catalog-review` |
| Operacional/comercial | `status` (ou `verification_status`) das tabelas operacionais | `operational_status_history` | Operação, via `/api/admin` e `/api/admin-update` |

Este documento trata do eixo **operacional**. O editorial continua em
`docs/PRODUCTION_READINESS_FINAL.md` e no fluxo de revisão de catálogo.

## Regra central

São duas garantias distintas, e vale não confundi-las.

**Validação — quem entra pelo painel.** Nenhuma rota administrativa grava status
por `PATCH` direto: toda mudança passa por
`public.apply_operational_status_atomic`, que

1. trava o registro (`select ... for update`);
2. rejeita transições fora da máquina de estados;
3. rejeita transições que violem pré-condições de negócio.

**Registro — qualquer caminho.** A trilha não depende de quem escreve. O gatilho
`trg_arandu_operational_status` grava em `public.operational_status_history`
sempre que o status muda, venha do painel, de rotina interna do banco ou de uma
correção manual.

Isso importa porque o banco muda status sozinho em quatro pontos: reserva criada
(`available → reserved`), reserva expirada (`reserved → available`), pedido
concluído (`reserved → sold`) e pedido cancelado (`reserved → available`). Todos
passam a aparecer no histórico. Quando o caminho já identifica o responsável em
`request.headers` — como a máquina de estados de pedidos — a transição fica
atribuída a ele; sem cabeçalho, entra como `system`.

Essas rotinas internas **não** são validadas contra a máquina de estados: elas
são parte do modelo transacional e já produzem transições válidas por
construção. A máquina descreve o que a operação humana pode fazer; o gatilho
descreve o que de fato aconteceu.

As rotas são declaradas duas vezes de propósito — em
`lib/operational-status.mjs` (falha rápida, com mensagem em português) e em
`docs/supabase-operational-status.sql` (defesa em profundidade, sob lock).
`scripts/test-operational-status.mjs` compara os dois lados e falha se
divergirem.

## Fluxos

### Obra (`obras` → `artworks`)

```text
available        → in_conversation, reserved, not_published, archived
in_conversation  → available, reserved, not_published
reserved         → available, in_conversation, sold, archived
sold             → archived
not_published    → available, archived
archived         → not_published
```

Pré-condições:

- `available` exige `image_authorized_at` — sem autorização de imagem a obra
  não é oferecida;
- `sold` exige `price` maior que zero.

Obra vendida não volta a ficar disponível. O único caminho é `archived`.

### Artista (`artistas` → `artists`)

```text
prospected → in_review, archived
in_review  → approved, paused, archived
approved   → published, in_review, paused, archived
published  → paused, archived
paused     → approved, published, archived
archived   → in_review
```

Pré-condições:

- `approved` exige `identity_verified`;
- `published` exige `identity_verified` **e** `publishing_consent_at`.

É o fluxo real de aprovação de artista: prospecção, análise, aprovação
documentada e publicação consentida. Não há atalho de `prospected` para
`published`.

### Submissão de artista (`submissions` → `artist_submissions`)

```text
received          → screening, declined, archived
screening         → curatorial_review, declined, archived
curatorial_review → approved, declined, archived
approved          → archived
declined          → archived
```

`approved` exige e-mail ou WhatsApp registrado, para que a curadoria consiga
responder à pessoa que se inscreveu.

### Certificado (`certificados` → `certificates`)

```text
draft        → under_review, valid
under_review → valid, draft, revoked
valid        → under_review, revoked
revoked      → (terminal)
```

`valid` exige obra vinculada. Certificado revogado é terminal.

### Registros comerciais

```text
lead:        new → contacted → qualified → proposal → won | lost → archived
brief:       received → qualified → proposal → negotiation → won | lost → archived
proposal:    draft → sent → approved | declined | expired → archived
reservation: requested → confirmed → converted | expired | cancelled
task:        open → doing → done | cancelled
```

## Permissões

A máquina de estados está ligada ao RBAC administrativo: transições de
aprovação e publicação exigem permissão além de `update`.

| Transição | Permissão exigida | Papéis |
| --- | --- | --- |
| artista → `approved` | `artists:review` | admin, curator |
| artista → `published` | `artists:publish` | admin, curator |
| obra → `available` | `artworks:publish` | admin, curator |
| obra → `sold` | `artworks:review` | admin, curator |
| submissão → `approved` / `declined` | `submissions:review` | admin, curator |
| certificado → `valid` | `certificates:issue` | admin, curator |
| certificado → `revoked` | `certificates:revoke` | admin, curator |

O papel `operator` movimenta o funil comercial (leads, briefings, propostas,
reservas, tarefas), mas não aprova artista, não publica obra e não emite
certificado.

## Trilha

`GET /api/operational?resource=status-history&entity_type=<entidade>&entity_id=<id>`

Retorna a trilha em ordem decrescente. A trilha é **somente leitura**: `POST` e
`PATCH` nesse recurso respondem 405. Cada linha registra status de origem,
status de destino, nota, responsável, papel e `request_id`.

Entidades: `artwork`, `artist`, `submission`, `lead`, `brief`, `proposal`,
`reservation`, `certificate`, `task`.

As páginas `historico-obra.html` e `historico-artista.html` mostram essa trilha
real acima dos eventos inferidos do cadastro.

## Erros

| Código | HTTP | Significado |
| --- | --- | --- |
| `operational_status_invalid` | 400 | Status fora do vocabulário do fluxo |
| `operational_status_unchanged` | 409 | O registro já está no status pedido |
| `operational_status_unknown_origin` | 409 | Status atual não pertence à máquina (dado legado) |
| `operational_transition_invalid` | 409 | Rota inexistente entre os dois status |
| `operational_guard_failed` | 409 | Pré-condição de negócio não cumprida |
| `admin_permission_denied` | 403 | Papel sem permissão para a transição |

## Dados legados

Registros gravados antes desta migration podem ter status fora do vocabulário.
A máquina recusa a transição com `operational_status_unknown_origin` em vez de
adivinhar. Corrija o dado na origem antes de movimentar o registro.
