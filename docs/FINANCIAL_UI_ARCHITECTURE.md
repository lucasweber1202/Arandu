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
