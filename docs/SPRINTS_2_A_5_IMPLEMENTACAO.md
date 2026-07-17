# Sprints 2 a 5 — implementação e passagem para lançamento

Este documento registra a sequência implementada e o que depende de execução operacional externa. A ordem dos sprints foi preservada para que nenhum gate posterior oculte uma dependência anterior.

## Visão geral

| Sprint | Objetivo | Implementado no código | Gate externo para concluir |
|---|---|---|---|
| 2 | Supabase e catálogo real | Migration de prontidão, API sem fallback público, validação de 5/20, seed protegido e teste canário | Dados reais/autorizados, migration aplicada e escrita verificada |
| 3 | Consolidar website | Fonte única do catálogo, navegação, busca, menu fechado, rotas canônicas e CSS final | QA visual e de conteúdo no preview |
| 4 | Marca e operação | Config pública segura, domínio/contato, gates de marca e comercial | Identidade, domínio, contato e política aprovados |
| 5 | Piloto fechado | Sessão por código, eventos mínimos, feedback, métricas e páginas operacionais | Coorte, credenciais, proteção do deploy e ciclo de feedback |

## Sprint 2 — Supabase e catálogo real

Entregue:

- `docs/supabase-sprint2-catalog-readiness.sql` adiciona campos de comprovação, release editorial, view de prontidão e view pública filtrada;
- `docs/arandu-mvp-collections.sql` publica coleções somente sobre as views seguras do catálogo aprovado;
- `/api/catalog` e `/api/artists` exigem `verifiedReady: true` e nunca devolvem fixture local como produção;
- `/api/collections` segue o mesmo gate e não possui fallback demonstrativo;
- `js/catalog-source.js` concentra o consumo público da API;
- `scripts/seed-supabase.mjs` bloqueia seed real sem service role e sem release aprovado;
- `scripts/test-supabase-write.mjs` valida escrita, leitura e limpeza via API;
- `npm run check:catalog` valida contrato e cenários de bloqueio/liberação.

Para concluir:

1. Cadastrar ao menos 5 artistas e 20 obras reais.
2. Confirmar identidade, origem, consentimentos e autorizações de imagem.
3. Aprovar `data/catalog-release.json` com revisão humana.
4. Aplicar as migrations de prontidão e coleções e rodar o seed.
5. Rodar o teste de escrita no preview protegido.

## Sprint 3 — website consolidado

Entregue:

- menu primário mais curto e diferenciado;
- busca sempre visível e menu secundário fechado;
- rotas canônicas registradas em `data/public-routes.json` e aliases redirecionados;
- sitemap, robots e canonical gerados apenas para domínio próprio;
- paleta pau-brasil, argila e terracota, com fundos porcelana e seções vivas;
- mensagens honestas de indisponibilidade quando o catálogo real não está pronto.

Para concluir:

1. Conferir as 19 rotas canônicas no preview.
2. Validar navegação por teclado, celular e desktop.
3. Revisar textos e imagens com o catálogo final.
4. Rodar teste visual no domínio real antes da abertura.

## Sprint 4 — marca, domínio e operação comercial

Entregue:

- `/api/public-config` expõe apenas configuração pública segura;
- WhatsApp e e-mail deixaram de ser valores estáticos de produção;
- domínio provisório não satisfaz SEO nem prontidão de lançamento;
- `ARANDU_BRAND_READY` e `ARANDU_COMMERCIAL_READY` controlam os gates;
- reservas e propostas ficam bloqueadas enquanto a política comercial estiver pendente;
- `data/commercial-policy.json` transforma a revisão comercial em checklist verificável.

Para concluir:

1. Publicar logo, favicon e imagem social finais.
2. Configurar domínio próprio e canal de contato real.
3. Aprovar os 10 itens da política comercial.
4. Definir as flags de marca e comercial somente depois das aprovações.

## Sprint 5 — piloto fechado

Entregue:

- `docs/supabase-sprint5-pilot.sql` cria eventos e feedback privados;
- `/api/pilot/access` cria cookie `HttpOnly`, `Secure` e `SameSite=Lax`;
- `/api/events` aceita somente eventos e propriedades permitidos, sem texto livre sensível;
- `/api/pilot/feedback` recebe feedback estruturado;
- `/api/pilot/metrics` exige autenticação administrativa;
- `/piloto.html` explica a coorte e `/painel-piloto.html` acompanha sinais;
- telemetria respeita `Do Not Track`.

Para concluir:

1. Aplicar a migration do Sprint 5.
2. Configurar código e segredo fortes.
3. Manter o preview protegido no provedor de hospedagem.
4. Definir a coorte e o roteiro de tarefas.
5. Corrigir bloqueadores críticos identificados no feedback.
6. Registrar a conclusão com `ARANDU_PILOT_APPROVED=true` e desativar o gate para o lançamento público.

O gate do navegador organiza o acesso da coorte, mas não substitui proteção de infraestrutura para conteúdo realmente restrito.

## Sequência operacional final

1. Aplicar migrations na ordem de `docs/supabase-migrations.json`.
2. Preparar e aprovar catálogo real.
3. Fazer seed e teste de escrita.
4. Configurar domínio, contato e marca.
5. Aprovar política comercial.
6. Abrir preview protegido para o piloto.
7. Corrigir bloqueadores e repetir os testes críticos.
8. Marcar o piloto como aprovado e desativar o código de convite.
9. Rodar `npm run predeploy`.
10. Fazer deploy público somente quando o comando passar.

## Comandos de controle

```bash
npm run check:all
npm run build
npm run check:catalog:release
npm run check:domain:release
npm run check:commercial:release
npm run check:pilot:release
npm run predeploy
```

Um check de release vermelho não deve ser contornado. Ele indica uma decisão, credencial, dado real ou verificação externa ainda pendente.
