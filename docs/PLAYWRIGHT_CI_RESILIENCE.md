# Playwright CI — preparação verificável

Baseline da correção: main `b5ce6944faaa9108bc5cea588d9892c573da803e`.
Escopo: infraestrutura dos jobs validate/presentation; Production é frente separada.

## Evidência da causa

Run #794 (37664210563) passou os quatro gates no merge #142. Ambos os jobs
restauraram cache Playwright 1.63.0 e instalaram dependências de sistema.
Run #795 (37669076014), HEAD da #143, restaurou a mesma chave, mas ambos
esgotaram 12 minutos em install-deps com Ign nos índices Azure/Ubuntu.
Presentation ainda executou a suíte pelo if !cancelled(), após install-deps
failure e instalação de browsers skipped. WebKit falhou ao carregar
libevent-2.1.so.7. A matriz terminou 188 passed/142 failed/25 skipped.
Referências: logs completos dos jobs validate 112956438134 e presentation
112956438057; comparação com 112939742389/112939742227 do #794.

## Preparação corrigida

configure-ci-apt.mjs troca somente a URL azure.archive.ubuntu.com/ubuntu por
https://archive.ubuntu.com/ubuntu nas sources do runner Ubuntu 24.04 x64.
Mantém suites/components/Signed-By e verificação de assinatura; não adiciona
repositórios, trusted=yes ou downloads externos. A troca é idempotente.
Retries apt limitados a 3; timeouts HTTP/HTTPS 30 segundos; update Error-Mode any
recusa índices incompletos em vez de prosseguir silenciosamente. install-deps
continua obrigatório em cache hit/miss e tem 25 minutos, noninteractive.
Job tem 70 minutos para acomodar preparação e suites completas; não há retry
infinito nem instalação que ignore falha.

Cache continua restrito aos binaries, com Ubuntu/arquitetura/versão Playwright/
lockfile na chave; não cacheia pacotes ou diretórios de sistema. npm ci mantém
Playwright 1.63.0 e as revisões do lockfile (Chromium 1243/153.0.8010.12, Firefox 1543/155.0 e
WebKit 2359/26.6 segundo node_modules/playwright-core/browsers.json). install dos três motores sempre roda.

verify-ci-browsers.mjs lança Chromium, Firefox e WebKit headless e renderiza uma
página local. Falha imprime BROWSER_PREPARATION_FAILED, exit 1, antes das suites.
Presentation usa condição padrão success, impedindo execução após falha de
preparação. Retenção de evidências continua executando conforme sua condição.
Os cinco projetos desktop/mobile e todas as suites permanecem inalterados.

## Verificação e limites

O teste test-ci-browser-preparation.mjs cobre sources deb822/list, preservação
de assinatura, substituição restrita, idempotência e gate obrigatório antes das
suites. Integra check:governance. O probe local foi exercitado com binary ausente:
exit 1 e mensagem clara antes de qualquer jornada.

Neste executor, instalação Playwright tentou o CDN oficial e recebeu conteúdo
truncado/inválido (End of central directory record signature not found).
Isso não é PASS de browsers nem de E2E/presentation. Evidência de inicialização
e suites completas deve vir do run da PR no HEAD exato. Não mergear com gates
queued/in_progress/failure/skipped/ausentes. Run #794 não substitui esse novo run.
Rollback: reverter a correção por PR sob os mesmos quatro gates, sem alterar audit.

Validação local: npm ci --include=optional, audit:ci (0 vulnerabilidades),
check:all, build, check:build-size, check:dist-assets e test:e2e:list PASS.
Nenhum teste de browser é declarado aprovado neste executor.
