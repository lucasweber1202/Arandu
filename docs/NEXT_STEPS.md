# Próximos passos técnicos — Arandu

Este documento separa o que já foi entregue no MVP estático e o que deve ser priorizado para transformar a Arandu em uma plataforma completa.

## 1. Curto prazo — acabamento antes de apresentar

- Subir a logo PNG transparente final.
- Revisar todas as páginas em desktop e mobile.
- Padronizar todos os headers e footers com o CSS compartilhado.
- Remover estilos inline remanescentes.
- Revisar textos institucionais finais.
- Testar links internos.
- Testar Minha Seleção.
- Testar formulários locais.

## 2. Formulários reais

Substituir `js/forms.js` por uma integração real:

- Formspree para solução rápida.
- Resend para envio de e-mails transacionais.
- Supabase para salvar leads em banco.
- Backend próprio quando houver painel interno.

Formulários prioritários:

- Contato de comprador.
- Briefing de arquiteto/empresa.
- Submissão de artista.
- Envio da Minha Seleção.

## 3. Banco de dados

Estruturar Supabase/PostgreSQL com tabelas para:

- artists;
- artworks;
- collections;
- buyer_leads;
- architect_briefs;
- artist_submissions;
- certificates;
- saved_selections.

## 4. Catálogo dinâmico

Migrar as obras do HTML para uma fonte de dados:

- JSON local no início;
- Supabase depois;
- CMS ou painel próprio em fase mais madura.

## 5. Painel interno

Criar área administrativa para:

- cadastrar obras;
- editar artistas;
- organizar coleções;
- acompanhar leads;
- analisar submissões de artistas;
- controlar disponibilidade de obras;
- gerar certificados.

## 6. Minha Seleção avançada

Evoluir do localStorage para banco de dados:

- seleção persistente por usuário;
- envio real para curadoria;
- status do atendimento;
- proposta curatorial;
- histórico de seleção.

## 7. Certificados

Próxima evolução:

- número único de certificado;
- página pública de verificação;
- PDF do certificado;
- assinatura do artista quando aplicável;
- validação curatorial;
- histórico da obra.

## 8. Plataforma completa

Fases futuras:

- login de artista;
- login de arquiteto;
- CRM de compradores;
- pagamento;
- reserva de obra;
- checkout;
- integração de frete;
- notas e documentos comerciais.

## 9. Migração para Next.js

Quando o catálogo, SEO e banco de dados crescerem, faz sentido migrar para Next.js para obter:

- rotas dinâmicas;
- geração estática de páginas;
- melhor SEO;
- integração mais robusta com banco;
- componentes reutilizáveis;
- deploy escalável.

## 10. Prioridade recomendada

1. Finalizar MVP estático.
2. Ativar formulários reais.
3. Subir logo final.
4. Criar banco de obras e artistas.
5. Criar painel mínimo.
6. Evoluir Minha Seleção.
7. Criar certificado digital.
