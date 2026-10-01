# Demonstração interativa do Arandu Financial Procurement (sandbox legado)

> **Não é mais a demonstração canônica.** A demo oficial é o produto real da
> `main` com `ARANDU_ENV=demo` e um Supabase DEMO semeado com a Vitta Foods
> ([`docs/demo/README.md`](demo/README.md)). Este sandbox (motor fictício no
> navegador, que reimplementa as regras do servidor) fica em operação só até o
> projeto `arandu-demo` migrar; depois será aposentado. Não acrescente
> funcionalidade aqui.

Esta página explica como a demonstração funciona, por que ela não enfraquece o
ambiente real e o que o responsável pelo projeto precisa configurar para
torná-la pública.

## O que é

`/demo` é um sandbox do produto inteiro que roda **só no navegador**, com dados
fictícios. Não pede cadastro, OTP, e-mail nem Supabase.

- **Entrada:** `/demo/index.html` → “Explorar como empresa” (ou outro papel).
- **Interface:** a demonstração usa a camada de experiência descrita em
  `docs/FINANCIAL_DEMO_EXPERIENCE.md` (indicador `● DEMO`, preferências,
  painel personalizável, quick view). A aplicação oficial não a carrega.
- **Personas** (topbar, “Visualizando como”):
  - Comprador — Marina Costa, Gerente Financeira, Acme Indústria Ltda. — DEMO (`finance_manager`)
  - Aprovador — Ricardo Alves, CFO (`viewer`, aprova quando é a vez dele)
  - Provedor — Camila Rocha, Atlas Bank — DEMO (`provider_user`)
  - Admin — Helena Prado, Controller (`admin`, altera a política de aprovação)
- **Estado inicial:** RFQs em rascunho, abertas, em coleta, em avaliação (com
  aprovação na etapa 2 de 2), decididas e contratadas; “Capital de giro —
  R$ 3 milhões” na revisão 3 com propostas que responderam às revisões 2 e 3;
  “Revisão de adquirência — R$ 8 milhões/mês” com MDR, PIX, antecipação e
  liquidação; contrato em janela de renovação, tarefas, menções e notificações.

## Arquitetura

```
finance/app.js ── ctx.api(path, options)
                      │
       ┌──────────────┴──────────────┐
 httpTransport                 DemoEngine (finance/demo/engine.js)
 /api/finance/* + sessão       mesmo contrato de rotas, em memória +
 + RLS no Postgres             localStorage["arandu_demo_state_v1"]
```

As telas não sabem qual transporte está por trás. O modo é decidido por dois
fatos que o visitante não controla:

1. **Build:** a constante `__ARANDU_DEMO__` é injetada pelo Vite a partir de
   `lib/demo-mode.mjs`. Em produção financeira ela é `false`; o motor e as
   páginas `/demo` nem entram no pacote (`scripts/test-demo-mode.mjs --dist`).
2. **Página:** só as cascas em `/demo/...` têm `data-mode="demo"`. As cascas
   de `/finance` e `/provider` sempre usam o transporte HTTP real.

Não há parâmetro de URL, cabeçalho, cookie ou chave de `localStorage` que ligue
a demonstração em uma página real.

O motor reaproveita `lib/finance/products.mjs`, `workflow.mjs` e
`comparison.mjs` — as mesmas regras de normalização, máquina de estados e
comparação do servidor — e reproduz as regras das funções SQL (papéis,
aprovação sequencial, aprovação desatualizada, decisão única, contrato único,
convite de uso único, linhagem proposta → revisão da RFQ, marcos de renovação
idempotentes).

## Persistência e reset

- Chave única: `arandu_demo_state_v1`, com `schema` e `seed`. Estado inválido,
  adulterado ou de outra versão é descartado e o conjunto inicial volta (a
  interface avisa).
- Sobrevive a recarregar, voltar e avançar. Duas abas compartilham o estado, o
  que deixa o conflito de rascunho entre abas reproduzível.
- “Restaurar demonstração” (`● DEMO` na topbar, Ctrl+K ou página de entrada)
  restaura dados, aparência/layout ou tudo, com confirmação. Preferências de
  tela ficam em `arandu-demo-workspace`, separadas do estado fictício.
- Em Configurações → Demonstração é possível simular uma falha de rede na
  próxima gravação para ver os estados de erro e “Tentar novamente”.

