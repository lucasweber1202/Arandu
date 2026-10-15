# Arandu — Design Constitution

**Versão 1.0 — 11/10/2026 · normativa** (Guideline v3.3 §35.5). Rege a aparência e o comportamento de todas as superfícies: workspace da empresa, portal da instituição, site público e Demo. Quando esta constituição e um documento técnico divergirem, vale esta; quando ela e a guideline divergirem, vale a guideline.

> **Regra de interpretação.** Cada seção termina com critérios **verificáveis**. Um critério marcado *(automatizado)* tem teste ou checador no repositório; *(revisão)* exige captura renderizada e revisão humana registrada (§15). Critério sem um dos dois não conta como cumprido.

## 1. Princípios

1. **O produto é o argumento.** Interfaces mostram dados reais do processo financeiro; decoração não substitui informação.
2. **Fato antes de opinião, também na tela.** Cor, ordem e destaque nunca insinuam "melhor proposta" ou "melhor instituição" (guideline §3.3, §4.1). Extremo informado é marcado de forma neutra.
3. **Trabalho antes de painel.** Toda informação relevante leva a uma ação ou a um contexto verificável. Indicador sem metodologia e cobertura não aparece.
4. **Densidade por contexto.** Telas de decisão (comparação, portfólio, tarifas) são densas e alinhadas; telas de entrada (intake, onboarding, portal do provedor) são espaçosas e guiadas.
5. **Linguagem de gente.** A interface nunca mostra UUID, enum em inglês, nome de tabela/função, timestamp ISO ou mensagem de stack. Termos em inglês só quando são o vocabulário do público (spread, covenant, MDR, CET já é português).
6. **Uma família visual.** Site público, workspace, portal e Demo usam os mesmos tokens; muda a densidade, não a identidade.

## 2. Anti-vibecode (critério objetivo de qualidade)

Padrões que **não** entram sem justificativa escrita na PR:

| Padrão | Por que é problema | Alternativa |
| --- | --- | --- |
| fileira de 4 KPIs no topo de toda página | número sem consequência, repete o menu | lista de trabalho com motivo/prazo/responsável |
| cards de mesmo tamanho para conteúdos de pesos diferentes | esconde hierarquia | tabela, lista ou layout com coluna principal |
| gradiente, glassmorphism, sombra grande decorativa | ruído; não informa estado | superfície plana com borda (§5) |
| ícone repetido em toda linha sem função | ruído visual | ícone só onde diferencia tipo ou estado |
| vários botões primários na mesma área | a pessoa não sabe o que fazer | um primário por região; demais secundários |
| copy vaga ("potencialize", "inteligente", "revolucione") | não diz o que acontece | verbo + objeto + consequência |
| animação gratuita | distração; custo de acessibilidade | só transição de estado ≤ 150 ms |
| páginas com estruturas diferentes para a mesma função | quebra o aprendizado | padrões de §8 |

Critérios: *(revisão)* checklist §15 na PR; *(automatizado)* `scripts/test-finance-executive.mjs` recusa UUID/enum/função/ISO nos resumos do painel; `scripts/check-design-tokens.mjs` recusa cor de marca fora dos tokens nas folhas de estilo principais.

## 3. Cor

### 3.1 Tokens de identidade

| Token | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#0e1c2b` | marca, texto principal, superfícies escuras do site |
| `--ink-700` | `#24384a` | texto secundário forte, avatares |
| `--petrol` | `#0e5a6e` | ação primária, link, seleção, foco |
| `--petrol-hover` | `#0a4757` | hover/pressed |
| `--petrol-weak` | `#e8f2f5` | fundo de seleção e contagem |
| `--petrol-light` | `#5fb2c4` | detalhe da marca sobre tinta (nunca texto sobre branco) |

`--accent*` são aliases de `--petrol*`. O site público só cria aliases (`--navy`, `--teal`) para os mesmos valores.

### 3.2 Semântica

Sucesso `#0f7a45`, atenção `#8f5200`, perigo `#b83227`, informação `#1b5ea6` — sempre com fundo fraco e borda própria. **Verde nunca significa "melhor oferta"**; significa estado concluído/conforme.

### 3.3 Contraste (medido em 11/10/2026)

petróleo/branco 7,76:1 · tinta/branco 17,2:1 · muted `#5b6474`/branco 5,97:1 · branco/petróleo 7,76:1 · todos os semânticos ≥ 6:1. Critério *(automatizado)*: `scripts/check-design-tokens.mjs` recalcula e exige ≥ 4,5:1 para texto.

## 4. Tipografia

- **UI:** sans do sistema com Inter quando disponível (sem carregar fonte externa; CSP `font-src 'self' data:`). Escala 12/13/14/16/20/24.
- **Site público:** display editorial serifado (`Iowan Old Style`, Palatino, Charter, Georgia) só em h1/h2. Texto corrido na sans.
- **Números:** `font-variant-numeric: tabular-nums` em toda tabela, `dd` e `.num` *(automatizado: presente no CSS base)*.
- Títulos de página em sentença ("Contratos e renovações"), sem caixa alta; rótulos de seção de menu em versalete pequeno.

## 5. Espaço, superfícies e forma

- Escala 4/8/12/16/20/24/32/40 (`--s1`…`--s10`).
- Raios 5/7/10 px. Superfícies de conteúdo são **planas com borda** (`.card`, `.table-card` sem sombra). Sombra só para camadas sobrepostas (menu, diálogo, drawer, toast).
- Largura máxima de conteúdo 1440 px; página nunca rola na horizontal *(automatizado: `scripts/design/capture-surfaces.mjs` mede overflow em 390 e 1440 px)*.

