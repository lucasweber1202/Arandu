# O que depende do proprietário

> Checklist única e atualizada, com estado por item: [`FINANCIAL_PILOT_GO_LIVE.md`](FINANCIAL_PILOT_GO_LIVE.md).

Lista curta e fechada. **Só entra aqui o que é impossível resolver por código.**
Tudo que era implementável foi implementado.

---

## 1. Revisão jurídica — bloqueia o piloto

Os 14 itens de [`FINANCIAL_LEGAL_REVIEW_REQUIRED.md`](FINANCIAL_LEGAL_REVIEW_REQUIRED.md)
precisam de parecer humano. Os mais próximos do piloto:

* enquadramento da atividade de procurement financeiro;
* o que o provedor passa a ver da demanda ao aceitar um convite;
* comunicação por e-mail com instituições financeiras;
* texto dos termos de uso — **hoje não existe texto**, só o registro de qual
  versão foi aceita.

O software registra o aceite e diz na tela que o texto não foi revisado. Ele
não trata isso como aceite legal válido, e não deve passar a tratar sem parecer.

## 2. Proteção da branch `main`

A API recusa a configuração a partir desta integração, nas duas tentativas:

```
GET /repos/lucasweber1202/Arandu/branches/main/protection
403 — "Resource not accessible by integration"
```

Os toggles exatos estão em [`FINANCIAL_REPO_GOVERNANCE.md`](FINANCIAL_REPO_GOVERNANCE.md).
O que mais falta é **Require status checks** com `validate`, `database` e
`deploy-boundaries`: as PRs #64 e #65 foram mescladas com o `validate` ainda em
execução. Nas duas vezes deu certo — mas isso é sorte observada duas vezes, não
um controle.

## 3. Ambiente do piloto

* criar um projeto **Supabase dedicado**, separado de produção e de preview;
* aplicar as 33 migrations de `docs/supabase-migrations.json` (`cleanInstall`), na ordem;
* definir `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (só servidor), `CRON_SECRET` (32+), `ARANDU_SITE_URL` e `ARANDU_ENV=pilot`;
* escolher e apontar um subdomínio — **nenhum domínio foi comprado ou
  registrado**;
* rodar `ARANDU_ENV=pilot npm run finance:env:check` e resolver o que ele apontar.

Detalhes em [`FINANCIAL_PILOT_ENVIRONMENT.md`](FINANCIAL_PILOT_ENVIRONMENT.md).

## 4. Backup e restore

Existe procedimento documentado. **Nenhum restore foi testado**, e sem teste não
existe RTO — só hipótese. Testar em banco vazio e registrar o tempo é ação de
quem tem acesso ao projeto Supabase.

## 5. E-mail transacional

O caminho de enfileiramento existe, é testado e nasce desligado. Para ligar:

* contratar/configurar provedor de e-mail e colocar a credencial no ambiente;
* verificar o domínio de envio (SPF/DKIM) — sem isso, convite para banco cai em
  spam;
* ligar a chave: `update public.fin_settings set value = 'true' where key = 'email_enabled';`

Enquanto estiver desligado, o convite é entregue manualmente, e o produto diz
isso em vez de fingir que enviou.

## 6. Escolher quem entra no piloto

* uma empresa compradora, com responsável financeiro disposto a usar de verdade;
* dois ou três provedores dispostos a responder;
* preencher [`FIRST_FINANCIAL_PILOT.md`](FIRST_FINANCIAL_PILOT.md);
* cadastrar os e-mails em `fin_pilot_allowlist` — enquanto a tabela estiver
  vazia, **ninguém** consegue criar organização (falha fechada).

## 7. Acordos comerciais

Nenhum contrato com empresa ou provedor existe. O que o Arandu cobra, se cobra,
e em que condições o provedor participa são decisões de negócio — e qualquer
modelo ligado a sucesso na contratação volta para o item 1.

## 8. Dependabot

[#60](https://github.com/lucasweber1202/Arandu/pull/60) (vite 8.2.2 → 8.3.0) e
[#61](https://github.com/lucasweber1202/Arandu/pull/61) (@playwright/test
1.62.1 → 1.63.0). As duas branches foram atualizadas contra a `main` atual nesta
rodada para que o CI delas rode contra o código de hoje. **Mesclar é decisão de
quem tem permissão**, e deve ser feito separado desta PR, para que uma eventual
regressão tenha causa identificável.

---

## O que NÃO está nesta lista

Porque foi implementado nesta rodada: checker de ambiente, smoke test de piloto,
seed removível, allowlist, registro de aceite, eventos de produto, métricas
operacionais, exportação do processo, criação de organização pela interface,
checklist de onboarding, estados do provedor, suporte documentado e a correção
do vazamento de token.
