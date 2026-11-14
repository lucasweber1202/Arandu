# Arandu 10 — evidência local (em consolidação)

Base verificada: main@cd608cb4ce804b4ede88064230ef97948b7beb78.
Nenhum ambiente hospedado foi alterado. Frontend reservado ao Claude preservado.

Já executados com sucesso nesta implementação:
- `npm ci --include=optional` pelo lockfile, cache temporário.
- `npm run check:all` (acesso de escrita ao home necessário para testes históricos de recovery).
- `npm run build` e `npm run check:build-size` (mesmo aviso de capacidade herdado da base).
- `npm run test:e2e:list` (listagem; não equivale a executar os browsers).
- `scripts/test-arandu-10.mjs`, `scripts/test-finance-api.mjs`, governança e bundles.
- SQL novo em PostgreSQL 17.12: CRUD/replay/histórico/refresh/archive/RLS e aprovações.
- Concorrência SQL em sessões independentes: versão otimista, oito creates idênticos,
  revogação de papel durante espera por trava.

Jornada HTTP/Auth/RLS real local: **40 verificações PASS**, incluindo concorrência HTTP,
leitura/negação por viewer, instituição, outro tenant e anônimo, escrita REST direta
recusada, replay, histórico, refresh, cobertura e RFQ de renovação idempotente.
Em andamento: suíte integral `test:database`.
A tentativa de stack completa Supabase encontrou falta de espaço no Docker ao
extrair sua imagem Postgres. Alternativa local: PostgreSQL 17, GoTrue 2.181.0 e
PostgREST 12.2.9, com credenciais efêmeras e dados sintéticos. Storage e browser
não são necessários para a nova jornada backend; não serão declarados validados
por estes testes. Resultados finais e limitações serão consolidados antes da PR.
