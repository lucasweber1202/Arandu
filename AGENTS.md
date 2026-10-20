# Arandu — Instruções para Codex e agentes de código

Antes de planejar ou modificar qualquer arquivo, leia:
1. `CLAUDE.md` (instruções comuns, inclusive política de branches e gates).
2. `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` (autoridade normativa atual).
3. `docs/IMPLEMENTATION_MATRIX.md` (evidências e maturidade reais).
4. `docs/FINANCIAL_PRODUCT_BOUNDARIES.md` (limites de produto e dados).
5. Para mudanças de interface: `docs/ARANDU_DESIGN_CONSTITUTION.md` e `docs/FRONTEND_AGENT_TOOLKIT.md`.

**Prioridade P0 — 19/10/2026, preservada na v3.6:** guideline §37 e docs/PUBLIC_DEMO_2026-10-29_PRIORITY.md. Entregar URL pública do arandu-demo fiel à interface atual e navegável sem conta/instalação, mesmo se for visita M2 honesta; em paralelo estação local canônica validada no computador de apresentação. Não confundir link público com M3 hospedado, não adicionar novas capacidades ao sandbox, manter cutover/recovery e gates. Claude Code prioriza UX e visita; Codex prioriza deploy, URL, smoke externo e infraestrutura; evitar arquivos concorrentes.

**Sequência posterior (v3.6 §38):** após provar P0-A/P0-B, priorizar adoção bilateral (portal provider, primeiro valor, propostas externas com proveniência, pesquisa real), em paralelo à preparação independente da Demo M3 com recovery/cutover autorizados; em seguida piloto seguro, integrações baseadas em evidência e, somente depois, expansão. Ver `docs/FINANCIAL_COMPETITIVE_EXECUTION_PLAN_2026-10-20.md`; metas de latência/escala são hipóteses e não SLAs/claims. Não reclassificar M2/M3 ou adiar 29/10 por esse backlog.

O Arandu é um Financial Procurement Lifecycle OS B2B, não marketplace de arte, ERP genérico, banco ou sistema de execução financeira. Preserve autorizações, isolamento entre tenants, trilha de auditoria, provenance, decisões humanas e funcionamento Demo/Production. Não invente dados, claims, testes, capturas ou maturidade.

**Trabalho paralelo:** branch nova da `main` atual; ownership de arquivos/superfícies sem sobreposição; não modificar branches, worktrees, serviços de Demo ou artefatos de outro agente. Se um arquivo compartilhado estiver reservado, não editar: fornecer proposta para o integrador. Nunca fazer merge direto, alterar secrets/configuração hospedada ou desabilitar gates para obter verde.

**Frontend:** ferramentas externas de estética/design são orientação consultiva e **não** substituem a Design Constitution, os tokens, o Playwright existente ou os testes E2E. Antes/depois em Demo canônica se disponível. `check:design`, `check:all`, `build`, E2E pertinente e evidências no HEAD exato; executar antes de um único push quando o ambiente permitir. Sem alegar PASS quando não rodou.

Este arquivo **não** autoriza instalar pacotes de terceiros sem revisar conteúdo, proveniência e efeitos da instalação. Consulte `docs/FRONTEND_AGENT_TOOLKIT.md` para a sequência e fronteiras de cada ferramenta.