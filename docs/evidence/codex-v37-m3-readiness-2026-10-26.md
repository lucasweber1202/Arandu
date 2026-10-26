# M3 v3.7 — diagnóstico e correção verificável

Observação: 26/10/2026. Base comum das duas worktrees:
`e987a1472d81a4a3476eede07c6a24853a2bb619`.
Branch M3: `codex/v37-m3-readiness`. PR/commit: consultar o HEAD desta branch.
Trilha independente: o ciclo novo de decisão externa NÃO está integrado nesta
base nem é requisito implícito desta PR. Nenhum merge ou deploy manual.

## Resultado técnico

Reproduzido antes da implementação: `test-consolidation.mjs` recebeu export sem
fingerprint e retornou PREPARED quando o teste exigia BLOCKED. O mesmo contrato
faltava no candidato e no Pilot. Correção compartilhada exclusivamente pelos
avaliadores: versão compatível, MATCH e hashes do schema da origem/restauração
iguais ao snapshot do mesmo export. Não altera o cálculo do fingerprint nem
operação de recovery. Contrato em `../M3_RECOVERY_EVIDENCE_CONTRACT.md`.

39 mutações negativas novas de schema nos avaliadores, mais exercício real da
CLI com hash de destino divergente. Fixtures são sintéticas e não comprovam
preservação hospedada. A composição do doctor ganhou ação e owner para o gate.

## Observações remotas novas, somente leitura

| Fonte/componente | Observação | Classificação e limite |
| --- | --- | --- |
| GitHub main | e987a147; database, deploy-boundaries, validate, presentation SUCCESS no SHA exato | PASS para CI da base; não vale pelo HEAD desta PR |
| GitHub status Vercel Demo/Pilot | success / deployment completed na base | PASS para status publicado pelo integrador; estado READY administrativo não relido |
| GitHub status Vercel arandu | failure; deployment dpl_Gxf6EUHobJBLbCDhj2VNyxddQbTy | FAIL para o status de deploy; causa INCONCLUSIVE |
| Vercel GET /v7/deployments | 403 no scope lucas-projects467 | ACCESS_BLOCKED; não prova defeito do serviço nem causa do build |
| Supabase list_projects Pilot | offgpyysgdhfemjlchod, INACTIVE, PG17 | Diverge da fotografia histórica ACTIVE_HEALTHY; motivo INCONCLUSIVE; não reativado |
| Supabase list_projects legado | igacnfjeuqhxcmfyepgj, ACTIVE_HEALTHY, PG17 | Saúde administrativa não comprova aplicação financeira |
| Catálogo legado, SELECT | fin_settings ausente; zero rotinas public.fin_% | FAIL para pré-requisito do schema financeiro; sem leitura de conteúdo de negócio |
| Topologia da base | ACTIVE_SUPABASE_ASSIGNMENTS.demo e production vazias | BLOCKED para operação canônica; refs planejados ainda Pilot/legacy |
| HTTP público/Auth/Storage/Pilot SQL | não sondados nesta rodada | NOT_RUN; não inferir schema nem identidade da aplicação pelo status GitHub |
| Preservação/restore real | não executados nem comprovados nesta rodada | NOT_RUN; nenhum backup, download sensível ou restore hospedado |

Fontes: GitHub commit/check-runs/status em lucasweber1202/Arandu; Vercel
list_deployments no scope documentado; Supabase list_projects e SELECT limitado
a information_schema no projeto legado. Nenhum segredo ou registro real foi
extraído. O conector Supabase foi usado conforme a skill Supabase; a skill de
ambiente cloud orientou o diagnóstico do executor.

## Matriz operacional para a próxima janela

| ID/componente | Evidência → efeito | Pré-requisito e ação humana mínima | Teste posterior | Risco e rollback |
| --- | --- | --- | --- | --- |
| M3-01 Vercel | 403 → configuração/logs não observáveis | Owner libera leitura no scope existente; ler primeira falha do deployment identificado | Repetir leitura e vincular causa ao SHA | Não alterar projeto para contornar acesso; sem mutação para reverter |
| M3-02 Pilot | INACTIVE → destino de conversão não demonstrado disponível | Owner esclarece estado e autoriza eventual retomada, separadamente da conversão | list_projects, marker e catálogo read-only após acesso | Não reativar/destruir por inferência; preservar projeto |
| M3-03 classificação | inventários históricos não atuais → descarte proibido | Responsável classifica dados/retention/holds e autoriza inventário exato sanitizado | Digest e frescor no consolidation:check | PII pode existir sem Auth users; nenhum reset |
| M3-04 preservação | export/restore não comprovados → conversão bloqueada | Autorizar origem, escopo, destino privado durável, custódio/chave, retenção e executor isolado | Export cifrado íntegro + restore do mesmo export; linhas e schema MATCH; Auth/Storage/configuração separados | Ciphertext não prova restore; preservar artefatos, forward-fix ou ensaio novo autorizado |
| M3-05 schema | legado sem fin_settings; Pilot não sondado → compatibilidade não provada | Após recovery, aprovar janela de instalação/bundle integral gerado da main revisada | Marker final, RPCs, grants/RLS e cache PostgREST | Revert de código não reverte schema; rollback SQL só pré-uso ou forward-fix |
| M3-06 identidade | atribuições ativas vazias → build/readiness canônicos bloqueados | Só após conversão comprovada, PR de cutover e configuração exclusiva por ambiente | doctor com SHA, readiness, datasource e ref corretos | Não misturar segredos/bancos; retorno a deployment compatível sob autorização |
| M3-07 jornada | canário/seed/jornadas não executados → M3/M4 não comprovados | Autorizar somente escrita sintética no candidato correto; depois alias/cutover em aprovação separada | Auth, Storage privado, RLS, canário, buyer/provider desktop/mobile, releitura/auditoria | Pausar escritas se isolamento incerto; sem seed/reset global improvisado |

Sequência: acesso → inventário/classificação → preservação autorizada → restore
e reconciliação → revisão do bundle/compatibilidade → autorização de conversão
→ instalação/configuração exclusiva → candidato e provas → autorização de
cutover. Production e retirada do Pilot exigem decisões posteriores próprias.
Nenhuma sequência daqui constitui autorização.

## Validação local desta alteração

PASS: instalação exata via npm ci --include=optional; build; check:all completo;
check:security; check:governance; audit:ci (zero vulnerabilidades); check:links;
deploy:check; test-consolidation, test-release-candidate, test-pilot-release e
test-hosted-infrastructure-doctor. deploy:check usou ARANDU_SITE_URL sintética
https://arandu.example.com, igual ao CI, somente no processo local. Tentativas
sem domínio próprio e com .vercel.app foram recusadas pelo gate de SEO; não
houve alteração desse gate. A listagem de 1470 testes do Playwright NÃO é
execução de navegador. Navegador e banco não são exigidos por este delta de
avaliação, que não altera SQL, API ou UI; jornadas hospedadas NOT_RUN. O primeiro
check:all revelou a integração faltante do novo nome no doctor; corrigida e
suíte completa reexecutada. Falha inicial do novo negativo foi intencional e
reproduziu a lacuna da base. CI desta branch deve ser observado no HEAD próprio.

Não houve migration, canário hospedado, seed/reset, mudança de assignment,
variável, credencial, DNS, billing, proteção ou projeto remoto. READY/HTTP200/CI
não foram usados para declarar M3. Resultado: preparação local melhorada;
CANONICAL_HOSTED_M3 continua BLOCKED/NOT_PROVEN.
