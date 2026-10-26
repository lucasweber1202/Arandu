# Frente A — evidência de implementação e validação

Base inicial: 78e3bb36221c6ef4b7bfc3ea450a144bf790ab39; #272 e #273 são
ancestrais. A branch externa antiga 27c2308 já está integrada. Nenhuma PR
externa concorrente estava aberta na reconciliação inicial. Durante a missão,
a main avançou para bc4d8df5c792feb2add16c4121f046c2514b5fe9 (#274 Claude).
Nenhum arquivo reservado foi editado por esta frente.

## Capacidade entregue

Registro/revisão existentes passam à seleção humana, aprovação canônica e vínculo
explícito a contrato importado. A migration adapta as fontes lidas pelo motor
existente; não cria banco/convite/aceite nem outro cálculo ou outra policy.
UI externa oferece decisão, aprovação e continuidade separada. Ausências,
incomparabilidades e origem buyer_recorded_external permanecem explícitas.
Contrato/vínculo exigem confirmação, versão e compatibilidade da identidade e moeda.
A documentação do contrato está em EXTERNAL_FINANCIAL_PROPOSALS_V37.md.

## Verificação executada

- npm ci --include=optional: PASS, lockfile preservado.
- npm run build: PASS.
- npm run check:all: PASS na rodada inicial; repetido após documentação final.
- scripts/test-finance-external-proposals.mjs e suíte financeira agregada: PASS.
- npm run test:database em PostgreSQL 16 descartável: PASS; instalação limpa,
  upgrade, aplicação repetida, rollback pré-uso, retorno da camada anterior,
  RLS, regressões de contratos/decisões/policy e três caminhos novos externos.
- financial-external-decision.sql: PASS; papéis/entidade/outro tenant/provedor,
  aprovação e SoD, documento removido, revisão da RFQ, conflitos de versão/moeda,
  snapshot após correção, replay e vínculo separado, sem contrato automático.
- external-decision-concurrency.mjs: PASS; seis retries do mesmo comando geram
  um registro; escolhas concorrentes geram uma decisão; revogação durante espera
  do lock impede escrita; rollback após uso recusa com forward-fix explícito.
- Playwright finance-external-proposals.spec.js: 28 PASS, Chromium desktop e
  viewport 390 px, teclado, sem overflow, confirmação separada e consulta após
  perda de resposta sem segundo POST. API simulada no navegador; esses testes
  não são prova de Auth/RLS hospedados. SQL real cobre a autorização separadamente.
- Capturas locais: reports/external-decision-chromium-desktop.png e
  reports/external-decision-mobile-chrome.png; inspeção visual em 390 px.

Ambiente: container Postgres oficial, network none, sem porta publicada, sem URL
hospedada, fixtures exclusivamente sintéticas. Não houve migration/seed remoto.
Falhas encontradas e corrigidas: orçamento inicial de JavaScript da RFQ
(273357 > 250000 bytes), corrigido com carregamento externo sob demanda;
 marker não reconhecido pelo canário; ordem de
rollback entre adapter e view externa; seleção acessível de campo obrigatório
no teste. Rodada check:all sem permissão de loopback falhou com EPERM; repetir
com execução local autorizada mantém todas as assertions. Nenhum gate foi reduzido.

## Integração e operação

A possui manifesto, doctor, probes, core error mapping e runner comum. B não
altera esses arquivos em paralelo e precisa registrar sua migration após A
integrada. Migrations aditivas e rollback próprios; rollback recusa uso material.
Sem merge automático. Aprovação dos quatro gates deve ser verificada no SHA
exato publicado. Não representa M3 hospedado nem pesquisa comercial.
