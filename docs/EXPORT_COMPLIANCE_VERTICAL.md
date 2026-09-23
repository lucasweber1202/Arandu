# Export Compliance

Abra `/b2b/export.html` autenticado. Crie organização, produto, requisito e metadados de documento; associe o requisito ao produto e registre evidência. Para revisão positiva, informe um link HTTPS acessível ao revisor; metadados sem fonte não podem ser verificados. Um revisor autorizado marca documento verificado e evidência aceita. Gere passaporte privado e publique explicitamente. `/b2b/passport.html?token=...` consulta projeção pública de nome, SKU, fabricante, origem, versão e completude. Dados internos, hashes, documentos e composição não entram na resposta pública.

Completude = requisitos associados com evidência aceita e documento verificado/não expirado ÷ total de requisitos associados. Se não houver requisitos, 0%. É uma medida operacional de dados, não conclusão legal. `b2b_cbam_cases` guarda instalação, produto, período, metodologia e dados reportados com estado `PENDING_VERIFICATION`. O case liga documentos por chave composta da organização e um revisor pode registrar REVISADO apenas após existir documento verificado e vigente. Essa revisão não determina incidência nem calcula emissões.

Não publique passaportes reais com dados comercialmente sensíveis antes de revisão humana da whitelist. O campo `sha256` ainda é metadado informado pelo usuário; upload privado e hash calculado pelo servidor são trabalho posterior.
