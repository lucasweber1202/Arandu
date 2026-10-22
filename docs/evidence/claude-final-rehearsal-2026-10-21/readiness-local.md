# Prontidão da Demo local — 21/10/2026, 18:07:25

Commit `d17ad67d5542` (HEAD) · app https://localhost:4443 · smoke executado

- **Modo leitura: PRONTO**
- **Modo interativo: NÃO PRONTO** — Pool de visitantes (entrada por persona) (→ npm run demo:local:workspaces -- provision --count=4 (≈ 10 min por par))

## Identidade do código

| Verificação | Resultado | Detalhe |
| --- | --- | --- |
| Commit em uso | PASS | d17ad67d5542 (HEAD) |
| Árvore sem alterações locais | PASS |  |
| Build da interface atualizado | PASS | build de 21/10/2026, 17:56:14 |
| App local iniciado depois do último commit de API | PASS | app iniciado em 21/10/2026, 17:56:43 |

## Serviços

| Verificação | Resultado | Detalhe |
| --- | --- | --- |
| Contêineres do Supabase local | PASS | arandu-pilot-local-storage-1: Up 10 minutes · arandu-pilot-local-auth-1: Up 10 minutes · arandu-pilot-local-rest-1: Up 10 minutes · arandu-pilot-local-db-1: Up 11 minutes (healthy) |
| Auth (GoTrue) | PASS | HTTP 200 |
| Banco via PostgREST | PASS | HTTP 200 |
| Storage (documentos privados) | PASS | HTTP 200 |
| App do Arandu | PASS | ambiente demo, dados supabase |
| Sonda de prontidão da implantação hospedada | WARN | not_ready — esperado na Demo local (banco fora da topologia hospedada) |
| Página de login | PASS | HTTP 200 |

## Personas e autenticação

| Verificação | Resultado | Detalhe |
| --- | --- | --- |
| Juliana Ramos (gestão financeira) entra | PASS | juliana.ramos@vittafoods.example |
| Helena Duarte (administração) entra | PASS | helena.duarte@vittafoods.example |
| Rafael Menezes (análise) entra | PASS | rafael.menezes@vittafoods.example |
| Carlos Tavares (leitura) entra | PASS | carlos.tavares@vittafoods.example |
| Eduardo Lima (Atlas Bank) entra | PASS | eduardo.lima@atlasbank.example |
| Patrícia Alves (Meridian Financial) entra | PASS | patricia.alves@meridianfinancial.example |
| Bruno Sato (Orbe Capital) entra | PASS | bruno.sato@orbecapital.example |
| Diego Freitas (Lumina Pay) entra | PASS | diego.freitas@luminapay.example |

## Cenário semeado (leitura)

| Verificação | Resultado | Detalhe |
| --- | --- | --- |
| Vitta Foods visível para a gestora | PASS | Vitta Foods S.A. |
| Nova linha de crédito em avaliação | PASS | comparing, 2 proposta(s) |
| Adquirência decidida e contratada | PASS | contracted, 3 proposta(s) |
| Concorrência sazonal em coleta | PASS | collecting, 1 proposta(s) |
| Contratos vigentes (Lumina e Atlas) | PASS | 3 contrato(s) |
| Checagens de sanidade do seed | PASS | 39/39 checagens |

## Estado inicial do Modo interativo (precisa estar intocado)

| Verificação | Resultado | Detalhe |
| --- | --- | --- |
| Orbe já respondeu à concorrência sazonal (base da comparação parcial) | PASS | versão 1 |
| Meridian ainda pode responder (convite ativo e coleta aberta) | PASS | convite accepted |
| Meridian ainda não enviou proposta na concorrência sazonal (I6) | PASS | 1 proposta(s) na coleta |
| Etapa da CFO pendente na nova linha (I4) | PASS | pedido aguardando a Helena |
| Nenhuma tarefa de ensaio anterior (I1–I2) | PASS | 19 tarefa(s) abertas; 0 de ensaio |
| Tarefas do seed presentes | PASS | 19 abertas |
| Pool de visitantes (entrada por persona) | FAIL | 0 workspace(s) pronto(s); 0 entrada(s) nova(s) na última hora (limite 4/h por rede) |

## Smoke das jornadas essenciais pela API real (só leitura)

| Verificação | Resultado | Detalhe |
| --- | --- | --- |
| Comparação da nova linha (Juliana) | PASS | HTTP 200 |
| Implantação do contrato da Lumina por contract_id | PASS | HTTP 200 |
| Covenants e obrigações | PASS | HTTP 200 |
| Leitor (Carlos) lê tarefas | PASS | HTTP 200 |
| Meridian vê a concorrência sazonal em coleta | PASS | HTTP 200 |
| Portal mostra o comprador quando a API informa (buyer_name) | PASS | nome do comprador presente |
| Atlas não vê outras instituições | PASS | 0 menção(ões) a concorrentes |
