# Decisoes de arquitetura

## ADR 001 - Comecar leve

A primeira versao propria da Arandu deve priorizar velocidade, clareza e validacao. Por isso, a base atual usa Vite e TypeScript para um MVP simples.

## ADR 002 - Produto antes de marketplace

A Arandu deve validar primeiro a experiencia curatorial. Checkout, pagamento e login ficam para fases posteriores.

## ADR 003 - Dados mockados antes do banco

Obras, artistas e colecoes podem ser modelados primeiro como conteudo local. Isso permite testar experiencia e discurso antes de criar operacao complexa.

## ADR 004 - Supabase como caminho futuro

O Supabase foi escolhido como referencia inicial para persistencia por ser rapido para tabelas, formularios, leads e painel futuro.

## ADR 005 - Curadoria por contexto como diferencial

A rota ou secao Encontre arte para deve ser tratada como nucleo do produto. Ela diferencia a Arandu de uma vitrine comum.
