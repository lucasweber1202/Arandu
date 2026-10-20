# Plano executável — benchmark, adoção bilateral e performance (20/10/2026)

**Atualização de direção v3.7:** os §§39–44 agora tornam CORE a plataforma única com três ofertas-alvo por complexidade, o caminho buyer-first, utilidade autônoma do provedor e a Central de Relacionamentos Financeiros como composição do ciclo. Este plano continua válido como baseline operacional **histórica v3.6**, mas não deve ser lido como cobertura de packaging, adoção ou prova comercial; para próximos PRs consultar `ARANDU_SEGMENTED_PRODUCT_OPERATING_MODEL_V37.md` e `ARANDU_V37_EVIDENCE_AND_DECISION_GATES.md`. Nenhuma prioridade supera P0-A/P0-B de 29/10.
**Status:** proposta normativa documentada em guideline v3.6 (§38), não release nem evidência de implementação.
**Baseline:** \`main@93ba6d5fcedf1d50262ddb30ae58704c44ad066a\`.
**Hierarquia:** \`ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md\` §§23, 24, 35–38; \`PUBLIC_DEMO_2026-10-29_PRIORITY.md\` para os dois P0; \`IMPLEMENTATION_MATRIX.md\` como registro de maturidade/provas. Segurança, neutralidade, RLS, legal, backup/restore e gates prevalecem.

## 1. Resultado de produto

**Buyer:** formular demanda (crédito/adquirência), obter propostas comparáveis, registrar decisão humana, monitorar contratos, condições, custos e oportunidades de renovação com histórico auditável. **Provider:** receber oportunidade qualificada, entender prazo e escopo, responder com fricção mínima, acompanhar suas próprias propostas e estados compartilhados. **Operação:** garantir isolamento, confiança, disponibilidade mensurável e recuperação. O produto não faz underwriting, não executa crédito/pagamento, não recomenda banco e não garante economia sem fonte.

**Segmento inicial a validar:** times financeiros de empresas médias/grandes com múltiplos relacionamentos financeiros e contratações/renovações recorrentes; instituições convidadas. Personas: CFO, tesouraria, analista, aprovador, admin, gerente/analista de instituição financeira. Adoção e WTP não estão demonstradas.

## 2. Benchmark competitivo, lições e limites

| Referência | Classe | Aprendizado para Arandu | Fronteira |
| --- | --- | --- | --- |
| [Treasury Delta](https://treasurydelta.com/) | Financial RFP/treasury, concorrente especialmente próximo | RFP bilateral, participação dos bancos e eficiência de resposta | Não declarar paridade de módulos/preços sem trial |
| [Finpass](https://finpass.com.br/) | Crédito corporativo, alternativa de descoberta/intermediação | Entrada simples e clareza de demanda de crédito | Arandu buyer-owned, não intermedia nem decide |
| [Zip](https://ziphq.com/) | Intake e procurement | Entrada por objetivo e workflow guiado | Não reconstruir S2P horizontal |
| [ORO Labs](https://orolabs.ai/) | Orquestração e intake | Menos atrito e roteamento contextual | Não adicionar motor genérico sem caso de uso |
| [Ivalua](https://www.ivalua.com/) | Procurement suíte completa | Conectar sourcing, contratos, suppliers e resultados | Não competir por cobertura horizontal |
| [Gatekeeper](https://www.gatekeeperhq.com/) | Vendor/contract lifecycle | Obrigações, renovação, performance e histórico de relação | Não inventar automação jurídica |
| [Kyriba](https://www.kyriba.com/) | Treasury Management | Dados consolidados de relacionamento e cash/fees | Integrar TMS; não recriar execução/ledger |
| [Redbridge HawkeyeBSB](https://promo.redbridgedta.com/software-bank-fee-analysis) | Bank fee intelligence | Normalização de demonstrativos e diferença contratual × observada | Divergência não comprova cobrança indevida |
| [Nexxera](https://www.nexxera.com/) | Conectividade financeira brasileira | Integração com banco/adquirente/ERP | Integrar quando permitido; não recriar infraestrutura |
| [Pagos](https://pagos.ai/) | Payments intelligence | Observabilidade de custos/qualidade de pagamentos | Não simular dados transacionais |
| [nCino](https://www.ncino.com/) | Software interno de instituições | Workflow e colaboração orientados a proposta | Não virar originação de crédito/core banking |

**Critério de pesquisa:** páginas públicas registram capacidades anunciadas, **não** ensaio de hands-on. O benchmark existente está em \`ARANDU_COMPETITIVE_LANDSCAPE.md\`; validar conteúdo e URLs antes de repetir claims comerciais. Para cada comparação nova, registrar URL, data, recorte geográfico, público, confiança e evidência. Revisão trimestral (§35.16). Não copiar texto/identidade do concorrente.

## 3. Prioridades e sequência de execução

| ID | Janela / prioridade | Resultado verificável | Responsável primário | Dependências / gatilho |
| --- | --- | --- | --- | --- |
| N36-P0-A | Até 29/10, **P0-A** | Visitante anônimo abre arandu-demo e percorre fluxo buyer/provider com interface fiel ao SHA publicado; provas de screenshots/manifest/assets, desktop/mobile e rótulo correto | Claude Code (UX), Codex (publicação/prova) | §37; não confundir tour M2 com M3 |
| N36-P0-B | Até 29/10, **P0-B** | Estação definitiva do owner executa demo canônica, com real API/Auth/RLS/Storage e seed fictício; freeze/readiness na máquina | Claude Code + owner | \`scripts/demo/local.sh\`, preflight real; efêmero ≠ READY |
| N36-P1-A1 | Após estabilizar P0, **P1-A** | Portal provider tem inbox, prazo, estados, respostas/réplica próprias, rascunho, UX mobile e perguntas autorizadas | Claude Code | D33-12; isolamento provider; feedback precisa de escolha do comprador |
| N36-P1-A2 | Após estabilizar P0, **P1-A** | Primeiro valor buyer por contrato existente, instituição, tarifa/vencimento e fluxo orientado por objetivo sem duplicação | Claude Code | D33-09, D33-14; reutilizar Graph e módulos |
| N36-P1-A3 | Após estabilizar P0, **P1-A** | Propostas externas recebidas fora do portal podem ser registradas com emissor, documento, revisão humana, provenance e teste de isolamento | Claude Code UI; Codex domínio numa etapa isolada | Reusar domain/modelo, validação de arquivo, não simular banco |
| N36-P1-A4 | Durante/apos P1-A, **P1-A** | Pesquisa registrada com compradores e instituições; métricas de ativação sem PII; iteração da jornada | Owner (recrutar), Claude Code (instrumentar UI) | D33-16; teste sintético ≠ pesquisa |
| N36-P1-B | Em paralelo isolado, **P1-B** | Demo hospedada canônica M3, Supabase Demo isolado e jornada real provada | Codex (preparar; owner autorizar) | Recovery/cutover §23.4 §36; dados/projetos NÃO alterados sem permissão |
| N36-P2-A | Depois dos gates aplicáveis, **P2** | Piloto legítimo mede resultado e disposição a pagar sem prometer produção sem provas | Owner + equipe | Aprovação jurídica, acesso, segurança, suporte, M3/M4/M5 conforme uso |
| N36-P2-B | Após evidência de demanda, **P2** | Ingestão e integração confiáveis de fees/ERP/TMS/APIs externas via contratos versionados | Codex, separado da frente UX | Fonte autorizada, reconciliação, idempotência e degraded mode |
| N36-P3 | Após adoção comprovada, **P3** | Novos produtos financeiros e network intelligence avaliados por caso de negócios | Owner e engenharia | Nova revisão legal/segurança; proibição de benchmark inventado |

A nota "após estabilizar" **não** exige M3 para pesquisa com dados sintéticos; uso de clientes/dados reais requer gates aplicáveis. P1-A e P1-B podem avançar em paralelo se seus arquivos, recursos e serviços forem isolados. Production continua P2 operacional como definido em §37; correção de segurança crítica não aguarda fila.

## 4. Backlog de UX buyer/provider — primeiro incremento

1. Mapear em screenshots reais as jornadas buyer: início, novo RFQ, convidados, propostas, comparação com pesos e cobertura, decisão, contrato existente, obrigação/renovação, histórico por instituição. Mapear provider: convite, aceite, detalhes, proposta, revisão, status.
2. Corrigir primeiro as rupturas: passos que parecem API real no tour estático, troca de contexto entre duas RFQs de crédito fictícias, confusão entre sandbox histórico e demo canônica, feedback/ações enganosas, rótulos técnicos, deep links ou formulários com erro.
3. Portal provider: inbox orientado a prazo, pendências e próxima ação; rascunhos explicitamente próprios, perguntas com escopo autorizado, histórico institucional sem visibilidade transversal; estados vazios e erros úteis. Só liberar escrita real após testes de backend.
4. Buyer: primeiro valor via contrato ou vencimento existente; importação externa de proposta com verificação humana; reuso autorizado de Passport e contexto do Graph; sem bloquear por enterprise setup cedo demais.
5. Fluxos econômicos: diferenças de termos tipados, cobertura e premissas; crédito sem fabricar CET; adquirência sem supor antecipação; tarifas e savings não colapsam evidências diferentes.
6. Usabilidade: desktop e 390px mobile, teclado, foco, feedback de escrita, responsividade e overflow. Capturas antes/depois e sessões registradas. Qualquer nova tela deve substituir esforço real, não adicionar complexidade.

## 5. Contrato de performance e integridade

As seguintes são **metas recomendadas para aferição**, não benchmarks comparativos, observações atuais nem SLAs:
- Core Web Vitals conforme [web.dev](https://web.dev/articles/vitals): LCP ≤ 2,5s; INP ≤ 200ms; CLS ≤ 0,1 **p75 por desktop/mobile**. Sem volume real, usar laboratório com limitação explícita.
- API leitura comum p95 ≤ 500ms, escrita comum p95 ≤ 1s; comparação realista de 10 propostas p95 ≤ 2s; erros 5xx elegíveis < 0,5%. 99,9% disponibilidade é apenas **hipótese comercial/operacional**, não garantia.
- Perfis de carga propostos: 10 org/30 usuários simultâneos; 50 org/100 simultâneos; 10 mil contratos e 100 mil observações fictícias; concorrência em propostas/decisões; falhas de DB/API/Storage/e-mail.
- Requisitos invariantes: jamais ler dados intertenant/provider concorrente; não duplicar decisão/contrato com retry; não gravar proposta sem ownership, versão e source; não calcular savings sem evidência; não confirmar escrita antes de persistência.
- Protocolo necessário: registrar SHA, branch, ambiente, região, dataset, mix de operações, warm/cold, concorrência, p50/p95/p99, erro, CPU/memória e rotas; distinguir CI/local de hospedado.
- Monitoramento: tracing/correlation ID, estado de ingestão, filas, alertas sem PII e sem conteúdo financeiro, budget JS por superfície e testes de navegadores; observar \`FINANCIAL_BUNDLE_HEADROOM.md\`, não aumentar orçamento sem análise.

**Gates técnicos:** \`npm run check:all\`; \`npm run build\`; testes de domínio/database/auth/RLS, E2E de buyer/provider, apresentação Chromium/Firefox/WebKit, capturas reais e regressão móvel; \`smoke:public-demo\` no domínio para P0-A; restore/canário/jornadas reais hospedadas para M3. Quatro checks obrigatórios no HEAD do PR (\`validate\`, \`database\`, \`deploy-boundaries\`, \`presentation\`), e merge-audit pós-merge. Nunca marcar sucesso sem rodar.

## 6. Validação de produto (OWNER_ACTION_REQUIRED)

- Entrevistar, como **meta inicial de pesquisa** e não resultado, ao menos 5 potenciais compradores financeiros e 3 usuários de instituições financeiras. Diversificar porte e frequência de negociações.
- Buyer: consegue cadastrar contrato existente e identificar ação em ≤ 10 min? Criar RFQ com dados disponíveis em ≤ 10 min? Explicar comparação com cobertura? Localizar contrato/renovação? Relataria valor/retorno?
- Provider: compreende demanda e pode responder com proposta previamente preparada em ≤ 15 min? Por que participaria novamente? Integraria ao próprio CRM? Que informação exigiria e qual não aceitaria compartilhar?
- Guardar observações agregadas, data, papel e tarefas, sem PII ou conteúdo financeiro no repositório. Percentual de conclusão, abandono, tempo, resposta de bancos, repetição e WTP são variáveis a medir, nunca dados inventados.
- Hipóteses rejeitadas devem gerar edição de escopo e prioridade, não "PASS" inventado.

## 7. Evidências e governança

Toda PR vinculada a uma iniciativa N36 deve entregar: hipótese e user job; diff; screenshots se UI; cobertura positiva/negativa; benchmark de performance relevante e limites; relatório de segurança/tenant quando muda dados; release proof conforme ambiente; atualização da Implementation Matrix distinguindo M1/M2/M3/M4/M5/M6; riscos e trabalhos pendentes.

**Trabalho paralelo:** Claude Code cuida de interfaces e textos do produto, visita, onboarding e portal provider (HTML/CSS/JS da UI); Codex cuida dos scripts de verificação de publicação, performance, carga, integridade e contratos de infraestrutura. Atribuir ownership preciso por arquivo antes de criar PRs, manter worktrees/branches distintos, proibir alteração simultânea de \`package.json\`, \`vercel.json\`, \`vite.config.js\`, migrations, \`lib/api/**\`, \`lib/finance/**\` e documentação compartilhada. Não fazer merge antes de checks, nunca suprimir falha ou teste por conveniência. Após estas PRs documentais, rebasear a partir do SHA atualizado de \`main\`.

**Limite operacional:** automação não pode mudar secrets, configuração hospedada, assignments Supabase, cutover, bancos reais, custos ou permissões GitHub sem autorização específica. Se bloqueado, documentar a menor intervenção humana possível e avançar no que pode ser comprovado localmente.

## 8. Definition of Done e decisão de priorização

- **P0-A:** visitor público anônimo, versão/SHA realmente servidos e navegação buyer/provider, screenshot real, honestidade visita versus API.
- **P0-B:** station READY no computador do owner, não somente runner efêmero.
- **P1-A:** buyer e provider concluem jornadas de primeiro valor/convite/compare/decisão/contrato sem assistência; testes de isolamento e métricas de ativação; hipóteses reais marcadas ainda não validadas até sessões registradas.
- **P1-B:** M3 somente com recovery, DB/Auth/RLS/Storage reais no hosted Demo, identidade/isolamento e journey comprovados.
- **P2:** somente com liberação jurídica, técnica e operacional pertinente; resultados medidos e honestos. Não iniciar expansão P3 sem evidência de procura.

**Regra de corte:** reduzir escopo de features secundárias antes de reduzir segurança, maturidade, transparência de dados, prazo dos P0 ou qualidade dos testes.
