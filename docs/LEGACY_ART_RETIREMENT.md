# Aposentadoria da superfície de arte

O histórico de arte continua no Git para auditoria, mas páginas e assets de arte não entram no build explícito do Vite. O script de assets deixou de copiar indiscriminadamente `css/`, `js/`, `data/` e `assets/`. Rewrites para páginas internas de arte foram retirados de `vercel.json`; os aliases mais conhecidos, `/obras.html` e `/acervo.html`, apontam ao novo início.

Os módulos de banco e APIs antigos não são removidos nesta rodada, pois isso exigiria revisão separada de dados, retenção e migração. A ausência de HTML publicado não é uma autorização para apagar dados históricos.

`npm run check:financial-surface` falha se `dist/` contiver páginas antigas ou as frases visíveis identificadas na auditoria. Auditar também os redirects e a saída do Vercel depois do deploy: `dist/` e o comportamento do host são duas superfícies distintas.
