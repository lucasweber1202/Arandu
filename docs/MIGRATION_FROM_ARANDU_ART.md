# Preservação da Arte

O commit inicial da Arte é `76c50bfe87414041843fd4c052ad85d51d0dd631`. A branch do pivot só adiciona banco e rotas B2B. Migrations existentes executam primeiro e a B2B ao final em `docs/supabase-migrations.json`. Backups e dry-run existentes continuam exigidos no ambiente real. Não carregue leads ou certificados de Arte para novos tenants por correspondência de nome; isso mudaria finalidade de tratamento de dados.

Para testar em clone limpo: `npm ci --include=optional`, configurar `.env.example`, `npm run check:migrations`, usar PostgreSQL 16 com `npm run test:database`, `npm run dev`; configurar Supabase Auth e aplicar migrations no staging conforme runbook de release antes de testar `/b2b/`. Criar duas contas e duas organizações fictícias, uma compradora e outra fornecedora.
