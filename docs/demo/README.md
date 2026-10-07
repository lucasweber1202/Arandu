# Arandu Financial Procurement — Demo Baseline

> Topologia vigente (07/10/2026): Demo e Production permanentes; Pilot é etapa
> de validação. Nomes pilot:*/pilot-local são compatibilidade de ferramentas.
> Conversão dos slots somente após os gates de TWO_ENVIRONMENT_CONSOLIDATION.md;
> não reinterpretar referências históricas como autorização de reset ou terceiro banco.


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

O comando termina com 32 checagens de sanidade quando CRON_SECRET está configurado e a lista de personas. Abra
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

## Financial Passport v2 e pós-contrato

A demo é a `main` canônica: inclui o Passport (proveniência, confirmação,
frescor, histórico append-only, fotografia imutável na RFQ) e o pós-contrato
semeado pela API real — implantação com bloqueio, covenants (conforme, sem
dados, waiver aprovado), performance com revisão independente, spend por
moeda/tipo com reconciliação, qualificação do Atlas com evidência de serviço
externo, cédula lida com fatos confirmados e oportunidades pelas regras da
empresa. Tudo fictício (`*.example`, documentos com aviso de documento
fictício). Validado localmente com `npm run demo:setup`/`demo:local:reset`
(checagens de sanidade no fim do seed). A demo pública passa a mostrar isso
quando o projeto `arandu-demo` usar `ARANDU_ENV=demo` com o Supabase DEMO
([FINANCIAL_DEPLOYMENT_WORKFLOW.md](../FINANCIAL_DEPLOYMENT_WORKFLOW.md#vercel)).

## O que não faz parte do baseline

Registrado como próxima fase, não implementado nesta rodada: Savings Ledger
(o painel não estima economia por decisão de produto),
extração por modelo de IA de terceiros (a demo usa só o leitor determinístico;
o runtime `demo` nunca envia documento a provedor externo), normalização automática,
AI Analyst, benchmarking, Open Finance, integrações ERP/bancárias, negociação
assistida e memorando de decisão gerado por IA. Limites conhecidos da demo em
[ARCHITECTURE.md](ARCHITECTURE.md#limites-conhecidos).

## Entrada por persona

A página compartilhada de login oferece personas quando
`GET /api/auth/demo-personas` expõe a capability do servidor. A senha fica
somente no servidor Demo (`ARANDU_DEMO_PASSWORD`, igual à usada no seed).
`POST /api/auth/demo-login` aceita exclusivamente uma chave do catálogo
`lib/finance/demo-personas.mjs`, usa a autenticação Supabase real e emite o
cookie seguro existente. Não aceita e-mail, senha ou papel arbitrário.

O servidor exige runtime canônico Demo, alvo local ou ref explicitamente
cadastrado em `DEMO_SUPABASE_REFS`, banco com marker `deployment_environment=demo`
e configuração de autenticação. Pilot, Oficial, sandbox e configuração ambígua
recusam a capability. Nunca configure essa senha em Preview/Pilot/Oficial.

O catálogo de pessoas é compartilhado com o seed. O teste de navegador cobre
nomes como texto e a indisponibilidade da capability; execução cross-browser
continua pendente no executor de 06/10/2026.

## Estado hospedado observado em 06/10/2026 após #138

O endereço público `arandu-demo.vercel.app` ainda executa sandbox legado,
embora seu deploy seja main@fcc68f91 READY. Persona entry e API financeira
canônicas retornam 404. Supabase Demo dedicado ainda não existe no acesso
atual. As capabilities descritas acima existem no código/dataset, mas não
foram vistas numa Demo canônica hospedada nesta rodada: M1/E1, não M3/E3.
Cutover preparado em [HOSTED_ALIGNMENT_2026-10-06.md](../HOSTED_ALIGNMENT_2026-10-06.md).

32 checks completos dependem do cron real de renovação/oportunidades; sem
CRON_SECRET só 30 checks e cobertura incompleta. Os 29 históricos não validam
as adições Portfolio/Fee/USD da #137.
