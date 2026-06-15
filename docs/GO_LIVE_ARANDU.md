# Go-live Arandu — roteiro de lançamento real

Este roteiro define a passagem do Arandu de MVP técnico para operação pública.

## 1. Estado atual

O projeto já possui:

- site público com páginas de compra, acervo, artistas, confiança e operação;
- API consolidada para Vercel Hobby;
- health check em `/api/health`;
- página de diagnóstico em `status.html`;
- base demonstrativa com artistas, obras e certificados;
- painel operacional preparado para Supabase;
- checks de qualidade, dados, links, backend, inventário e build.

## 2. O que precisa estar pronto antes de abrir publicamente

### Infraestrutura

- Deploy na Vercel concluído sem erro de limite de funções.
- Domínio real apontado para a Vercel.
- `SUPABASE_URL` configurada.
- `SUPABASE_ANON_KEY` configurada.
- `SUPABASE_SERVICE_ROLE_KEY` configurada.
- `ARANDU_ADMIN_TOKEN` configurado.
- `/api/health` respondendo.
- `status.html` mostrando Supabase e token como configurados.

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

### Mídias sociais

- 9 posts iniciais prontos.
- 3 artistas apresentados.
- 6 obras apresentadas.
- Destaques criados: Obras, Artistas, Certificado, Comprar, Para artistas.
- Link do site funcionando.
- WhatsApp real funcionando.

## 3. Ordem de execução recomendada

1. Fazer deploy na Vercel.
2. Configurar variáveis de ambiente.
3. Testar `/api/health` e `status.html`.
4. Criar projeto Supabase e rodar `docs/supabase-schema.sql`.
5. Rodar `npm run seed:supabase:dry`.
6. Rodar `npm run seed:supabase`.
7. Testar catálogo, artistas, certificados, login e painel.
8. Inserir logo final e favicon.
9. Configurar WhatsApp real.
10. Trocar base demonstrativa por artistas e obras reais.
11. Revisar política comercial e termo de artista.
12. Preparar posts e abrir redes sociais.
13. Iniciar prospecção ativa de artistas.

## 4. Testes mínimos antes de divulgar

```bash
npm run check:quality
npm run check:all
npm run build
```

Depois do deploy:

```text
/status.html
/api/health
/api/catalog
/api/artists
/api/certificates?code=ARANDU-TESTE
```

## 5. Critério para dizer que o Arandu pode ser divulgado

O Arandu pode ser divulgado quando:

- o site abre pelo domínio real;
- `/status.html` não mostra pendências técnicas críticas;
- há obras reais suficientes para o comprador navegar;
- ao menos um canal de contato real funciona;
- a política comercial não está indefinida;
- o comprador entende como reservar ou demonstrar interesse;
- o artista entende como enviar portfólio;
- a marca visual está consistente.

## 6. O que não precisa estar pronto no primeiro lançamento

- Pagamento integrado.
- Upload automático de imagem.
- CRM completo.
- App mobile.
- Login obrigatório para comprador.
- Contrato jurídico automatizado.
- Emissão fiscal automatizada.

Esses itens podem entrar na segunda fase, depois dos primeiros contatos reais com artistas e compradores.
