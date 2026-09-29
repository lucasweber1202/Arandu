# Aposentadoria da superfície de arte

O histórico de arte continua no Git para auditoria, mas páginas e assets de arte não entram no build explícito do Vite. O script de assets deixou de copiar indiscriminadamente `css/`, `js/`, `data/` e `assets/`. Rewrites para páginas internas de arte foram retirados de `vercel.json`; os aliases mais conhecidos, `/obras.html` e `/acervo.html`, apontam ao novo início.

Os módulos de banco e APIs antigos não são removidos nesta rodada, pois isso exigiria revisão separada de dados, retenção e migração. A ausência de HTML publicado não é uma autorização para apagar dados históricos.

`npm run check:financial-surface` falha se `dist/` contiver páginas antigas ou as frases visíveis identificadas na auditoria. Auditar também os redirects e a saída do Vercel depois do deploy: `dist/` e o comportamento do host são duas superfícies distintas.

## Índice do material histórico de arte

Nada abaixo é produto atual. Os documentos continuam versionados porque
registram decisões, o banco ainda carrega o esquema de arte e alguns checks
legados (`npm run check:commercial`) os leem.

- `docs/OPERACAO_COMERCIAL_INDEX.md` — índice da operação comercial de arte;
- `docs/GO_LIVE_ARANDU.md` — roteiro de promoção e abertura da vertical de arte;
- `docs/PRIMEIROS_30_DIAS.md` — operação inicial prevista para a vertical de arte;
- `docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md` — prospecção de artistas;
- `docs/CHECKLIST_PARCEIRA_ARTISTA.md` — autorizações e parceria com artistas;
- `docs/PROSPECCAO_COMPRADORES_EMPRESAS.md` — aquisição de compradores de arte;
- `docs/FLUXO_COMPRA_RESERVA.md` — jornada de seleção e reserva de obras;
- `docs/OBJECOES_E_RESPOSTAS.md` — respostas comerciais da vertical de arte;
- `docs/CALENDARIO_CONTEUDO_30_DIAS.md` — calendário editorial;
- `docs/METRICAS_FUNIL_ARANDU.md` — funil de aquisição da vertical de arte;
- `docs/SEO_DOMINIO_CHECKLIST.md` — domínio, indexação e SEO do site de arte.

`ops/release-evidence.json` guarda os 13 gates do go-live comercial de arte
(catálogo real, política comercial, concorrência de reservas etc.). Eles não
bloqueiam o piloto financeiro, cujo estado está em
`docs/FINANCIAL_PILOT_GO_LIVE.md`.

As páginas `.html` de arte na raiz do repositório não entram no build
(`vite.config.js` lista a superfície publicada explicitamente) e
`npm run check:financial-surface` falha se alguma delas for publicada.
