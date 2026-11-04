# PR316 — investigação do Passport e diagnóstico de rede

Incidente: run 41761330786, integração 126349537660, HEAD
ff438095526e1cd7b4ecc16e8d9175d79d1dfbd5. Artifact 13291831088 inspecionado
por completo: log desktop, logs app/gateway/Auth/REST, relatório HTML com JSON,
contexto da falha e screenshot. O único erro registrado no Passport foi
`Failed to load resource: net::ERR_TOO_MANY_RETRIES` na asserção do console,
após as verificações de conteúdo e snapshot da RFQ.

## Limite da evidência histórica

O coletor original guardava somente console.message.text(): descartava a URL
em message.location() e não observava requestfailed. O artifact não contém
trace/HAR; o ensaio desativa traces deliberadamente para não guardar cookies.
Os logs locais não têm access log por recurso. Portanto URL, método, tipo do
recurso e status da requisição original NÃO SÃO RECUPERÁVEIS. Não atribuir o
erro a favicon, script, API, rate limit ou regressão sem essa evidência. O código
é uma falha de transporte reportada pelo Chromium, não prova de HTTP 429.
Não foi demonstrada uma causa de aplicação nem uma condição transitória
específica; a classificação correta após os ensaios abaixo é NÃO REPRODUZIDO.

## Comparação controlada e reprodução canônica

Main de referência c72e6868940b2685b45f0f2728edab1763301679. Nenhuma alteração
em frontend, core do Passport, app-server ou gateway. Região de rotas profile/
history byte-equivalente; hash SHA256
68a4cda23e7322b9f09b1734546d4cf74cb5bf3407ea9f6a9ed1a7717c57de2c.
Builds no mesmo ambiente produziram os mesmos 67 assets, com hashes idênticos.
Isso não exclui toda falha possível no backend extraído, mas exclui mudança
nesses módulos/bytes como explicação direta.

Reprodução local bloqueada pelo preflight: 6GiB, Docker vfs exige 32GiB, sem
imagens. Preflight preservado. Proprietário autorizou runner GitHub existente.
Foi usado workflow_dispatch em branch diagnóstica descartável, sem PR nova,
sem secrets externos ou alteração de gates. O workflow diagnóstico NÃO integra
o candidato desta PR e não substitui os gates oficiais.

Run 41767679128 (commit diagnóstico 1a5d04e0), ubuntu-24.04, Supabase canônico
com imagens fixadas, migrations, GoTrue, Storage, seed e sessões reais. Sem
quatro workspaces, Recovery ou mobile, pois não são dependências do caso. A
sequência reproduziu as três jornadas que antecediam o Passport e depois o
Passport, seguido por três repetições específicas. Repetiu-se a sequência
contra o backend main no MESMO banco/build; somente finance.mjs foi substituído
pela versão main, que implementa tarefas/documentos internamente. O frontend
é byte-equivalente nas duas variantes. App reiniciado pelo comando oficial por
variante, preservando os limites de Auth: 11 logins por variante, abaixo de 12.

Resultado verificado no artifact 13293687992:
- 14 testes passed, zero failed e zero skipped.
- Passport: 4 casos com o backend da PR e 4 com o backend main.
- Todas as asserções de dados/histórico/snapshot e as duas recusas 403 do
  provedor por caso preservadas: 16 recusas esperadas verificadas.
- 1461 eventos sanitizados de resposta: 1459 status 200, 2 status 202;
  zero requestfailed observado. As requisições negativas feitas pelo
  APIRequestContext do provedor são verificadas pelo teste, fora desses eventos.
- Teardown e retenção de evidências success; nenhum acesso hospedado.

Duas tentativas preparatórias não executaram Passport: uma foi recusada pela
identidade local (URL de build externa removida), outra cancelada antes do seed
para corrigir o seletor --grep ancorado. O seletor passou a ser validado por
--list antes de preparar infraestrutura. Não contam como testes funcionais.

## Correção demonstrada

O problema corrigido é a perda de diagnóstico: console e requestfailed agora
identificam URL sanitizada, método, tipo, status quando existe e erro técnico.
Consultas, credenciais da URL, tokens, corpos e headers não são persistidos.
Assets públicos fingerprinted preservam nome para identificação exata. O flag
PASSPORT_NETWORK_DIAGNOSTICS habilita metadados detalhados somente no ensaio.

A asserção de problems vazio e TODAS as verificações de autorização permanecem.
ERR_TOO_MANY_RETRIES continua fatal, inclusive registrado em requestfailed.
Nenhum filtro global, retry de teste ou tratamento especulativo foi adicionado.
Não declarar corrigida uma causa de aplicação que não foi demonstrada. Uma
recorrência deve falhar com o recurso exato, permitindo correção direcionada.

Validação local: check:all, check:backend, sintaxe e diff check passaram;
coletor também validado em 10 execuções de Chromium real contra transporte HTTP
local (403 e conexão recusada). Esses 10 testes não são prova de Passport;
a prova canônica é o run acima. O candidato final ainda exige os quatro checks
oficiais verdes e integração completa no mesmo SHA.
