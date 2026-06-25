# Implementação de lançamento — 25/06/2026

Este documento consolida o estado do repositório Arandu e o que foi implementado nesta rodada para aproximar o site de um lançamento público controlado.

## Já existe no repositório

- Site público com páginas de compra, acervo, obras, artistas, empresas, confiança, narrativa, proposta curatorial, certificado e contato.
- Páginas dinâmicas para obra e artista usando base local e fallback para API.
- API consolidada em `api/[...path].js`, preservando a arquitetura adequada ao plano Hobby da Vercel.
- Health check em `api/health.js` e página de leitura em `status.html`.
- Schema Supabase em `docs/supabase-schema.sql` com artistas, obras, certificados, leads, submissões, briefs, reservas, propostas, tarefas e mídia.
- Scripts de validação: qualidade, links, produção, inventário, dados, backend, docs comerciais e build.
- Documentação operacional para lançamento, Supabase, domínio, redes sociais, prospecção, compra/reserva e primeiros 30 dias.

## Implementado nesta branch

### 1. Painel administrativo mínimo

Arquivos criados:

- `admin.html`
- `js/admin-dashboard.js`
- `css/arandu-admin.css`

O painel permite:

- inserir e salvar localmente o token administrativo;
- consultar resumo de métricas via `/api/dashboard`;
- consultar painéis via `/api/admin?panel=...`;
- acompanhar submissões, leads, obras, artistas, reservas, certificados, briefs, propostas e tarefas;
- atualizar status de registros;
- cadastrar rapidamente artista, obra, certificado e tarefa.

### 2. Health check mais útil para go-live

Arquivo alterado:

- `api/health.js`

Agora o diagnóstico também considera:

- `ARANDU_SITE_URL`;
- `ARANDU_WHATSAPP_NUMBER`;
- `ARANDU_CONTACT_EMAIL`;
- existência de ao menos um canal real de atendimento;
- lista de próximas ações críticas quando o ambiente ainda não está pronto.

### 3. Página de status mais completa

Arquivos alterados:

- `status.html`
- `js/status.js`
- `css/arandu-launch.css`

A página de status passa a diferenciar:

- infraestrutura técnica;
- contato real;
- domínio;
- API;
- pendências críticas de produção.

### 4. Submissão de artistas mais pronta para operação

Arquivo alterado:

- `para-artistas.html`

O formulário passou a coletar os dados mínimos para curadoria conseguir retornar e analisar o artista com menos retrabalho:

- nome artístico;
- nome completo;
- e-mail;
- WhatsApp;
- cidade/estado;
- linguagens;
- portfólio;
- Instagram/site;
- faixa de preço;
- quantidade de obras disponíveis;
- contexto da trajetória.

### 5. Reserva de obra mais segura

Arquivo alterado:

- `js/reservation.js`

A reserva agora exige nome e WhatsApp antes de salvar ou abrir WhatsApp. A mensagem também deixa claro que a reserva registra interesse, mas não confirma pagamento automaticamente.

## O que ainda depende de ação externa ao código

Esses pontos não podem ser resolvidos apenas no repositório:

- criar/configurar o projeto Supabase real;
- rodar `docs/supabase-schema.sql` no Supabase;
- configurar as variáveis de ambiente na Vercel;
- definir o domínio oficial e apontá-lo para a Vercel;
- adicionar a logo final em `assets/logo-arandu.png`;
- configurar WhatsApp ou e-mail real de atendimento;
- substituir artistas e obras demonstrativos por artistas e obras reais autorizados;
- revisar política comercial, comissão, devolução, frete, dano e responsabilidade;
- preparar posts iniciais e abrir redes sociais.

## Prioridade de execução agora

1. Configurar Supabase real.
2. Configurar variáveis na Vercel.
3. Testar `/api/health` e `status.html`.
4. Abrir `admin.html` e validar leitura do painel com token.
5. Inserir artistas e obras reais.
6. Testar submissão de artista em `para-artistas.html`.
7. Testar reserva em `obra.html?id=...`.
8. Revisar textos comerciais e política.
9. Configurar domínio e contato real.
10. Começar prospecção controlada antes das redes sociais abertas.

## Critério prático para lançamento

O Arandu pode ser divulgado quando:

- `status.html` não mostrar pendência técnica crítica;
- `admin.html` conseguir ler e alterar dados reais;
- houver pelo menos 5 artistas reais e 20 obras reais autorizadas;
- as páginas de obra e artista não dependerem de dados fictícios;
- o comprador conseguir reservar e ser atendido;
- o artista conseguir submeter portfólio e ser acompanhado;
- política comercial, certificado e canal de atendimento estiverem claros.
