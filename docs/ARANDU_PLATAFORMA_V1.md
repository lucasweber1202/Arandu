# Arandu Plataforma v1

Este documento organiza a próxima fase do Arandu antes da entrada de WhatsApp real, logo final e prospecção comercial.

## Objetivo

Transformar o site validado em uma plataforma operacional de curadoria, com dados consistentes, acervo ampliado, fluxo comercial rastreável e base pronta para Supabase.

## Princípios de produto

1. O Arandu não deve funcionar como vitrine genérica de produtos.
2. Cada obra precisa carregar contexto: artista, trajetória, técnica, ambiente, intenção e procedência.
3. A compra deve passar por curadoria, seleção, reserva, proposta e certificado.
4. Empresas e arquitetos precisam receber proposta organizada, não apenas catálogo.
5. Artistas devem ser acompanhados como trajetória, não como fornecedores avulsos.

## Módulos da Plataforma v1

### 1. Acervo curatorial

Responsável por obras, artistas, linguagens, status e leitura curatorial.

Requisitos:
- Todos os `artistId` de obras precisam existir em `data/artists.json`.
- Todas as obras devem usar URL canônica `obra.html?id=<id>`.
- Toda obra publicada deve ter título, artista, técnica, dimensões, preço ou indicação de consulta, status, tags, ambientes e leitura curatorial.
- Toda obra deve informar se é obra única, edição limitada ou múltiplo.
- Toda obra deve ter pelo menos três tags curatoriais.

### 2. Artistas

Responsável por perfil, trajetória, linguagem, território e status de acompanhamento.

Campos mínimos:
- `id`
- `name`
- `city`
- `region`
- `languages`
- `profile`
- `trajectory`
- `statement`
- `curatorialAxes`
- `status`
- `url`

### 3. Minha Seleção

Fluxo público de intenção de compra.

Estado atual:
- Seleção salva em `localStorage`.
- Obras podem ser salvas, removidas, anotadas e copiadas.

Evolução necessária:
- Salvar seleção no banco.
- Gerar link compartilhável.
- Enviar seleção para curadoria.
- Conectar seleção ao lead.
- Permitir que a curadoria transforme seleção em proposta.

### 4. Reservas

Fluxo de interesse comercial.

Estado atual:
- Reserva local e mensagem copiável.

Evolução necessária:
- Criar reserva no banco.
- Alterar status comercial da obra.
- Definir prazo de validade.
- Registrar histórico.
- Permitir liberação ou conversão em venda.

### 5. Propostas curatoriais

Fluxo para comprador, empresa, arquiteto e hospitalidade.

Estado atual:
- Proposta gerada em HTML local a partir da seleção.

Evolução necessária:
- Salvar proposta no banco.
- Criar número da proposta.
- Status: rascunho, enviada, aprovada, recusada, expirada.
- Vincular obras e valores.
- Exportar PDF/HTML.
- Gerar link de aprovação.

### 6. Certificados

Fluxo de confiança e pós-venda.

Estado atual:
- Certificados demonstrativos em JSON.

Evolução necessária:
- Certificado com código único.
- Vínculo com obra real e artista real.
- Status: rascunho, válido, revogado, em análise.
- Verificação pública por código.
- PDF/HTML imprimível.
- Histórico de emissão.

### 7. CRM e operação

Fluxo interno de acompanhamento.

Entidades:
- Leads
- Submissões de artistas
- Briefings empresariais
- Reservas
- Propostas
- Tarefas
- Notas
- Eventos de obra
- Mídias

## Critérios para entrar em produção comercial

Antes de configurar WhatsApp real e logo final, o Arandu deve ter:

1. Base de artistas e obras sem inconsistência.
2. No mínimo 12 artistas cadastrados.
3. No mínimo 20 obras cadastradas.
4. Todas as obras com URL canônica.
5. Certificados estruturados sem texto demonstrativo em produção.
6. Schema Supabase aplicado ou documentado.
7. Formulários conectados ao banco ou com plano explícito de ativação.
8. Proposta curatorial pronta para uso comercial.
9. Política clara de reserva, certificado e contato.
10. Quality gate, links, produção, inventário e build passando.

## Backlog priorizado

### Fase 1 — Base curatorial

- Expandir `data/artists.json`.
- Expandir `data/artworks.json`.
- Normalizar URLs para `obra.html?id=...`.
- Criar validação de consistência.
- Atualizar busca estática.

### Fase 2 — Banco operacional

- Criar schema Supabase.
- Configurar tabelas, índices e views.
- Conectar formulários a `/api/forms`.
- Conectar catálogo público a `/api/public/catalog`.

### Fase 3 — Comercial

- Salvar reservas no banco.
- Salvar propostas no banco.
- Gerar link de proposta.
- Registrar status de obra.

### Fase 4 — Confiança

- Certificados reais.
- Verificação pública.
- Página de certificado emitido.
- Auditoria de procedência.

### Fase 5 — Lançamento

- Logo final.
- WhatsApp real.
- Revisão final de páginas principais.
- Prospecção de artistas.
- Conteúdo para redes sociais.
