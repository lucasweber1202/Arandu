# Isolamento de visitantes da Demo pública — desenho (lote D)

Estado: **PLANEJADO** (11/10/2026). Nada aqui está implementado. Resolve os
itens `OPS-CONCURRENCY` e `OPS-PERSONA-RATE` da
[matriz de paridade](../DEMO_PRODUCTION_PARITY_MATRIX.md).

## Problema

Hoje a Demo canônica tem **um** conjunto de contas sintéticas (4 compradores,
5 provedores) e **um** dataset Vitta Foods. Numa Demo pública:

- Todo visitante entra nas mesmas contas. Quem cria uma RFQ, aprova ou decide
  muda o que o próximo visitante vê, e um visitante pode desmontar a jornada
  de apresentação (por exemplo, aprovar a etapa pendente da CFO).
- Os limites legítimos por conta valem para todos juntos: 20 logins/h por
  persona e 240 requisições/10 min por usuário. Testado localmente: a jornada
  E2E da Demo em dois tamanhos de tela já esgota a janela da API.
- Um reset global (`demo:reset`) derruba as sessões em andamento.

Relaxar limites ou abrir escrita compartilhada não resolve: só troca uma falha
visível por corrupção silenciosa da apresentação.

## Alternativas avaliadas

| Alternativa | Isolamento | Custo por visitante | Decisão |
| --- | --- | --- | --- |
| Dataset compartilhado + reset periódico | nenhum | zero | **Recusada**: visitantes interferem; reset derruba sessões |
| Seed completo por visitante pela API | total | minutos e centenas de chamadas sob rate limit | **Recusada**: lento demais para a entrada da Demo |
| Projeto Supabase por visitante | total | um projeto por sessão | **Proibida** pela missão |
| **Cópia do baseline dentro do banco DEMO, por visitante** | total, pelo RLS existente | uma transação SQL | **Escolhida** |

## Desenho escolhido: workspace por visitante

1. **Baseline imutável.** O seed atual continua montando a Vitta Foods pela API
   real. O resultado vira o baseline versionado (`dataset_version`) e nunca
   recebe escrita de visitante: as contas do baseline não são entregues a
   ninguém.
2. **Clonagem no banco.** Uma função `security definer`,
   `fin_demo_clone_workspace(p_baseline_version)`, existe só em migration
   aplicada a bancos com o marcador `fin_settings.deployment_environment=demo`
   e recusa executar sem ele. Ela:
   - copia a organização compradora e as cinco organizações provedoras do
     baseline, com todas as linhas do inventário já usado pelo reset
     (`scopedTables` em `scripts/demo/seed.mjs`, que passa a ser a fonte única
     compartilhada);
   - remapeia **todo** UUID do escopo (colunas e valores dentro de `jsonb`) por
     uma tabela de tradução temporária, para nenhuma linha clonada apontar para
     o baseline;
   - preserva datas relativas: o deslocamento é aplicado uma vez, igual para
     todas as tabelas;
   - não copia objetos do Storage: as versões de documento do clone apontam
     para os caminhos do baseline, que ficam somente leitura. Upload do
     visitante vai para o prefixo do workspace.
3. **Contas por workspace.** Para cada persona escolhida, o servidor cria sob
   demanda uma conta sintética `.example` exclusiva do workspace (por exemplo,
   `w<id>.juliana@vittafoods.example`), com senha aleatória que nunca sai do
   servidor. O papel vem do baseline, não do pedido. Isso também resolve o
   limite por conta: cada visitante tem as próprias contas.
4. **Sessão.** `POST /api/auth/demo-login` passa a:
   1. criar ou reabrir o workspace do visitante (cookie `HttpOnly` assinado com
      o id do workspace, sem dado pessoal);
   2. autenticar a conta daquela persona naquele workspace;
   3. trocar de persona = nova sessão no **mesmo** workspace, nunca entre
      workspaces nem com elevação de papel.
5. **Limites (sem serviço pago).**
   - Workspaces ativos: teto global configurável; acima dele, a entrada mostra
     "Demo cheia, tente em alguns minutos" (honesto, sem fila falsa).
   - Criação por IP: janela de rate limit existente.
   - Validade: 4 h sem uso ou 24 h no total. Um job `demo-workspaces`, no
     cron já existente e só em `ARANDU_ENV=demo`, apaga workspaces vencidos
     por escopo, usando o mesmo inventário e as mesmas travas do reset.
   - Quotas por workspace: RFQs, documentos (tamanho e quantidade) e convites,
     contados por SQL antes da escrita.
   - E-mail e webhooks continuam bloqueados pelo runtime (`canSendEmail=false`).
6. **Governança de dados.** Nova tabela `fin_demo_workspaces` (id, versão do
   baseline, criado em, último uso, expira em, contagens de quota), registrada
   em `lib/finance/data-governance.mjs` como dado sintético de demonstração,
   retenção de 24 h e exclusão por job. Nenhum dado pessoal: só o hash do IP
   para o rate limit, com a retenção do mecanismo existente.

## Gates antes de publicar

- Testes de banco: clone sem referência ao baseline (varredura de todo UUID);
  RLS entre dois workspaces (comprador A não lê B; provedor do workspace A não
  vê proposta do B); função recusada sem o marcador demo; job de limpeza
  apagando só o escopo vencido.
- E2E: dois visitantes simultâneos criando RFQs e aprovando, cada um sem ver o
  outro; troca de persona dentro do workspace; teto de workspaces.
- `check:demo-parity`: a clonagem não pode introduzir tela ou regra própria da
  Demo. O workspace é dado, não produto.
- Medição: tempo de criação do workspace no Supabase local, que precisa ficar
  aceitável para a tela de entrada.

## Fora de escopo

- Publicar a Demo hospedada: continua dependendo do Stage 0 e do cutover
  (`OPS-HOSTED`).
- Retirar o sandbox legado (`OPS-SANDBOX`): só depois da Demo canônica
  hospedada e validada.
