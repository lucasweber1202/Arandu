# Continuidade da Demo e ambientes — 06/10/2026

Base GitHub: `main@f67332943a1a2e04018a06fc1e151e352e68b3d0` (#136).
Branch: `feature/demo-presentation-closure`, baseada diretamente nessa main.
Nenhuma PR estava aberta na observação inicial; main não tinha commits após #136.
Código preparado para revisão; sem promoção de maturidade, merge ou release.

## Código

- Personas server-side, catálogo único com o seed, capability de runtime,
  marker e allowlist de alvo, autenticação real e cookie existente. Senha nunca
  retornada ao navegador; nomes via textContent. Não concede privilégios.
- Spend e Performance: nomes sob JWT/RLS, datas pt-BR, valores por moeda,
  traduções e fallback humano para referências ocultas. IDs permanecem em
  comandos e links. Fontes, métodos e histórico permanecem documentados.
- Portfolio e Fee Intelligence adicionados ao seed, USD estimado sem FX;
  observação de tarifa distinta do MDR, sem duplicação manual do aluguel.
- `pilot:upgrade:rehearse`: banco local aleatório descartável, baseline no
  marker escolhido, sequência até a fronteira destrutiva, recusa sem ack,
  ack somente da fixture sintética local, suites posteriores e canário.
  Nunca aceita conexão hospedada. Execução SQL ainda pendente.

## Validação

- npm ci --include=optional: exit 0.
- audit:ci: 0 vulnerabilidades; sbom:ci: 21 componentes.
- check:all: exit 0 na primeira revisão completa; revalidação final registrada
  na descrição da PR. Novos testes Node de personas e apresentação passaram.
- build, check:build-size, check:dist-assets: aprovados; números finais na PR.
- test:database: recusado por ausência de psql.
- demo:setup: falha por ausência de Docker. Sem reset/check/seed aplicado.
- Playwright install chromium: download falhou. Tentativa de suíte financeira
  desktop/mobile: 212 falhas de launch (executável ausente), nenhuma jornada
  executada. Firefox, WebKit e Mobile Safari também não disponíveis.
- Visual QA e E2E canônico pendentes. A evidência histórica 29/29 e 297 checks
  não comprova esta revisão. Rehearsal: recusa de URL externa testada; SQL
  bloqueado por ENOENT (psql). Nenhum canário novo executado.

## Hospedado observado e ação executada

Vercel: metadados resumidos por IDs disponíveis; logs e consultas no escopo
explícito `lucas-projects467` retornam 403. CLI ausente. O conector de atualização
não expõe Production Branch; não houve mudança de branch/alias.

| Projeto | Último deployment observado | Resultado |
| --- | --- | --- |
| arandu-demo | dpl_7uKuDA9db5SWcDM67MoyFcm9mhUH, main@f673329 | READY, Production; somente ARANDU_DEPLOYMENT_KIND configurado, continua sandbox |
| arandu-pilot | dpl_4SNDkjyc32gWqmpwyw4Us9c9e1jg, main@f673329 | READY, Preview, alias git-main; não comprova promoção do alias de staging |
| arandu | dpl_CVFdJUjVuA4fR1Hwp1ryja28MSrj, main@f673329 | ERROR, npm run vercel-build exit 1; ARANDU_ENV ausente na observação inicial |

**Alteração aplicada:** ARANDU_ENV=production somente no target Production de
arandu. Recurso criado `cWyxK2uRT1n0qHEm`. Sem redeploy. A ausência do seletor é
um blocker comprovado; logs 403 impedem afirmar que é a única causa. SUPABASE_URL
é sensitive e não foi descriptografado; não há prova de banco próprio de produção.

Supabase: apenas legado `igacnfjeuqhxcmfyepgj` e Pilot
`offgpyysgdhfemjlchod` listados; nenhum Demo ou Production separado visível.
Pilot marker confirmado por SQL: financial-surface-hardening-1.
Security advisors: 30 findings INFO de RLS sem policy e 43 WARN de funções
SECURITY DEFINER executáveis por authenticated; inventário não equivale a
vulnerabilidade provada nem a validação das 24 migrations posteriores.

## Rollout preparado, não aplicado

24 migrations pendentes até financial-opportunity-discriminator-1.
12 no prefixo antes de docs/supabase-financial-legacy-art-decommission.sql,
terminando em financial-data-governance-1. Geração determinística:

```bash
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql
npm run pilot:upgrade:rehearse -- --after-schema=financial-surface-hardening-1
```

Prefixo SHA-256: 8e15a95bd1a95a5ef9dbdebd6107bc0f3bbf520e64ed9a8580fc23820f0084a0.
Completo SHA-256: fee0b5ba2a96da4e70333d8407b2b0aa7689a4b39cf0f115158ee84fdff8248d.
Nada aplicado: rehearsal, backup/restore, export e decisão do owner ainda não
comprovados. A barreira não é só o decommission: recovery precede o prefixo.

CI #780 / 37476256210: quatro jobs failure, runner_id=0, zero steps,
2–3 segundos. Gates preservados. Nenhum merge permitido nesse estado.

## Próximos desbloqueios concretos

1. Executor com PostgreSQL/psql, Docker e browsers para SQL, seed, E2E e QA.
2. Vercel: acesso ao escopo/logs/Git; Production Branch do Pilot em main,
   promover somente após rollout validado; validar aliases do Oficial.
3. Demo e Production Supabase próprios. Criação exige escolha explícita da
   organização e confirmação de custo pelo fluxo Supabase; não foram criados.
4. Pilot: backup/restore e evidência de export/decisão do owner antes do rollout.
5. Actions: restabelecer runners/billing; quatro gates no HEAD exato antes do merge.