O autosave **real** continua no servidor (`rfq-editor`, `proposal-draft`). O
navegador não guarda rascunho real — os testes E2E verificam isso.

## Modelo de ameaças

| Ameaça | Controle | Evidência |
| --- | --- | --- |
| Ligar a demo em produção | `assertDemoModeIsSafe` falha o build; `VERCEL_ENV=production` sempre desliga | `test-demo-mode.mjs`, job `deploy-boundaries` |
| Demo publicada com credencial real | build independente (`ARANDU_DEPLOYMENT_KIND=demo`) recusa `SUPABASE_*`, `RESEND_API_KEY`, segredos de cron | `test-demo-mode.mjs` |
| URL manipulada (`?demo=1`) | modo vem do build + casca, nunca da URL | `test-demo-mode.mjs`, E2E “/demo não existe” |
| `localStorage` adulterado | validação de schema; tudo renderizado com `textContent` | E2E “estado adulterado” |
| XSS em campo editável | nenhum `innerHTML` com dado; comentários recusam `<` e `>` | E2E XSS, `test-demo-engine.mjs` |
| Troca de persona = privilégio real | persona só muda o usuário fictício do motor; nenhum cookie/token é criado | E2E “persona muda superfície, não credencial” |
| Demo chamando API real / Supabase | motor sem `fetch`; E2E falha se qualquer requisição sair para `/api/` ou terceiros | `test-demo-engine.mjs`, E2E |
| Dado fictício em analytics | páginas `/demo` não carregam Speed Insights; `signals` é no-op | `test-demo-mode.mjs --dist --expect-demo` |
| Confundir demo com produção | faixa permanente “Ambiente demonstrativo”, sufixo “— DEMO”, e-mails `.invalid`, CNPJ zerado | E2E, `test-demo-mode.mjs` |

## Vercel: por que a URL de preview ainda pede login

> Passo a passo canônico do projeto `arandu-demo` e verificação por `curl`:
> [`FINANCIAL_DEPLOYMENT_WORKFLOW.md`](FINANCIAL_DEPLOYMENT_WORKFLOW.md#demo).

O bloqueio observado **não é** a autenticação do Arandu. Em 26/09/2026 todas as
URLs do projeto `arandu` (`…-lucas-projects467.vercel.app`) respondiam
`302 → https://vercel.com/sso-api?...` antes de qualquer código do Arandu rodar:
é a **Vercel Deployment Protection (Vercel Authentication)**. Código de
frontend não consegue removê-la.

Opções, da mais recomendada para a menos:

1. **Projeto de demonstração separado (recomendado).**
   Vercel → Add New → Project → importar `lucasweber1202/Arandu` com o nome
   `arandu-demo` → Settings → Environment Variables: **só**
   `ARANDU_DEPLOYMENT_KIND=demo` (o `vercel.json` sobrepõe o Build Command do
   painel; a variável é o que liga o `build:demo`, e o build falha se houver
   `SUPABASE_*`, `RESEND_API_KEY`, segredos de cron ou `ARANDU_ENV`) →
   Settings → Deployment Protection → **Vercel Authentication: Disabled**.
   O domínio de produção desse projeto (`arandu-demo.vercel.app` ou similar)
   fica público e abre a demonstração na raiz; toda a API nele responde 404.
2. **Liberar os previews do projeto atual.** Vercel → Project `arandu` →
   Settings → Deployment Protection → Vercel Authentication → trocar de
   “Standard Protection” para **Disabled** (ou “Only Production Deployments”,
   quando disponível no plano). Os previews passam a abrir `/demo` sem login;
   o portal real continua exigindo login do Arandu.
3. **Link compartilhável de um deploy.** Vercel → Deployments → abrir o
   deploy desta PR → Share → gerar link. Não muda a configuração do projeto.

## Operação relacionada

- `docs/supabase-financial-delivery.sql`: respostas em comentários, e-mail de
  aviso por preferência (sem conteúdo do processo, 20/h por destinatário,
  desligado enquanto `fin_settings.email_enabled <> 'true'`) e
  `fin_run_renewal_schedule` (90/60/30 dias e aviso prévio, idempotente).
- `/api/jobs/renewals` roda diariamente (`vercel.json`), exige `CRON_SECRET`
  com 32+ caracteres e só então usa o service role.
