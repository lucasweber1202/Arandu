# Sprints 6 a 12 — hardening, operação e crescimento responsável

Esta etapa amplia a base dos Sprints 1–5 sem liberar produção artificialmente. Recursos dependentes de Supabase, domínio, dados reais ou decisão humana continuam bloqueados até existir evidência operacional.

## Sprint 6 — hardening de produção

- consultas públicas de catálogo, artistas, coleções e certificados usam exclusivamente `SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY` fica restrita a operações servidor/admin;
- rate limit compartilhado usa `consume_rate_limit` no Supabase e falha fechado na Vercel;
- tokens administrativos são comparados em tempo constante;
- upload confere a assinatura binária real de JPEG, PNG, WebP e GIF;
- reservas e propostas aceitam `Idempotency-Key` e repetem a resposta sem duplicar o registro;
- health check verifica a migration de plataforma.

## Sprint 7 — workflow editorial

- artistas e obras recebem estado editorial separado do estado comercial;
- aprovação/publicação exige checklist completo;
- transições inválidas são bloqueadas;
- cada decisão gera histórico e log de auditoria;
- `revisao-catalogo.html` acompanha prontidão e histórico;
- o release público continua dependendo do gate de 5 artistas e 20 obras comprovados.

## Sprint 8 — superfície e arquitetura

- somente 19 rotas são canônicas e indexáveis;
- aliases antigos permanecem como redirects permanentes;
- páginas operacionais, templates, piloto e legado recebem `noindex` no build;
- catálogo, artista, obra e coleção usam fontes dinâmicas únicas;
- o manifesto de rotas é a fonte de canonical, sitemap e robots.

Os arquivos históricos permanecem no repositório para não apagar conteúdo do usuário sem uma revisão editorial. Eles não fazem parte da superfície indexável; a remoção física pode ocorrer depois de aprovação explícita do inventário.

## Sprint 9 — testes de jornada

- contratos de API cobrem chave anônima, recuperação de senha, privacidade, consentimento e rate limit distribuído;
- Playwright cobre desktop e mobile para home, privacidade, catálogo bloqueado e cadastro;
- `npm run test:e2e:list` valida a suíte sem navegador;
- `npm run test:e2e` executa a jornada completa quando os browsers do Playwright estiverem instalados.

## Sprint 10 — desempenho e acessibilidade

- imagens recebem `decoding=async`, lazy loading fora do primeiro conteúdo e texto alternativo neutro quando ausente;
- links externos recebem `noopener noreferrer`;
- todas as páginas ganham link “Pular para o conteúdo”;
- o runtime respeita `Do Not Track`;
- CSS e JavaScript da plataforma são compartilhados pelo build.

## Sprint 11 — LGPD e operação

- recuperação de senha não revela se o e-mail existe;
- a conta oferece exportação JSON dos dados vinculados;
- solicitações de acesso, correção, portabilidade e exclusão são autenticadas, auditadas e acompanháveis;
- pedidos de exclusão não apagam dados automaticamente: entram em workflow para conferência de identidade, obrigações fiscais e retenção aplicável;
- consentimento essencial e analítico é versionado e revogável no navegador.

## Sprint 12 — conversão responsável

- eventos aceitos são enumerados e não recebem texto livre;
- métricas só são gravadas após consentimento analítico vigente;
- eventos cobrem busca, catálogo, obra, seleção, contato e reserva;
- IDs anônimos são UUIDs locais e podem ser ligados à conta apenas pelo servidor autenticado;
- nenhuma recomendação opaca ou perfil sensível foi introduzido.

## Aplicação e validação

```bash
npm run check:migrations
npm run check:platform
npm run check:platform:release
npm run test:e2e:list
npm run check:all
npm run build
```

Depois de aplicar `docs/supabase-sprint6-12-platform.sql`, configurar `ARANDU_DISTRIBUTED_RATE_LIMIT=true` e rodar `/api/health?probe=1`.

## Gates externos

- aplicar migrations no Supabase real;
- instalar browsers do Playwright no ambiente de CI;
- configurar domínio e contato LGPD;
- revisar o inventário antes de remover fisicamente páginas históricas;
- cadastrar, documentar e aprovar os artistas e obras reais;
- executar piloto, acessibilidade assistiva e QA visual em dispositivos físicos;
- configurar monitoramento externo, alertas e política de backup no provedor.
