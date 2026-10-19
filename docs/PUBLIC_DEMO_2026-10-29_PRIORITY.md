
# P0 de 29/10 — Demo pública compartilhável + estação local

**Decisão de owner:** 19/10/2026. **Norma:** guideline v3.5 §37, §23.4, §35 e §36. Status técnico vivo: docs/IMPLEMENTATION_MATRIX.md. Esta página é plano operacional, não substitui release gates.

## Resultado exigido

1. **P0-A: link público https://arandu-demo.vercel.app/**. Visitante externo sem conta Vercel/GitHub ou instalação abre em desktop/celular e conhece **a versão atual aprovada do produto financeiro**, com fluxo comprador e instituição, telas e linguagem coerentes com o produto canônico. Deve ficar claro o que é visita de produto, simulação em navegador ou operação em API real.
2. **P0-B: apresentação local**. O owner executa no computador definitivo a Demo canônica com backend, Auth, RLS e Storage reais sobre dados exclusivamente fictícios. Scripts já existem em scripts/demo/local.sh; station READY só na máquina real.
3. **P1: Demo canônica hospedada M3**. Não confundir com P0-A: Supabase Demo atribuído, export/restore e cutover autorizados, schema/identidade, workspace seguro por visitante, doctor/canário e jornadas HTTP autenticadas. Não inferir por deploy SUCCESS.
4. **P2: Production/M5**. Manter correções críticas independentes, mas novas features e operacionalização de cliente real não devem atrasar os dois P0.

## P0-A: tarefas do Claude Code (UX e produto público)

- Comparar a interface atual do código canônico da main com o que o visitante recebe em arandu-demo, especialmente entrada, dashboard, RFQ, proposta, comparação, aprovação, contratos, tarefas e portal de instituições. Identificar diferenças reais, não presumir paridade só porque os arquivos têm o mesmo commit.
- Produzir experiência pública navegável e fiel às cinco áreas e à Design Constitution, usando telas/capturas **realmente renderizadas** da Demo canônica no SHA aprovado ou reuso seguro da UI existente. Não desenvolver novas funcionalidades dentro do sandbox legado finance/demo; não criar segunda aplicação com regras financeiras próprias.
- Enquanto não houver backend hospedado, rotular a experiência como **visita guiada demonstrativa**. Se o sandbox atual continuar acessível, rotulá-lo **simulação local ao navegador**. Não apresentar interação sem API como persistência no banco, autenticação real, envio a provedor ou execução de contratos.
- Fazer entrada clara, fluxo orientado aos problemas de tesouraria, navegação e deep links, responsividade móvel, acessibilidade/teclado, sem 404/overflow, nem telas enganosamente vazias. Evitar PII, depoimentos, clientes e economias inventadas.
- Entregar PR com código e testes, capturas reais antes/depois, SHA, lista de rotas e limitações explicitadas. Preservar a Demo local e o prepare-station existentes.

## P0-A: tarefas do Codex (publicação e prova externa)

- Auditar vínculo da main ao projeto Vercel arandu-demo; examinar vercel-build, build:demo, rotas, redirect, assets, identidade de SHA, proteção de deployment e dependência indevida de sessão. **Não** alterar configuração remota ou segredos sem autorização específica.
- Implementar ou aprimorar smoke externo somente leitura: URL raiz, links da visita, buyer/provider, assets JS/CSS, status HTTP, redirecionamentos, desktop/mobile quando ferramenta permitir, demonstração honesta e SHA realmente servido. Distinguir PUBLIC_SHAREABLE de CANONICAL_HOSTED_M3.
- Se a API Vercel continuar respondendo 403 no team lucas-projects467, registrar ACCESS_BLOCKED, não tentar escopos alternativos; executar verificações externas públicas disponíveis e fornecer ao owner a intervenção mínima.
- Revisar a PR do Claude para paridade e implantação da vitrine, sem editar as mesmas páginas. O link só pode ser declarado atualizado após **publicação e smoke reais** no domínio.
- Recuperação de Supabase e cutover continuam em frente P1 isolada; não modificar ACTIVE_SUPABASE_ASSIGNMENTS nem remover o sandbox antes da substituição pública validada.

## P0-B: tarefas do Claude Code (estação do owner)

- Preservar scripts/demo/local.sh prepare-station --provision, freeze --station, resume, station e docs/demo/OPERATOR_29-10.md; não refazer infraestrutura já comprovada.
- D-3 (26/10): escolher SHA com CI verde, preparar e congelar na máquina definitiva. D-1 (28/10): ensaio, pool e readiness. D-0 (29/10): station READY e smoke antes da reunião.
- Executor efêmero com testes verdes só fornece PREPARED, nunca READY na máquina do proprietário.

## Aceite de PUBLIC_SHAREABLE (independente de M3)

- URL sem login Vercel/GitHub, proteção ou erro de proxy; não depende da estação local.
- Home leva a exploração realista da interface aprovada; comprador e provedor têm caminhos compreensíveis; cinco áreas identificáveis com rotas/assets sem 404.
- Layout renderizado em desktop e celular, sem overflow crítico, navegação funcional por teclado e mensagens de erro honestas.
- Dados, resultados e eventuais mudanças no navegador explicitamente sintéticos; **nenhuma escrita de backend alegada sem API real**.
- Evidência: SHA aprovado, URL/domínio, data, modo da demo (visita/sandbox/canônica), resultados HTTP e screenshots atuais, navegação automatizada/humana; test runner/CI não substitui teste do domínio servido.

## Gate de execução

- Branch de cada agente derivada da main atual; arquivos compartilhados (vercel.json, vite.config.js, package.json, runtime) têm **um único owner por vez**. Primeiro UX/visita, depois integração e smoke de deploy; Codex pode avançar em testes técnicos sem tocar UI.
- Rodar npm run check:all, npm run build, testes relevantes, QA visual para mudanças de interface, quatro gates obrigatórios na PR no HEAD exato. Não fazer merge antes dos gates e não desativar segurança para publicar.
- **22/10:** caminho P0-A viável sem cutover e máquina P0-B encaminhada. **26/10:** SHA candidato aprovado, smoke externo e congelamento local. **28/10:** validações finais dos dois P0.
- Se P0-A estiver inacessível ou visualmente desatualizado, declarar BLOCKED/NOT_PROVEN e corrigir; **não** anunciar PUBLIC_SHAREABLE por status SUCCESS. Se M3 bloqueado, seguir com visita M2 transparente.

## Limites que continuam válidos

- Apenas Demo e Production são ambientes hospedados permanentes; Pilot é transitório.
- Nenhum reset, seed, migration, export real, mudança de env hospedada, cutover ou exclusão de dado legado sem evidência e autorização específica.
- Nenhum dado real, service role em navegador, login fictício que aparente autenticação real, novas capabilities do sandbox ou envio externo.
- Production e M3 NÃO recebem status de prontidão por causa da entrega de conteúdo público.
