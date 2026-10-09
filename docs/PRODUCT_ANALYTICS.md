# Analytics de produto e operação no Linear

## Contrato e fronteiras

PostHog mede uso agregado; Supabase continua system of record financeiro e
`fin_events` continua trilha de auditoria. Linear guarda trabalho de engenharia,
nunca propostas, documentos, contatos de clientes ou justificativas financeiras.
Não há SDK PostHog no navegador, autocapture, replay, feature flags, experimento
ou webhook Linear neste lote. Não há decisão financeira automatizada.

O adaptador server-only `lib/product-analytics.mjs` aceita somente:

| Evento (prefixo `arandu.`, sufixo `.v1`) | Confirmação | Propriedade permitida |
| --- | --- | --- |
| `organization_created` | RPC de criação concluída | `organization_kind`: BUYER/PROVIDER |
| `rfq_created` | RPC concluída e organização autorizada | `product`: credit/acquiring |
| `proposal_submitted` | RPC concluída, tenant da linha RLS e versão retornada | `product` |
| `proposal_comparison_generated` | membership validada e comparação calculada | `product` |
| `decision_recorded` | decisão humana persistida pela RPC | `product` |

Nenhuma emissão contém e-mail, nome, CNPJ, JWT, texto livre, documento, termos,
valores, IDs brutos ou corpo de request. Propriedades extras são rejeitadas.
Identidades são HMAC-SHA256 de ator+tenant, com separação de domínio e versão da
chave; a organização recebe outro HMAC. Isso é pseudonimização, não anonimização.
Não se permite junção entre tenants. Person profiles e GeoIP ficam desabilitados
no payload. IP de transporte é o servidor, não o cliente.

`waitUntil` mantém a tentativa após a resposta sem aguardar analytics na operação
financeira. Timeout de 800 ms, payload máximo 2 KiB, no máximo 16 tentativas
simultâneas e 512 chaves por janela de 60 s **por processo**. Não há retry,
outbox ou entrega garantida. Duplicatas locais são suprimidas por chave de
operação+versão+ator; cold starts/réplicas podem duplicar. Não usar contagem de
eventos como total financeiro exato. Comparação conta operação, não página vista.
Não há alteração de RPC, migration, RLS, autenticação ou ranking.

## Ativação e privacidade (pendente)

A capacidade é centralizada em `resolveRuntime().canCollectProductAnalytics`:
somente Official válido com `VERCEL_ENV=production` pode coletar. Demo, Pilot, Preview, conflito
ou configuração incompleta fecham a coleta. O default é desligado.

Antes de configurar **somente no servidor Production**:

1. Responsável de privacidade registra finalidade, base legal/consentimento
   aplicável, transparência, subprocessador/região, retenção e exclusão/export.
   Proposta: retenção de 30 dias; **não foi aplicada no projeto remoto**.
2. Confirma projeto e região PostHog destinados ao Arandu, permissões mínimas
   e política de acesso. Projeto observado é `655307`, nome `Default project`;
   não é prova de isolamento organizacional ou configuração de retenção.
3. Cria chave HMAC aleatória de ao menos 32 bytes, independente de JWT/segredos
   Supabase, registra versão e plano de exclusão. Rotação quebra continuidade;
   não correlacionar versões. Exclusão exige referências seguras ao ator/tenant
   e acesso à versão correspondente da chave; não guardar essa associação no
   Linear. Destruir a chave antes de excluir pode impedir localizar eventos.
4. Define `POSTHOG_HOST` exatamente `https://us.i.posthog.com` ou
   `https://eu.i.posthog.com`, `POSTHOG_PROJECT_TOKEN`,
   `ARANDU_ANALYTICS_HMAC_KEY` (hex 64–128), `ARANDU_ANALYTICS_KEY_VERSION`
   (1–9999), `ARANDU_ANALYTICS_PROJECT_ENV=production` e
   `ARANDU_ANALYTICS_PRIVACY_REVIEW=privacy-review:<referência-aprovada>`.
   Essa referência é um gate operacional, **não verifica legalidade por API**.
5. Só depois define `ARANDU_ANALYTICS_ENABLED=true`, valida evento autorizado
   sem PII no projeto correto e confirma ausência de coleta nos demais ambientes.

Nenhuma dessas variáveis foi ativada remotamente nesta sessão. Tokens não entram
no repositório. Kill switch: `ARANDU_ANALYTICS_ENABLED=false` e redeploy; excluir
eventos anteriores conforme revisão. Rollback: reverter PR, sem rollback de banco.

## Dashboard preparado, sem evidência de uso

[Dashboard Arandu — operações e ativação](https://us.posthog.com/project/655307/dashboard/2191077)
tem tendências dos três eventos RFQ/proposta/decisão e funil organização → RFQ
na mesma identidade ator+tenant, janela 14 dias, filtro `environment=production`.
Foi consultado e não tinha amostra. Não mede lifecycle da empresa inteira:
criação e RFQ por atores diferentes não entram no mesmo funil; provedores têm
outro tenant. Definições são propostas; acesso ao Data Catalog não estava
disponível, portanto não são métricas certificadas. Convites, contratos, erros
e lifecycle completo exigem nova justificativa e contrato antes de instrumentar.

Speed Insights existente foi endurecido com `beforeSend`: somente rotas estáticas
exatas, sem query/hash, login/cadastro/invite, caminhos dinâmicos ou atributos
extras. Não há nova dependência de navegador. Isso reduz exposição de URL;
não comprova autorização de privacidade nem melhoria de Web Vitals em produção.

## Linear e gates

[Projeto Arandu — Financial Procurement OS](https://linear.app/arandufinance/project/arandu-financial-procurement-os-6142670fa839)
reutiliza equipe ARA e labels existentes. ARA-5: primeiro erro Vercel; ARA-6:
proteção efetiva de main; ARA-7: este lote; ARA-8: recovery/conversão; ARA-9:
revisão de privacidade. Issues registram evidência, aceite, testes e rollback.
ARA-7 não está Done. PR referencia identificador e URL; nenhuma integração
nativa GitHub–Linear foi declarada ativa sem prova e não há Linear em runtime.

Fechar uma issue exige evidência aplicável: M1 local, M2 quatro jobs no HEAD
exato/base atual, M3 deploy, M4 release, M5 produção, M6 cliente. Push/merge não
prova analytics ativo, retenção, recuperação ou proteção de branch. Incidentes
usam request IDs e referências de deploy, nunca dados financeiros de cliente.

## Verificação

`npm run test:analytics` cobre ambientes negativos, schemas, isolamento entre
tenants, ausência de PII, erro/timeout/limites, dedup, dispatch independente da
resposta e API com persistência confirmada. `check:platform` inclui esses testes.
`node scripts/benchmark-proposal-join.mjs` reproduz a comparação sintética da
junção indexada; não é medição de latência hospedada.
