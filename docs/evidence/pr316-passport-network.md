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
Essa limitação histórica foi superada pela nova reprodução instrumentada abaixo;
não é possível atribuir retroativamente a mesma URL ao artifact original.

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

## Primeiro candidato: diagnóstico, sem resolução do transporte

Nesse primeiro candidato foi corrigida a perda de diagnóstico: console e requestfailed agora
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


## Recorrência instrumentada — não resolvida pelo primeiro ensaio

O candidato f4fab52778c6fb703ae00aba7b5ca40868135a7b voltou a falhar no run
41769527859, job 126375752225, artifact 13295332022. O diagnóstico preservou
a falha e identificou o recurso:

```json
{"kind":"requestfailed","url":"https://localhost:4443/api/finance/private-documents?[redacted]","method":"GET","resourceType":"fetch","status":null,"error":"net::ERR_TOO_MANY_RETRIES"}
```

Também houve console.error para essa mesma URL. É uma chamada de API de
listagem de documentos da RFQ, não um arquivo estático. Nenhuma resposta HTTP
foi recebida: não há evidência de HTTP 429, 403 ou erro do backend nesse evento.
A origem no frontend é `rfq.js` → `documentsPanel` → `documents.js:refresh`;
o GET usa `organization_id`, `entity_type` e `entity_id` (valores suprimidos).
Os logs app/gateway não registraram erro correspondente. O ensaio com 14 PASS
acima não prova estabilidade: usava metadados detalhados no console e o erro
voltou no gate oficial. Não foi incluído filtro nem retry para ocultá-lo.

A main avançou para 3dff06cf e o proprietário integrou o frontend da PR317 à
PR316 no HEAD 8cb28e6b. Essa integração foi preservada antes do novo ensaio.
A comparação dos 67 assets acima vale para os SHAs antigos explicitados, não
para esse frontend novo.

## Hipótese TLS e verificação isolada

Chromium 156.0.8078.4, a mesma revisão 1248 do Playwright fixado no projeto,
reinicia transações ao ignorar erros de certificado e limita reinícios em 32
(`HttpNetworkTransaction::RestartIgnoringLastError` / `CheckMaxRestarts`).
Uma fixture HTTPS local fez 1024 GETs com o comportamento anterior e observou
964 erros internos de autoridade de certificado (-202), apesar de todos os
GETs terem passado. A mesma fixture com confiança na chave pública exata do
certificado local fez 1024 GETs e zero erro de autoridade. Essa fixture NÃO
reproduziu ERR_TOO_MANY_RETRIES e não substitui a Demo canônica.

A correção em avaliação deriva um SHA256-SPKI do certificado público já gerado
pela stack local, somente para HTTPS em localhost/127.0.0.1/::1, com validação
de hostname e validade. O navegador usa HTTPS estrito nesse caso; um servidor
com outra chave continua recusado com ERR_CERT_AUTHORITY_INVALID (verificado
no Chromium exato). Não há trust de certificado hospedado, instalação em trust
store global, alteração de produção, retry ou relaxamento dos asserts.

## Resultado do ensaio silencioso e decisão

Run 41774188936, diagnóstico b51ed7972907f69fe586ed67d842d36216c4aca1,
artifact 13297081570. Usa o backend/frontend do HEAD 8cb28e6b e compara somente
o modo TLS do navegador; PASSPORT_NETWORK_DIAGNOSTICS desabilitado. Três lotes
por modo, cada um com tesouraria, CFO, provedor e Passport, app reiniciado pelo
comando oficial entre lotes. Não modifica limites de Auth nem políticas.

- 24 PASS, zero FAIL/SKIP; 6 Passport (3 padrão + 3 com a chave local).
- As 12 recusas 403 de Passport/history do provedor foram verificadas.
- Padrão: 41 + 48 + 48 = 137 SSL_HANDSHAKE_ERROR / ERR_CERT_AUTHORITY_INVALID.
- Chave local: 0 + 0 + 0 erros de autoridade.
- Nenhum HTTP_TRANSACTION_RESTART_AFTER_ERROR em ambos os modos.
- O NetLog também contém ERR_CACHE_RACE (-406) interno em notifications,
  igualmente nos dois modos, sem falha terminal do teste. Isso não é HTTP 406.
- ERR_TOO_MANY_RETRIES não reapareceu neste ensaio. Não foi produzido um trace
  causal de uma transação que tenha esgotado os 32 reinícios. Atribuir a falha
  histórica definitivamente ao certificado excederia a evidência disponível.
- Raw NetLog excluído antes da publicação; artifact contém somente contagens e
  metadados sanitizados, relatórios HTML e logs sem estado de sessão.

A alteração adotada elimina o mecanismo de exceção de certificado observado na
Demo canônica e mantém HTTPS estrito para a chave local. Trata uma deficiência
demonstrada do transporte de teste; é a mitigação limitada da causa provável,
não uma correção especulativa do backend nem prova absoluta de ausência de flake.
A fixture concorrente complementar fez 1536 GETs por modo: zero falhas terminais
em ambos, 1521 erros internos de certificado no padrão e zero com a chave local.
Um certificado com outra chave foi recusado pelo Chromium com HTTPS estrito.

Validação local após a integração do frontend: check:all, build, unidade TLS,
coletor, seleção --list do Passport, sintaxe e git diff --check PASS. A configuração
não adiciona retry, não remove console/requestfailed, não altera gates nem o
workflow oficial da PR. O ensaio reduzido existe apenas na branch diagnóstica;
a PR permanece sujeita à integração completa, Recovery e quatro checks no SHA
candidato. O HEAD 8cb28e6b também passou a integração completa do run 41772806436
antes desta alteração; isso reforça a natureza intermitente, sem provar causa.
