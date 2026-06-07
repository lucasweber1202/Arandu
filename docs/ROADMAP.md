# Roadmap da Arandu

## Estratégia geral

A Arandu deve sair de um protótipo visual para uma plataforma própria de curadoria. A evolução deve ser incremental para evitar complexidade desnecessária antes da validação comercial.

## Fase 0 — Fundação estratégica

Objetivo: documentar arquitetura, jornadas, dados e marca.

Entregas:

- README do projeto.
- Arquitetura de rotas e componentes.
- Jornada de compradores, artistas e arquitetos.
- Modelo de dados inicial.
- Diretrizes de marca.
- Roadmap técnico e de produto.

Status: iniciado.

## Fase 1 — MVP visual próprio

Objetivo: criar a primeira versão em código da experiência Arandu, usando dados mockados.

Entregas:

- Next.js + TypeScript + Tailwind.
- Home completa.
- Header e footer.
- Seção “Encontre arte para”.
- Obras em destaque.
- Artistas em foco.
- Coleções por intenção.
- Página de obras.
- Página individual de obra.
- Página de artistas.
- Página individual de artista.
- Página “Para artistas”.
- Página “Empresas e Arquitetos”.
- Página “Autenticidade”.
- Página “Sobre”.
- Página “Contato”.
- Dados mockados estruturados.

Critério de sucesso:

- O site deve parecer uma galeria premium, não um marketplace comum.
- A navegação deve conduzir o usuário por curadoria, não apenas por catálogo.
- A experiência mobile deve ser boa.

## Fase 2 — Curadoria por contexto funcional

Objetivo: transformar a seção “Encontre arte para” em um mecanismo real de recomendação simples.

Entregas:

- Wizard com etapas: ambiente, momento, orçamento, sensação e escala.
- Algoritmo inicial de recomendação por tags e pontuação.
- Resultado com obras recomendadas.
- Artistas relacionados.
- Coleções relacionadas.
- Nota curatorial gerada a partir das escolhas.
- CTA para “Salvar na minha seleção”.
- CTA para “Falar com a curadoria”.

Critério de sucesso:

- Usuário consegue sair de uma intenção vaga para uma seleção concreta de obras.

## Fase 3 — Minha seleção Arandu

Objetivo: substituir a lógica de carrinho por uma experiência consultiva.

Entregas:

- Salvar obras localmente.
- Página `/minha-selecao`.
- Resumo das obras salvas.
- Formulário para enviar seleção à curadoria.
- Campos de ambiente, orçamento, mensagem e contato.

Critério de sucesso:

- Usuário consegue montar uma lista curta e pedir orientação.

## Fase 4 — Supabase e dados reais

Objetivo: migrar de dados mockados para banco real.

Entregas:

- Supabase configurado.
- Tabelas de artistas.
- Tabelas de obras.
- Tabelas de coleções.
- Tabelas de leads compradores.
- Tabelas de submissões de artistas.
- Tabelas de briefings de arquitetos.
- Integração dos formulários com banco.

Critério de sucesso:

- Todas as interações importantes geram dados persistentes.

## Fase 5 — Painel interno

Objetivo: permitir gestão operacional da curadoria.

Entregas:

- Login administrativo.
- CRUD de obras.
- CRUD de artistas.
- Gestão de leads.
- Gestão de submissões.
- Gestão de briefings.
- Status de obras: disponível, reservada, vendida.
- Status de artista: submetido, em análise, curado, pausado.

Critério de sucesso:

- A Arandu consegue operar sem alterar código para cada nova obra ou artista.

## Fase 6 — Certificados e documentação

Objetivo: fortalecer confiança, procedência e valor percebido.

Entregas:

- Geração de número de certificado.
- Página/registro de certificado.
- PDF de certificado no futuro.
- Campos de assinatura do artista e validação curatorial.
- Diferenciação entre registro interno, certificado e laudo externo.

Critério de sucesso:

- Cada obra vendida pode ter documentação clara e rastreável.

## Fase 7 — Área para artistas

Objetivo: criar relacionamento contínuo com artistas.

Entregas futuras:

- Login de artista.
- Obras submetidas.
- Status de análise.
- Mensagens da curadoria.
- Métricas de interesse.
- Histórico de obras.
- Atualização de portfólio.

## Fase 8 — Área para arquitetos e empresas

Objetivo: estruturar canal B2B/B2P.

Entregas futuras:

- Login ou área de briefing recorrente.
- Projetos salvos.
- Seleções por projeto.
- Propostas curatoriais.
- Exportação de proposta.
- Histórico de relacionamento.

## Fase 9 — Comercialização avançada

Só deve ser considerada após validação.

Possíveis entregas:

- Pagamento online.
- Reserva com prazo.
- Checkout protegido.
- Integração com transportadora especializada.
- Comissões.
- Nota/recibo.
- Políticas de devolução.

## Prioridade imediata

1. Criar scaffold técnico.
2. Implementar MVP visual próprio.
3. Implementar curadoria por contexto.
4. Implementar Minha seleção.
5. Só depois conectar banco real.
