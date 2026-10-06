# Operational validation — 2026-10-06

Base remoto: `07a059b9e3e5f1dcb4dc7bdcf5e2f52aede081b9` (#137 já merged).
Este registro acompanha a PR de fechamento operacional; o SHA final é o HEAD
da PR. Nenhuma PR foi mergeada nesta sessão. Nenhuma migration hospedada aplicada.

## Resultado e limites

| Ambiente | Maturity/evidence do release atual | Observação |
|---|---|---|
| Demo | M1/E1; observações hospedadas E3 parciais | deploy READY no SHA base; health 200; endpoint de personas 404; ainda sandbox legado |
| Pilot | M1/E1; canário E3 somente schema antigo | deploy READY preview, target não production; marker financial-surface-hardening-1 |
| Official | M1/E1 para código; release sem M5 | build ERROR BUILD_UTILS_SPAWN_1; ARANDU_ENV=production existe; banco PROD dedicado não comprovado |

M2 bloqueado: run #782 no SHA base e seu único rerun falharam nos quatro
jobs, sem steps executados expostos. Rulesets retornam 403 por plano e main
continua protected=false. M3/M4/M5/M6 não atingidos; não há E4/E5/E6.
E0 é documentação; E1 local; E2 CI não comprovado no release atual; E3
observações hospedadas parciais não equivalem à validação completa.

## Mudanças e validação local

- Doctor: 24 RPCs pós-contrato e 19 tabelas sensíveis adicionais. Probes
  inconclusivos e OpenAPI anônima ausente/malformada recusam GO.
- Release assessor v2: CI exato, 26 etapas autenticadas, 15 probes,
  observabilidade, triagem, suporte e rollback/forward-fix exercitados.
- Sidebar: omite workspace ausente, evitando texto literal null.
- check:all, testes negativos doctor/release, build, assets, audit e SBOM passam.
- Finance Chromium desktop/mobile: 209 passed, 7 skips preexistentes.
- Presentation: 121 passed, 19 skips; duas falhas de escrita de trace ENOENT.
  Os dois casos passaram no rerun isolado, sem alterar assertions/gates.
- Após rebuild da correção visual: capturas e portais desktop/mobile reexecutados.
- Firefox/WebKit/Mobile Safari: executáveis indisponíveis; instalação falhou.
  Não há claim dos cinco browsers verdes. Chromium local usa binário extraído,
  não é substituto do job presentation do CI.
- SQL/rehearsal atuais não executados: PostgreSQL local sem servidor e Docker
  ausente. Rehearsal #137 preservado; os 297 checks anteriores não reproduzidos.

## Migrations, doctor e recovery

Demo e Production: projetos Supabase dedicados não acessíveis. Pilot:
24 migrations pendentes, bundle SHA256
`fee0b5ba2a96da4e70333d8407b2b0aa7689a4b39cf0f115158ee84fdff8248d`.
Prefixo não destrutivo de 12 até data-governance, SHA256
`8e15a95bd1a95a5ef9dbdebd6107bc0f3bbf520e64ed9a8580fc23820f0084a0`;
12 posteriores adiadas. Backup e restore do mesmo backup em alvo descartável
antes de aplicar; export verificado e decisão específica do owner antes do
decommission legado. Nenhuma migration nova introduzida pela PR.

Doctor hospedado GO não obtido; configuração local incompleta resulta NO-GO.
Canário SQL exato do repositório passou no Pilot antigo com ROLLBACK, sem
persistir dados; não comprova capabilities pendentes. Preflight backup bloqueado
por PILOT_SOURCE_DATABASE_URL ausente. Restore hospedado não executado.
pilot:release:check permanece NO-GO por falta de evidência real.

## Hosted, matriz e próximo gate

Pilot e Official health redirecionam para proteção de deployment. Logs Vercel
e bypass connector retornam 403; causa específica do build oficial desconhecida.
Não houve jornada autenticada, QA visual hospedado ou exercício de incidente.
Pilot Production Branch main ainda não comprovado; CRON_SECRET oficial ausente.

Matriz atualizada: P0.1-03, P0.1-06, P0.10-02 e P1.4/PQ-01/PA-01/CO-01/PP-01/SI-01;
cabeçalho de CI/deploy/schema e definição M5 corrigidos. Nenhuma capability
nova ou aprofundamento Stage B: dependência normativa Stage A não fechada.

Próximo gate: quatro gates success no HEAD exato (M2), depois bancos isolados,
recovery prévio, migrations e doctor/canário por ambiente (M3), exercício e
jornada reais Pilot (M4), readiness dedicado Official (M5).

Ações humanas mínimas: regularizar Actions/plano rulesets; fornecer conexão
segura de dump/restore e alvo descartável; decidir export/decommission;
selecionar organização Supabase antes de consultar custo/criar Demo/Prod;
restaurar escopo Vercel para logs e configurar Production Branch Pilot.
