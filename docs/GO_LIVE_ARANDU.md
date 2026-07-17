# Go-live Arandu — roteiro de lançamento real

Este roteiro define a passagem do Arandu de MVP técnico para operação pública.

## 1. Estado atual

O projeto já possui:

- site público com páginas de compra, acervo, artistas, confiança e operação;
- API consolidada para Vercel Hobby;
- health check em `/api/health`;
- página de diagnóstico em `status.html`;
- painel administrativo mínimo em `admin.html`;
- checklist visual em `lancamento.html` lendo `data/launch-checklist.json`;
- base demonstrativa com artistas, obras e certificados;
- schema Supabase para operação comercial;
- checks de qualidade, dados, links, backend, inventário e build;
- camada pública consolidada de prontidão de lançamento, com reforço de confiança, reserva acompanhada e orientação para artistas;
- painel administrativo com busca, filtro, exportação e detalhe operacional rápido.

## 2. O que precisa estar pronto antes de abrir publicamente

### Infraestrutura

- Deploy na Vercel concluído sem erro de limite de funções.
- Domínio real apontado para a Vercel.
- `SUPABASE_URL` configurada.
- `SUPABASE_ANON_KEY` configurada.
- `SUPABASE_SERVICE_ROLE_KEY` configurada.
- `ARANDU_ADMIN_TOKEN` configurado.
- `ARANDU_SITE_URL` configurado com o domínio final.
- `ARANDU_WHATSAPP_NUMBER` ou `ARANDU_CONTACT_EMAIL` configurado.
- `docs/supabase-sprint1-auth-ownership.sql` aplicado antes do deploy.
- `/api/health` respondendo.
- `status.html` mostrando Supabase, token, domínio e contato como configurados.
- `admin.html` lendo dados reais do Supabase com token administrativo.
- `lancamento.html` carregando o checklist mínimo.

### Marca

- Logo final em `assets/logo-arandu.png`.
- Favicon derivado da logo.
- Paleta final confirmada: vermelho pau-brasil, off-white, grafite e tons de apoio.
- Bio curta definida para Instagram e LinkedIn.
- Imagem de capa para compartilhamento.

### Catálogo real

- Pelo menos 5 artistas reais.
- Pelo menos 20 obras reais.
- Imagens autorizadas.
- Preço ou faixa de preço definido.
- Técnica, suporte, dimensões e ano preenchidos.
- Status real da obra: disponível, reservada, vendida ou não publicada.
- Texto curatorial curto por obra.
- Perfil curto do artista.
- Confirmação expressa de autorização de imagem e divulgação.

### Confiança e operação

- Política comercial revisada.
- Termo de parceria com artistas revisado.
- Fluxo de reserva definido.
- Prazo de reserva definido.
- Responsável por embalagem definido.
- Responsável por frete definido.
- Regra de devolução definida.
- Regra de dano no transporte definida.
- Modelo de certificado aprovado.
- Rotina definida para atualizar status no painel interno.
- Mensagens-padrão para comprador, artista e empresa.

### Mídias sociais

- 9 posts iniciais prontos.
- 3 artistas apresentados.
- 6 obras apresentadas.
- Destaques criados: Obras, Artistas, Certificado, Comprar, Para artistas.
- Link do site funcionando.
- WhatsApp real funcionando.

## 3. Ordem de execução recomendada

1. Criar o Supabase novo com schema, production e migration; em banco existente, aplicar primeiro `docs/supabase-sprint1-auth-ownership.sql` e depois executar novamente `docs/supabase-production.sql`.
2. Configurar as URLs de site e redirecionamento de e-mail no Supabase Auth.
3. Configurar variáveis de ambiente na Vercel.
4. Fazer deploy na Vercel.
5. Testar `/api/health` e `status.html`.
6. Rodar `npm run seed:supabase:dry`.
7. Rodar `npm run seed:supabase`.
8. Abrir `admin.html`, inserir o token e validar leitura dos painéis.
9. Testar criação de artista, obra, certificado e tarefa no painel.
10. Testar cadastro, confirmação de e-mail, login, seleção em dois dispositivos, reserva, Minha Conta e logout.
11. Abrir `lancamento.html` e conferir o checklist visual.
12. Inserir logo final e favicon.
13. Configurar WhatsApp ou e-mail real.
14. Trocar base demonstrativa por artistas e obras reais.
15. Revisar política comercial e termo de artista.
16. Preparar posts e abrir redes sociais.
17. Iniciar prospecção ativa de artistas.

## 4. Testes mínimos antes de divulgar

```bash
npm run check:quality
npm run check:security
npm run check:all
npm run build
```

Depois do deploy:

```text
/status.html
/admin.html
/lancamento.html
/api/health
/api/catalog
/api/artists
/api/certificates?code=ARANDU-TESTE
```

## 5. Critério para dizer que o Arandu pode ser divulgado

O Arandu pode ser divulgado quando:

- o site abre pelo domínio real;
- `/status.html` não mostra pendências técnicas críticas;
- `admin.html` consegue ler e alterar dados reais;
- `lancamento.html` carrega o checklist sem erro;
- há obras reais suficientes para o comprador navegar;
- ao menos um canal de contato real funciona;
- a política comercial não está indefinida;
- o comprador entende como reservar ou demonstrar interesse;
- o artista entende como enviar portfólio;
- a marca visual está consistente.

## 6. Próximo bloco de implementação recomendado

Depois desta rodada, o próximo bloco deve focar em operação real, não em mais páginas:

1. transformar registros do admin em telas de detalhe completas por artista, obra, lead e reserva;
2. vincular notas e tarefas a cada entidade operacional;
3. criar histórico de status por obra e lead;
4. permitir gestão de imagens reais por URL antes de upload próprio;
5. criar mensagens-padrão copiáveis para prospecção, reserva e retorno de artista;
6. substituir a base demonstrativa por dados reais autorizados.

## 7. Guias relacionados

```text
docs/ADMIN_OPERACAO_ARANDU.md
docs/IMPLEMENTACAO_LANCAMENTO_20260625.md
docs/SETUP_PRODUCAO.md
docs/SUPABASE_OPERACAO.md
```

## 8. O que não precisa estar pronto no primeiro lançamento

- Pagamento integrado.
- Upload automático de imagem.
- CRM completo.
- App mobile.
- Login obrigatório para comprador.
- Contrato jurídico automatizado.
- Emissão fiscal automatizada.

Esses itens podem entrar na segunda fase, depois dos primeiros contatos reais com artistas e compradores.
