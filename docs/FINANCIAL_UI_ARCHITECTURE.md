# Interface financeira

## Superfície

- Website: `/`, `/produto.html`, `/credito.html`, `/adquirencia.html`, `/seguranca.html`, `/limites.html`. São as seis rotas canônicas em `data/public-routes.json`.
- Acesso: `/login.html` e `/cadastro.html`, usando `/api/auth/*` existente. O login abre `/finance/index.html`; o usuário escolhe organização dentro do workspace.
- Comprador: `/finance/*`; provedor: `/provider/*`. Mantemos os deep links existentes para RFQ, proposta e convite. Nenhuma rota interna é indexável.
- Build: `vite.config.js` declara explicitamente 22 entradas HTML. `copy-runtime-assets.mjs` só copia identidade financeira e fixtures de demonstração quando o modo de apresentação permitido está ligado. Os demais arquivos históricos permanecem no repositório, mas não no `dist/`.

## Componentes e comportamento

`finance/style.css` contém tokens e componentes compartilhados por ambos os portais. Em desktop, a navegação é lateral; em tablet e telefone, torna-se uma faixa horizontal com rolagem. As tabelas de comparação dão lugar a cartões por proposta no telefone. `finance/app.js` usa as mesmas APIs, permissões e regras de comparação preexistentes; acrescenta rótulos de status, prioridades e filtros locais sem alterar o domínio.

O site usa `financial-public.css`, sem importar o CSS editorial de arte. A página de limites substitui o aviso jurídico repetido em cada tela operacional; os avisos contextuais de decisão, convite e cobertura permanecem onde necessários.

## Segurança de convites e e-mail

A migration do piloto recusa a criação de organização quando a allowlist está vazia. Um segredo aleatório mantido em `fin_settings`, acessível somente à função privilegiada, permite recompor o token de um convite ainda válido a partir de seu identificador. A outbox guarda apenas essa referência. O dispatcher chama a RPC como serviço, cria o link com fragmento e usa o renderer `finance_provider_invite`. Sem URL válida, token válido ou credenciais, o envio falha e volta para retry; nenhuma mensagem de convite sem link é enviada.

## Validação

`npm run build && npm run check:financial-surface && npm run check:dist-assets` verifica a superfície e os assets. `npm run check:finance` cobre domínio/API/smoke; `node scripts/test-email-outbox.mjs` cobre o renderer. `npm run test:database` exige PostgreSQL local. `npx playwright test tests/e2e/finance-procurement.spec.js` cobre desktop e celular quando os navegadores Playwright estão instalados.

## Reconciliação da base e aprofundamento incremental

A PR #67 foi incorporada à branch `work/arandu-first-financial-pilot-readiness` no merge `d23bbb5`, e não à `main`. O merge `603ffb5` tem como pais a `main` `1046af6` e esse commit. Como a única divergência posterior da `main` desde a base comum era `package.json` e `package-lock.json`, os scripts financeiros da #67 foram preservados com Vite 8.3.0 e Playwright 1.63.0 da `main`.

O comando `Ctrl/Cmd+K` abre busca local nos registros já recebidos da API para a organização ativa: solicitações, propostas, provedores, contratos e tarefas. A busca não consulta outra organização, não persiste termos e não emite analytics. O catálogo é limitado aos registros presentes no `overview`; não é busca paginada de todo o histórico. O painel expõe tarefas vencidas e RFQs com prazo em sete dias. A média de propostas por solicitação substitui a antiga “taxa de resposta”, que usava propostas/convites sem identificar convites respondidos e poderia induzir interpretação incorreta.

A lista de RFQs filtra por título, produto e status. O comprador pode pré-preencher uma nova demanda a partir de RFQ anterior da mesma organização. Somente produto, título, campos de demanda e prazo futuro são copiados na memória da página; a nova RFQ só nasce no POST explícito e convites, propostas e decisões não são copiados. A resposta do POST leva diretamente ao novo rascunho. A lista de provedores filtra por nome e região.

### Limites desta rodada

A busca não é server-side nem paginada; `overview` ainda limita a quantidade de registros. Não foram acrescentados approvals multinível, upload privado, autosave no servidor, notificações in-app ou console operacional. Nenhum desses fluxos deve ser anunciado como disponível. A inspeção visual manual do preview protegido e a validação com usuários de piloto continuam separadas dos testes automáticos.