## 6. Responsividade

Breakpoints existentes: 1279, 1099, 959, 759, 420 px. No celular: barra inferior com quatro destinos (Início, Solicitações, Contratos, Aprovações) e folha "Mais" com todas as áreas agrupadas. Tabelas densas viram lista ou rolagem interna, nunca rolagem da página.

## 7. Arquitetura de informação e navegação

Cinco áreas por objetivo, fonte única em `lib/finance/navigation.mjs`:

1. **Meu trabalho** — Início, Tarefas, Aprovações (Notificações pelo sino/folha).
2. **Contratações** — Solicitações, Propostas, Documentos e fatos, Implantação.
3. **Portfólio financeiro** — Contratos e renovações, Dívida e limites, Covenants e obrigações, Tarifas bancárias, Spend, Valor e savings, Oportunidades.
4. **Relacionamentos** — Instituições e provedores, Qualificação, Performance.
5. **Governança** — Perfil financeiro, Configurações.

Regras: nenhuma rota muda; deep links continuam; a área da página atual nunca fica recolhida; a pessoa pode recolher as demais (lembrado no navegador); páginas sem trilha própria mostram a área na barra superior. Provedor tem uma única área e nunca vê rota da empresa. Critérios *(automatizado)*: `scripts/test-finance-command-center.mjs` (fonte única, rotas preservadas, áreas, deep links, isolamento do provedor); `scripts/generate-finance-pages.mjs --check`.

## 8. Componentes e padrões

| Padrão | Implementação | Regra |
| --- | --- | --- |
| Cabeçalho de página | `.page-head` (h1 + lede + ações) | um primário à direita no máximo |
| Lista de trabalho | painel "Precisa de você" | tipo · título com objeto · motivo/prazo · ação |
| Tabela financeira | `.table-card`, `.matrix` | numerais tabulares, unidade no cabeçalho, ausente = "Não informado", nunca 0 |
| Estado (pill) | `.pill-*` | texto sempre presente; cor não é o único sinal |
| Timeline / ciclo de vida | `.contract-timeline` | "Hoje" marcado; datas por extenso curto |
| Vazio | `emptyState` | diz o que falta e a próxima ação; ausência ≠ zero |
| Erro | `errorState` | o que falhou, o que fazer, código de referência |
| Carregamento | `loading()`, `aria-busy` | sem spinner infinito; leitor de tela informado |
| Diálogo/drawer | `<dialog>` nativo | foco preso, Esc fecha, foco volta ao gatilho |

## 9. Tabelas financeiras

Colunas de valor alinhadas à direita; moeda explícita; moedas nunca somadas; percentuais com unidade (`a.a.`, `a.m.`); campo não informado aparece como "Não informado" e conta na cobertura; extremo marcado de forma neutra (nunca verde/"melhor"). Condição que mudou na versão atual de uma proposta é marcada na própria célula com sinal de informação e o valor anterior ("Alterado na v2 · antes: 1,29%"), sem cor de melhor/pior; cada coluna declara quantas condições comparáveis foram informadas *(automatizado: E2E de comparação)*.

## 10. Interação e motion

Transições ≤ 150 ms apenas em mudança de estado; `prefers-reduced-motion` desliga animações *(automatizado: regra no CSS)*. Atalhos: Ctrl/⌘+K busca; Esc fecha camadas.

## 11. Acessibilidade

WCAG 2.2 AA como piso: contraste §3.3, foco visível com anel petróleo, alvos ≥ 32 px (≥ 44 px no toque), `aria-current` no menu, `aria-expanded/controls` nos grupos recolhíveis, `role=status` para mensagens assíncronas, link "Pular para o conteúdo" em toda página.

## 12. Conteúdo e microcopy

Português do Brasil; verbo + objeto ("Registrar contrato existente"); prazos relativos com data absoluta ao lado ("aviso prévio em 25 dias (05/11/2026)"); nunca prometer resultado financeiro; "Arandu não decide pela empresa" onde houver comparação ou recomendação aparente.

## 13. Formulários

Obrigatório, desejável e não aplicável são distintos; validação em linha; salvamento automático com estado visível; revisão antes do envio; valores reutilizados mostram a origem (Passport).

## 14. Dados fictícios

Somente na Demo (`ARANDU_ENV=demo`) e em testes. Domínios `.example`; empresa e instituições fictícias; selo de ambiente sempre visível. Capturas no site público vêm da Demo canônica e são rotuladas como demonstração.

## 15. Design QA e regressão visual

1. `node scripts/design/capture-surfaces.mjs --label=<rótulo>` contra a Demo canônica local (`npm run demo:setup`) gera capturas desktop 1440 px e celular 390 px das superfícies principais, com manifest (SHA, overflow, erros). Captura com tela de erro falha.
2. Toda PR com mudança visual anexa ou referencia o par antes/depois e responde ao checklist: hierarquia, alinhamento, contraste, densidade, overflow, estados (vazio, erro, sem permissão), teclado, celular.
3. CI: `validate` publica `reports/financial-visual` (Chromium desktop e mobile) como artefato; `presentation` cobre a Demo em cinco motores.
4. Revisão visual só é declarada com renderização efetiva; ambiente sem navegador registra a limitação.
