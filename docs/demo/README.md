# Arandu Financial Procurement — Demo Baseline

A demonstração do Arandu é **o produto real** com uma empresa fictícia muito
bem preparada. Não existe branch, build ou tela exclusiva de demonstração: a
mesma `main` serve demo e produção, e o que muda é configuração, banco e dados.

| Pergunta | Onde |
| --- | --- |
| Como a demo é montada e isolada da produção | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Que dados existem (empresa, personas, processos) | [DATASET.md](DATASET.md) |
| Como semear, resetar e quais são as travas | [RESET.md](RESET.md) |
| Roteiro de 5–10 minutos para apresentar | [RUNBOOK.md](RUNBOOK.md) |

## Subir a demo localmente

Pré-requisitos: Node 22+ (o projeto declara 24.x), Docker e `psql`.

```bash
git clone https://github.com/lucasweber1202/Arandu.git && cd Arandu
npm ci
npm run demo:setup     # Supabase local real (Docker) + build + app em ARANDU_ENV=demo + seed da Vitta Foods
```

O comando termina com 20 checagens de sanidade e a lista de personas. Abra
`https://localhost:4443/login.html` (certificado autoassinado) e entre com uma
persona; a senha é gerada por ambiente em
`scripts/pilot-local/.state/demo.env` (fora do Git).

| Comando | O que faz |
| --- | --- |
| `npm run demo:setup` | sobe tudo e (re)semeia a demo local |
| `npm run demo:local:reset` | apaga só os dados da demo e semeia de novo |
| `npm run demo:local:check` | só as checagens de sanidade |
| `npm run demo:down` | derruba o ambiente local e apaga chaves e dados gerados |
| `npm run test:e2e:demo` | jornada E2E da demo (exporte `ARANDU_DEMO_PASSWORD` antes) |
| `npm run demo:seed` / `demo:reset` / `demo:check` | o mesmo contra um Supabase DEMO hospedado ([RESET.md](RESET.md)) |

## A empresa

**Vitta Foods S.A.** — indústria de alimentos e bebidas fictícia, ~R$ 180
milhões de receita, ~600 colaboradores, operação no Brasil. Usa o Arandu há
quase dois anos: tem uma linha de capital de giro contratada perto da
renovação, uma concorrência de adquirência concluída com contrato vigente, uma
nova linha de crédito em negociação com aprovação na etapa da CFO e um
rascunho em preparação.

## Personas

| Persona | Cargo | Papel no Arandu | Para mostrar |
| --- | --- | --- | --- |
| Juliana Ramos | Gerente de Tesouraria | `finance_manager` | jornada principal |
| Helena Duarte | CFO | `admin` | aprovação pendente com ela |
| Rafael Menezes | Analista Financeiro Sênior | `analyst` | comparação e comentários |
| Carlos Tavares | Controller | `viewer` (aprovador) | primeira etapa de aprovação |
| Eduardo Lima | Atlas Bank | provedor | portal do provedor com 3 oportunidades |
| Diego Freitas | Lumina Pay | provedor | proposta vencedora em duas versões |
| Camila Torres, Bruno Sato, Patrícia Alves | Nexo, Orbe, Meridian | provedores | concorrentes |

E-mails `nome.sobrenome@<instituição>.example` (domínios reservados para
documentação: nunca recebem mensagem). Lista completa em [DATASET.md](DATASET.md).

## Financial Passport v2

A baseline de `pilot` inclui proveniência, confirmação, frescor, histórico
append-only, documentos privados e fotografia imutável dos campos reutilizados
na RFQ. O dataset e o roteiro incluem o Passport. Ele só aparece na demo
pública depois da promoção para `main` e da instalação do Supabase DEMO.
Estado hospedado: [evidência de 02/10](../ARANDU_CURRENT_STATE_2026-10-02.md).

## O que não faz parte do baseline

Registrado como próxima fase, não implementado nesta rodada: Savings Ledger
(o painel não estima economia por decisão de produto),
inteligência de propostas e extração de PDF por IA, normalização automática,
AI Analyst, benchmarking, Open Finance, integrações ERP/bancárias, negociação
assistida e memorando de decisão gerado por IA. Limites conhecidos da demo em
[ARCHITECTURE.md](ARCHITECTURE.md#limites-conhecidos).
