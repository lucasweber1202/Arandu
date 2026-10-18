# Contratos para o frontend — 17/10/2026

Base `e459f901f89a92ab61cc35877e863a0abf8ab932` (#215/#216 integradas).
Nenhum frontend, Demo, E2E, workflow ou dependência alterado.

## Rate limit

O limitador do roteador mantém exatamente os escopos, limites e fingerprints.
Ao recusar, retorna HTTP 429 com `code: "rate_limited"`, mensagem neutra,
`requestId` sanitizado igual a `X-Request-ID` e `Retry-After` em segundos inteiros.
Em memória, o prazo é o restante da janela. Na RPC distribuída, que retorna só
boolean, é uma janela completa: limite superior conservador, não contagem
exata do servidor. Não expõe contadores ou fingerprints. O header é uma
orientação de espera, não autorização nem instrução de repetir uma escrita.

Falha de transporte, HTTP não OK ou resposta não booleana do contador retorna
503 `rate_limit_unavailable`, sem `Retry-After` inventado. Continua falhando
fechado. Erros próprios do GoTrue (`auth_rate_limited`) e limites de negócio
(upload/e-mail) preservam seus códigos; sem prazo conhecido, não recebem esse
header. A Public API v1 já possui envelope e Retry-After próprios, preservados.

Não foi criado perfil de exceção local. Production e Preview preservam os
limites mesmo com header/query alegando execução local. Para ensaios, separar
as fases e respeitar as janelas existentes; não fazer retry automático de POST
com resultado incerto. A #216 pode consumir o código/header sem mudar sua regra
de confirmação e reconciliação. Nenhuma edição do roteiro do Claude.

## Schema antigo e assignments

RPC ausente informada por PostgREST como HTTP 404 + `PGRST202` agora é
503 `schema_incompatible`, com mensagem neutra de atualização necessária.
Assinatura, SQL, tenant e detalhes internos não chegam ao cliente. Não é
"nenhuma solicitação" nem sucesso com nome fabricado. Não há fallback para
service role, consulta ampliada ou tentativa automática de nova RPC.

`rows[].buyer_name` da #215 permanece `string|null`, com convite aceito,
proposta própria e JWT do chamador. A nova aplicação exige o schema adequado;
continua obrigatório aplicar schema antes do app. A classificação de ausência
de RPC não prova que o restante do schema está correto: doctor e probes são
necessários. Outras recusas, inclusive 403, não são convertidas em schema antigo.

## Decisão e compatibilidade

`POST /api/finance/decisions` continua exigindo `expected_version` e usando v2.
Nova guarda BEFORE INSERT revalida decisor, papel e entidade no instante da
gravação, após eventuais esperas. Remoção/rebaixamento/perda de escopo já
commitados recusam com o `forbidden` existente, sem decisão/evento parcial.
Na ordem inversa, a mudança de membresia aguarda o commit da decisão.
Nenhuma aprovação, escolha, atualização de versão ou retry é automático.

Migration aditiva `supabase-financial-decision-authorization.sql`, após
enterprise-integrity; marker `financial-decision-authorization-1`. Aplicação
anterior usa v2 e é compatível. Reverter aplicação não remove o controle.
Rollback SQL retém a guarda e restaura o marker anterior; preferir forward-fix.
Doctor espera o marker novo. Nenhuma migration hospedada executada.
