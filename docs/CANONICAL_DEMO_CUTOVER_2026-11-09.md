# Arandu — Demo canônica: pré-cutover (09/11/2026)

Origem: main@8219c64348952f62d5826b59681846089d2a4c65. O Supabase Pilot (offgpyysgdhfemjlchod) foi atualizado com 51 migrations e é o destino **planejado** da Demo. O legado (igacnfjeuqhxcmfyepgj) recebeu 86 migrations e é o destino **planejado** da produção. Os dois estão ACTIVE_HEALTHY e no schema financeiro financial-contract-email-links-1. Ambos têm 122 tabelas fin_*, 385 funções fin_*, 114 políticas RLS, zero tabelas fin_* sem RLS e os 201 nomes de RPC exigidos pelo doctor. Nenhum usuário Auth ou organização registrada. Bucket fin-documents privado.

Dados do marketplace aposentado e descartados com autorização. Configurações email_enabled/invite_secret e quatro jobs históricos preservados no Pilot; não há prova de backup e restauração externos. Checks de catálogo não equivalem a validação de API/Auth/RLS hospedada.

## Sequência obrigatória

1. **Manter o sandbox atual** no Vercel arandu-demo. O projeto ainda usa ARANDU_DEPLOYMENT_KIND=demo e não está conectado ao banco real. Não alterar domínio, alias nem remove-lo antes do ensaio.
2. **Segredos no Vercel Demo**: configurar no painel arandu-demo as chaves do ref offgpyysgdhfemjlchod (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) e segredos próprios CRON_SECRET e ARANDU_DEMO_PASSWORD. Também ARANDU_ENV=demo e ARANDU_SITE_URL=https://arandu-demo.vercel.app. O conector atual não disponibiliza os valores das variáveis sensíveis que existem no antigo Vercel arandu-pilot. Não transferir secrets pelo chat ou Git.
3. **PR de ativação isolado**: mover offgpyysgdhfemjlchod de ACTIVE_SUPABASE_ASSIGNMENTS.pilot para .demo. Nunca manter ambos. A validação fail-closed de colisão e o teste de transição desta PR impedem dupla atribuição. A produção continua sem ativação.
4. **Seed na máquina confiável, nunca no build**: usar ARANDU_ENV=demo, ARANDU_DEMO_CONFIRM=offgpyysgdhfemjlchod, URL da Demo validada e credenciais só no ambiente seguro. Executar npm run demo:seed, npm run demo:check, provisionar visitantes com npm run demo:workspaces. O seed é responsável pelo marker deployment_environment=demo. Não criar marker manualmente.
5. **Release evidence real**: exigir doctor com SHA exato, CI, Auth, RLS, documentos, cron, isolamento entre organizações/providers, E2E desktop/mobile, canary e release:candidate:check GO. Publicar no alias público somente após teste.
6. **Produção separada**: não configurar arandu Vercel com secrets Demo, não promover produção, não criar recursos pagos e não remover arandu-pilot antes da prova de dependências zero.

## Alcance desta PR

Atualiza os status de planejamento para refletir os schemas alinhados e insere testes de ownership para a futura transição, **sem alterar ACTIVE_SUPABASE_ASSIGNMENTS**, o banco, a Vercel, o seed ou a URL pública. O cutover continua bloqueado por segredo de servidor inacessível ao conector, ausência de seed e testes hospedados e recovery não comprovado. Não fabricar provas de release.


## Estado das chaves e compatibilidade (atualizado na mesma PR)

O operador confirmou que cadastrou as variáveis `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no Vercel `arandu-demo`, usando chaves novas `sb_publishable_` e `sb_secret_`, com nome amigável `arandudemoserver` no Supabase. Esse nome é livre. O segredo `default` foi divulgado e deve ser revogado pelo operador; a revogação ainda não está comprovada. **Nunca reproduzir valores de API key, nem em logs nem Git.** O conector Vercel confirma presença das variáveis, não seus valores.

Os clientes REST, Storage, rate limit, readiness, doctor e ferramentas de seed agora distinguem o cabeçalho `apikey: sb_...` de `Authorization: Bearer <JWT real de usuário>`. Chaves legadas JWT ainda usam Bearer para retrocompatibilidade. Chaves opacas não devem entrar no Authorization sem um JWT real de sessão.

**Atenção:** o último Redeploy executado pelo operador falhou por seis itens: falta das duas chaves/CRON_SECRET/senha Demo, classificação Pilot no repositório e modo sandbox ligado. As chaves foram acrescentadas depois desse deployment. A presença delas não resolve a atribuição GitHub nem os outros bloqueios. Não executar outro deploy enquanto `ARANDU_DEPLOYMENT_KIND=demo` conflitar com `ARANDU_ENV=demo`; não interromper o sandbox público.
