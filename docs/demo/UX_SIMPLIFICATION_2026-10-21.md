# Simplificação da experiência — diagnóstico e primeira rodada (21/10/2026)

**Base:** `main` em `5460489` (#244 e #245 integradas). Escopo: apresentação no
frontend canônico (`finance/src/views/*`, `finance/style.css`). Nenhuma mudança em
API, migrations, RLS, permissões ou motor de comparação.

**Evidência de partida:** um avaliador externo disse que o produto "atende, mas
mostra opções demais ao mesmo tempo". É uma observação qualitativa isolada, não uma
pesquisa: as mudanças abaixo são reversíveis e não removem nenhuma capacidade.

## 1. Diagnóstico por tela

Escala de concorrência visual: quantos blocos ou ações disputam a atenção acima da
primeira dobra (desktop 1440×900).

| Tela | Persona | Próxima ação do fluxo | Concorrência antes | Essencial | Sob demanda (nível 4) |
| --- | --- | --- | --- | --- | --- |
| Painel (`dashboard.js`) | tesouraria, gestor, CFO | o item mais urgente de "Precisa de você" | **alta**: até 8 pendências + resumo + pipeline de 6 etapas + processos + atividade + contratos + tarefas | pendências com motivo, prazo e responsável; processos em andamento; renovações | contagem por etapa, atividade da empresa, pendências além das 5 primeiras |
| Detalhe da RFQ (`rfq.js`) | gestor, aprovador | um primário por estado (abrir, encerrar coleta, solicitar aprovação, registrar decisão/contrato) | média: primário único + Editar + menu "Mais" + 6 abas | estado, prazo, primário | exportar, reabrir, cancelar (já no menu "Mais") |
| Comparação (`rfq.js`, aba) | gestor, CFO | ajustar pesos e solicitar aprovação | média–alta: tabela larga | diferenças e cobertura de campos | detalhamento completo por proposta (já em "Ver todas as condições") |
| Solicitações (`rfqs.js`) | gestor, analista | abrir a solicitação | baixa | lista com estado e prazo | filtros |
| Contratos (`contract-center.js`) | gestor | decidir renovação dentro da janela | média | vencimento, aviso prévio | histórico, implantação |
| Relacionamentos (`provider-relationship.js`) | gestor | consultar instituição | baixa | contratos e processos por instituição | qualificação, performance |
| Passaporte (`passport.js`) | gestor, admin | revisar campos vencidos | média | valor, origem, data | histórico append-only |
| Portal da instituição (`provider.js`) | gerente da instituição | aceitar convite ou responder | baixa, mas **duas ações primárias iguais** quando o convite estava em destaque | oportunidade, prazo, estado da proposta | campos opcionais (já recolhidos) |

Papéis: as ações de gestão já dependem de `ctx.can('create_rfq')` e
`TASK_EDITORS`, que espelham o backend (RLS e `fin_task_edit`). Esta rodada não
mexe nisso: ocultar um botão nunca substitui a autorização do servidor.

## 2. Jornadas escolhidas e o que mudou

### Jornada 1 — Painel do comprador
- **Pendências:** 5 à vista, em ordem de urgência. O restante fica na mesma lista,
  em "Mostrar mais N pendências" (`<details>` nativo, acessível por teclado).
- **Passo de processo não é soterrado:** no bloco visível entram no máximo 3
  tarefas soltas. Na captura "antes", 7 tarefas vencidas empurravam "Avaliar
  propostas" para o oitavo lugar; agora ele fica à vista.
- **Contagem por etapa** (pipeline de 6 casas) virou "Ver solicitações por etapa".
  A lista de processos com prazo e respostas continua visível.
- **Atividade recente** virou seção recolhida e só é buscada quando aberta. Isso
  economiza uma requisição em todo carregamento do Painel.
- O resumo (4 contagens com link), contratos, renovações e tarefas não mudaram.

### Jornada 2 — Entrada da instituição financeira
- Com um convite em destaque, o mesmo "Aceitar" aparecia duas vezes como botão
  primário (destaque e cartão). Agora a tela tem **uma** ação primária; o botão
  do cartão passa a ser secundário e continua funcionando.
- O restante do portal já seguia a hierarquia pedida: próxima ação, convites,
  "Para responder", "Enviadas", "Encerradas", e na proposta o obrigatório primeiro
  com os blocos opcionais recolhidos e a contagem do que falta.

### Passaporte — clareza sem falsa validação
- "confirmado há X por Y" passou a "confirmado como atual há X por Y (revisão
  interna)": a confirmação é de quem gravou, não uma verificação independente.
- O subtítulo diz que os dados são declarados ou anexados pela própria empresa e
  que nenhuma instituição ou terceiro os valida aqui.
- **Ambiguidade para a frente de governança de evidências (Codex):** as origens
  `documento_interno` e `extrato` dizem de onde veio o dado, mas não ligam a um
  arquivo anexado e verificável. Falta separar "declarado", "com documento
  anexado", "revisado internamente" e "dentro da validade" como estados
  independentes no modelo, e não só na apresentação.

## 3. Evidência

- Capturas antes/depois em `docs/demo/captures-2026-10-21/`: Painel e portal da
  instituição, desktop 1440 px e Pixel 7. Usam os mesmos mocks dos testes E2E,
  não dados reais.
- Testes novos: Painel (5 à vista, tarefas limitadas, resto sob demanda,
  atividade sem requisição antes de abrir, sem overflow) e portal (uma ação
  primária com convite em destaque).

## 4. Limitações e próximas recomendações (adoção bilateral)

1. **Comparação por grupos** (condições, prazos, garantias, tarifas, liquidação,
   premissas, pendências de informação): exige agrupar os campos no catálogo
   `lib/finance/products.mjs`, que é modelo compartilhado com a API e a
   comparação. Fica como especificação para rodada coordenada com o Codex, sem
   motor paralelo no frontend.
2. **Detalhe da RFQ:** frase de "próximo passo" por estado e papel, ligada ao
   primário do cabeçalho. Só apresentação, mas toca as 6 abas: próxima rodada.
3. **Portal da instituição — hipóteses, não implementadas:** colaboração interna
   (vários usuários da instituição na mesma proposta), modelos reutilizáveis de
   resposta e exportação para CRM. Precisam de validação com bancos antes de
   qualquer código.
4. Firefox e WebKit não estão instalados no contêiner; a cobertura deles fica com
   o CI.
