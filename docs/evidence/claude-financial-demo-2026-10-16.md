# Evidência — Demo financeira canônica e tarefas paginadas (Claude), 16/10/2026

Base: `main` @ `168e60d` (#203–#208 integradas). Branch: a branch gerenciada da sessão
(`claude/gracious-mendel-2l3lsh`), reiniciada dessa `main` depois do merge da #207. Nenhum arquivo de
`api/**`, `lib/api/**`, `lib/finance/**`, SQL, rollback, manifesto, workflows, `ops/**`,
`docs/IMPLEMENTATION_MATRIX.md` ou `docs/evidence/codex-*` foi alterado; `package.json` intacto.
Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local, backend real em Docker). **Não** é validação
hospedada.

## Escopo desta rodada
Lote B (tarefas consumindo o contrato da #206), um defeito de memória institucional achado no ensaio
(Lote C), roteiro executável de 29/10 e ensaio técnico das 12 etapas (Lote E). Portal do provedor
(Lote D): verificado no ensaio, sem defeito demonstrável novo.

## Defeitos reproduzidos

| # | Sev. | Rota / persona | Antes (main) | Depois | Arquivos |
| --- | --- | --- | --- | --- | --- |
| T1 | P0 | `/finance/tasks.html`, qualquer membro | A tela lia só as 200 tarefas mais próximas do prazo (sem filtro) e filtrava no navegador. Com 249 abertas no backend real, mostrava no máximo 200 e "Atribuídas a mim"/"Sem responsável" podiam omitir tarefas existentes; a contagem era do recorte local | Cada filtro é consulta ao servidor (`status`, `assignee_id`, `unassigned`, `limit=50`); "Carregar mais tarefas" segue `page.next_cursor` do **mesmo** filtro; texto "N tarefas carregadas · há mais neste filtro / todas deste filtro" (nenhum total global inventado) | `finance/src/views/company.js` |
| T2 | P1 | idem | Troca rápida de filtro: resposta atrasada de um filtro anterior podia sobrescrever a lista | Geração por consulta; respostas antigas são descartadas | idem |
| T3 | P1 | idem | — (não havia paginação) | Cursor recusado (400) → "A lista mudou desde a última página. Recarregamos do início."; queda de rede em "carregar mais" mantém o que já estava na tela | idem |
| T4 | P2 | idem e Painel | Releitura completa após cada PATCH só para provar gravação (custo de rate limit) | Desde a #206, PATCH 200 = linha gravada e 404 = nada alterado; a interface confia nesse contrato, trata 404 em linguagem clara e relê só a primeira página do filtro atual. Painel não faz mais leitura extra | `company.js`, `dashboard.js` |
| R1 | P2 | Instituições → Relacionamento com Atlas Bank (Juliana) | Contrato sem título aparecia como "Contrato registrado" — dois contratos indistinguíveis | Categoria e vencimento ("Crédito… · vence 09 de jan de 2027"), como no resto do produto | `finance/src/views/relationship-context.js` |

## Prova no backend real (T1)
Inseridas 230 tarefas sintéticas ("Ensaio de paginação NNN") direto no Postgres **local descartável**
da Vitta Foods; Juliana em Tarefas, desktop 1440 e celular 390:
`50 → 100 → 150 → 200 → 249 tarefas carregadas · todas deste filtro`; 249 = contagem no banco
(19 do seed + 230); 249 ids únicos; 4 requisições com cursor, todas com `status=open`; overflow 0.
Capturas `paging-desktop.webp`, `paging-mobile.webp`. As 230 linhas foram apagadas em seguida.

## Regressões (servidor simulado fiel ao contrato da #206: filtros, ordem estável, cursor, 400, PATCH sem linha → 404)
`tests/e2e/finance-contracts.spec.js`: mais de 200 abertas paginadas sem duplicata e com filtro preservado;
resposta atrasada descartada; cursor recusado e rede caída; concluir na 2ª página; filtros consultam o servidor
(teste anterior atualizado); PATCH recusado (404) não vira sucesso (teste da #207 atualizado ao contrato vigente).
`tests/e2e/finance-portfolio.spec.js`: contrato sem título nomeado por categoria e vencimento.
Contra o código da `main`: **6 FAIL** (5 de tarefas + 1 de relacionamento); com a correção, PASS.

## Ensaio técnico das etapas (Demo local, backend real, `rehearsal-*.json`)
Etapas 2–13 do roteiro, Juliana e Eduardo (Atlas), desktop 1440 e celular 390: **12/12 PASS em cada**
(rota e objeto certos, sem tela de erro, sem UUID/ISO/null/undefined em `#view`, overflow 0, sem erro de
console). Provedor não vê Lumina, Orbe, Nexo nem Meridian. Capturas `step-NN-{desktop,mobile}.webp`.
Etapa 1 (login) é coberta pelo próprio login do ensaio. Não executadas no ensaio (gravam dados):
aprovar como CFO, concluir/atribuir tarefa — cobertas por `demo-baseline`.

## Validação
Resultados na descrição da PR (check:all, build, design, parity, financial-surface/navigation, E2E,
apresentação, demo). Firefox, WebKit e iPhone: **NOT_RUN** localmente (só Chromium 1194; `playwright
install` vedado) — o gate `presentation` do CI cobre.

## Seed
Não alterado: a história completa já existe no seed canônico (38/38 checagens). Tarefas >200 foram
provadas com inserção local temporária, não no seed, para não poluir a narrativa da Demo.

## Handoffs ao Codex
| Prioridade | Endpoint | Problema | Esperado | Aceite |
| --- | --- | --- | --- | --- |
| P2 | `GET implementations/detail` (`lib/finance/implementation-presenter.mjs`) | "Origem: contrato <uuid> · decisão <uuid>", "atualizado <ISO>" e fallback do responsável por id — impede abrir o detalhe na apresentação | origem como texto (título do contrato, "decisão registrada em …"), data legível, "Não informado" | detalhe sem UUID/ISO |
| P3 | `GET implementations`, `GET covenants` | atalho do contrato só filtra por instituição/entidade | `contract_id` opcional | lista só do contrato |
| P3 | `GET tasks` | sem contagem por filtro | (opcional) `page.count` exato ou estimado declarado | — a interface não precisa disso para ser honesta |

## Riscos e rollback
Risco: lista de tarefas agora depende de `page`/cursor da #206; servidor antigo sem `page` cai em
"todas deste filtro" (sem "carregar mais"). Rollback: reverter os commits da PR (só interface, testes e docs).

## Estado para 29/10
Jornada principal (etapas 1–13) executável de ponta a ponta na Demo **local**. Pendências que afetam a
apresentação: detalhe da implantação (handoff P2 — contornado no roteiro) e validação da Demo
**hospedada** (Codex, M3).
