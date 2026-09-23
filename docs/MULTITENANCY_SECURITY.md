# Multitenancy e segurança

Fronteira: Supabase Auth validado no servidor → JWT do usuário encaminhado ao PostgREST → RLS `b2b_has_role` → FKs compostas. A chave service role não é usada pelo domínio B2B. A projeção pública é uma RPC com token UUID aleatório e lista fechada de campos; ausente e privado retornam o mesmo 404 na API. Não há permissões de tabelas para `anon`.

Propostas só podem ser criadas pelo fornecedor convidado para RFQ aberta da categoria correspondente. O comprador lê propostas dos convites de seus RFQs; outro fornecedor não recebe as propostas rivais. Dados de empresas sem membership não são listados. Revisão e publicação passam por transições com papel verificado no banco. Respostas HTTP carregam `no-store` para passaporte; logs não devem conter termos financeiros ou tokens.

`tests/database/b2b-platform.sql` testa isolamento de leitura e escrita, não publicação implícita, FK cruzada e convite de membro de uso único vinculado ao e-mail. Antes de piloto com dados reais, complete testes adicionais de acesso via API, auditoria de transições, expiração/revogação de passaportes, storage privado, política de retenção, proteção contra abuso distribuída e revisão jurídica de privacidade. O risco residual impede chamar este corte de pronto para produção com dados confidenciais reais.
