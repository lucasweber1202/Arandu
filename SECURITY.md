# Política de segurança

## Versões suportadas

Enquanto o Arandu estiver em pré-lançamento, somente a versão mais recente da branch `main` recebe correções de segurança.

## Como reportar uma vulnerabilidade

Não abra uma issue pública para vulnerabilidades, segredos expostos, bypass de autenticação, falhas de RLS ou exposição de dados pessoais.

Use o recurso **Report a vulnerability** na aba Security do repositório para iniciar um GitHub Security Advisory privado. Inclua, quando possível:

- componente ou rota afetada;
- impacto provável;
- passos mínimos de reprodução;
- conta ou papel utilizado, sem credenciais reais;
- comportamento esperado e observado;
- sugestão de mitigação;
- evidência sanitizada, sem PII ou segredos.

## Escopo prioritário

Recebem prioridade máxima:

- bypass de Supabase Auth, MFA ou RBAC;
- leitura ou escrita entre contas por falha de RLS;
- uso indevido de `service role`;
- reserva concorrente ou duplicada;
- manipulação de preço, comissão ou política comercial;
- upload de conteúdo executável ou acesso indevido a mídia;
- XSS, CSRF, SSRF, injeção ou execução remota;
- vazamento de dados pessoais, tokens ou strings de conexão;
- certificado público apresentado como válido sem confirmação oficial.

## Tratamento esperado

O mantenedor deve:

1. confirmar o recebimento;
2. classificar impacto e alcance;
3. preparar correção em branch privada ou restrita quando necessário;
4. adicionar teste de regressão;
5. revogar segredos comprometidos antes da divulgação;
6. publicar a correção e registrar o incidente de forma minimizada.

Não inclua dados pessoais, credenciais ou detalhes exploráveis em changelog público antes da mitigação.
