# Lançamento Arandu — plano operacional

Este documento define o que precisa estar pronto para o Arandu sair de protótipo e começar a existir publicamente com site, prospecção e redes sociais.

## 1. Prioridade técnica

### Deploy

- Confirmar deploy na Vercel sem erro de limite de funções.
- A API foi consolidada em `api/[...path].js` para caber no plano Hobby.
- Testar as rotas:
  - `/api/catalog`
  - `/api/artists`
  - `/api/auth/session`
  - `/api/certificates?code=ARANDU-TESTE`

### Variáveis de ambiente

Configurar na Vercel:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=
```

Critério de pronto: `npm run build` funciona e as rotas de API respondem em produção.

## 2. Prioridade de banco de dados

### Supabase

- Criar projeto Supabase.
- Rodar `docs/supabase-schema.sql` no SQL Editor.
- Configurar Authentication com email/senha.
- Rodar:

```bash
npm run seed:supabase:dry
npm run seed:supabase
```

Critério de pronto: catálogo, artistas, certificados, formulários, reservas e painel deixam de operar apenas em modo demo.

## 3. Prioridade de conteúdo real

Antes de abrir redes sociais, o site deve ter:

- 5 a 10 artistas reais aprovados.
- 20 a 40 obras reais.
- Fotos boas de cada obra.
- Ficha técnica completa.
- Preço ou faixa de preço.
- Status real: disponível, reservada, vendida ou em análise.
- Mini biografia do artista.
- Texto curatorial curto por obra.
- Certificado ou modelo de certificado pronto.

Critério de pronto: uma pessoa desconhecida consegue entrar no site e entender o que é vendido, quem produz, quanto custa e por que pode confiar.

## 4. Prioridade comercial

Definir antes da prospecção forte:

- Comissão da Arandu.
- Prazo de pagamento ao artista.
- Responsável por embalagem.
- Responsável por frete.
- Política de devolução.
- Política de dano no transporte.
- Exclusividade ou não das obras.
- Nota fiscal, recibo ou intermediação.
- Termo simples de parceria com artistas.

Critério de pronto: o artista entende como ganha dinheiro e o comprador entende como compra com segurança.

## 5. Prioridade de confiança

- Certificado Arandu com código único.
- Página de verificação ativa.
- Modelo visual de certificado.
- Registro interno por obra.
- Política clara sobre limites do certificado.
- Processo de validação com artista.

Critério de pronto: cada venda tem documentação mínima e rastreabilidade.

## 6. Prioridade de marca

- Logo final em boa resolução.
- Favicon.
- Domínio oficial.
- Email profissional.
- Bio curta da marca.
- Texto institucional de 3 linhas.
- Paleta final: vermelho pau-brasil, off-white, terra, verde escuro.
- Kit básico de posts para Instagram e LinkedIn.

Critério de pronto: a marca parece consistente fora do site.

## 7. Prioridade de redes sociais

Antes de abrir Instagram:

- 9 posts prontos.
- 3 artistas apresentados.
- 6 obras reais com imagem boa.
- 1 post institucional: o que é a Arandu.
- 1 post sobre curadoria.
- 1 post sobre certificado/autenticidade.
- 1 post chamando artistas.
- 1 destaque “Comprar”.
- 1 destaque “Artistas”.
- 1 destaque “Certificado”.

Critério de pronto: a primeira impressão no Instagram sustenta a promessa premium do site.

## 8. Ordem recomendada

1. Confirmar deploy na Vercel.
2. Configurar Supabase e variáveis.
3. Rodar schema e seed.
4. Cadastrar artistas reais.
5. Cadastrar obras reais.
6. Fechar política comercial.
7. Fechar certificado.
8. Configurar domínio, email e WhatsApp.
9. Preparar 9 posts iniciais.
10. Abrir redes sociais.
11. Iniciar prospecção ativa.

## 9. Decisão de lançamento

O Arandu pode abrir publicamente quando estes itens estiverem marcados:

- [ ] Deploy estável.
- [ ] Supabase funcionando.
- [ ] Domínio configurado.
- [ ] WhatsApp ou email real configurado.
- [ ] Ao menos 5 artistas reais.
- [ ] Ao menos 20 obras reais.
- [ ] Certificado estruturado.
- [ ] Política comercial definida.
- [ ] Página para artistas funcionando.
- [ ] Instagram com 9 posts preparados.

Sem esses itens, o site pode ser testado internamente, mas ainda não deve ser tratado como lançamento oficial.
