# Issue #240 — evidência de distribuição em 19/10/2026

Coleta externa entre 20:46 e 20:55 America/Sao_Paulo (JSON usa UTC).
Main observada: `3b3fd481d3fc05fbd42382c85b59226eccc6f518`.
Projeto pretendido: arandu-demo / lucas-projects467; alvo público
https://arandu-demo.vercel.app/. API Vercel: ACCESS_BLOCKED (403 no escopo
correto). Não foram alterados configuração, domínio, secrets, proteção ou banco.

| Contrato | Resultado e alcance |
| --- | --- |
| LOCAL_BUILD_PASS | PASS: npm ci, check:all, build oficial e demonstrativo; checks individuais de paridade, links, separação, segurança, supply-chain e audit (zero vulnerabilidades). check:all executado com umask 022, como CI; 077 impedia a fixture deliberadamente insegura do teste de recovery. |
| DEPLOYMENT_OBSERVED | PASS limitado: resposta anônima HTTPS 200; health declara main/SHA acima, mode=demo, synthetic-fixtures, misconfigured=false. ID do deployment e configuração do projeto não observados pela API. |
| Identidade dos bytes | NOT_PROVEN para o contrato novo: /arandu-build.json responde 404. Hashes dos seis assets de entrada e do HTML coletados em http.json; SHA do servidor é declaração de runtime, não substitui manifesto do artefato. |
| Navegador externo | Raiz → explorar e sete rotas existentes, reloads e entrada de persona provedora observados em Chromium, 1440 e 390 px. HTTP 200, imagens completas, sem overflow horizontal nas rotas medidas. Há pageerrors ViewTransition; não é navegador verde. Comparação/jornada integral aprovada da nova visita ainda não estão publicadas. |
| PUBLIC_SHAREABLE | NOT_PROVEN para a experiência atual aprovada; smoke técnico novo FAIL por manifesto ausente. O link acessível ainda serve sandbox Acme/Marina, não a visita da PR #241. |
| LOCAL_STATION_READY | NOT_RUN: máquina definitiva do proprietário fora desta missão. |
| CANONICAL_HOSTED_M3 | BLOCKED: readiness externa 503 not_ready; synthetic-fixtures, sem Supabase Demo aprovado. Nenhum cutover foi executado. |

## Integração com Claude

PR #241, HEAD `7708944d388dc1a77d6b322da6a9c1c9bebd0c4e`, lida e testada
em worktree descartável. Nenhum HTML/CSS/vite.config/arquivo visual foi editado
nesta branch. O adaptador usa as âncoras reais de `lib/public-tour.mjs`, incluindo
as dez etapas e as cinco áreas. O build combinado PASS, inventário HTTP e hashes
PASS. As 15 etapas e seus reloads foram percorridos em ambos os viewports.

O browser recusou PASS por `Transition was aborted because of invalid state.
ViewTransition opt-in disabled` em desktop **e** mobile. Reprodução mínima:
Chromium → raiz → clicar #tour-start → networkidle; URL do erro visita.html,
stack vazia. Observado também no sandbox já publicado. A entrada importa
experience.css com opt-in de navegação; a visita carrega outra lista de estilos.
A causa e correção devem ser avaliadas pela frente de UX, sem suprimir o erro.
Handoff publicado na conversa da PR #241, conforme a coordenação solicitada.

`integration-local.json` registra uma identidade de **teste** do candidato da
PR: a ref main nos metadados injetados é fixture do contrato, não afirma que a
PR foi aprovada, mergeada ou implantada. URL é loopback, local=true; não serve
como evidência externa. Capturas do produto canônico também continuam pendentes
na PR #241 e não foram fabricadas.

## Próximos gates concretos

- Corrigir/explicar o pageerror com evidência de navegador na frente de UX.
- Integrar #241 e a PR #240 pelos quatro gates verdes no HEAD exato; esta
  entrega não executa merge nem confunde checks da base com CI desta branch.
- Inspecionar configuração/deployment assim que a conexão Vercel receber acesso
  de leitura a arandu-demo no escopo correto. Não enviar tokens no chat.
- Publicar o candidato aprovado pelo fluxo existente, executar smoke com seu
  SHA completo e guardar JSON/screenshots do domínio atribuído. Até lá: PENDING,
  nunca PASS. Sem permissão de deploy, operador autorizado realiza esta etapa.

Arquivos JSON desta pasta contêm somente dados sintéticos e metadados públicos;
não há cookies, estado de autenticação, trace com credenciais ou dados de banco.
