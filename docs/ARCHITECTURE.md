# Arquitetura da Arandu

## Visão geral

A Arandu deve ser estruturada como uma plataforma de curadoria de arte brasileira contemporânea, não como um e-commerce tradicional.

O produto possui três núcleos principais:

```text
1. Experiência do comprador
   Encontrar arte por ambiente, momento, orçamento, escala e intenção.

2. Experiência do artista
   Submissão, análise curatorial, trajetória, obras, documentação e evolução.

3. Experiência para arquitetos e empresas
   Briefing de projeto, seleção curatorial, proposta e relacionamento recorrente.
```

## Stack técnica recomendada

```text
Front-end: Next.js + TypeScript
Estilo: Tailwind CSS
Banco de dados: Supabase/PostgreSQL
Hospedagem: Vercel
Emails: Resend ou equivalente
Analytics: Plausible, PostHog ou Google Analytics
CMS futuro: Sanity, Strapi ou painel próprio
```

## Rotas públicas

```text
/
├── /obras
├── /obras/[slug]
├── /artistas
├── /artistas/[slug]
├── /colecoes
├── /colecoes/[slug]
├── /encontrar-arte
├── /minha-selecao
├── /para-artistas
├── /empresas-e-arquitetos
├── /autenticidade
├── /sobre
└── /contato
```

## Rotas administrativas futuras

```text
/admin
├── /admin/obras
├── /admin/artistas
├── /admin/colecoes
├── /admin/leads
├── /admin/submissoes
├── /admin/briefings
├── /admin/certificados
└── /admin/configuracoes
```

## Estrutura de pastas proposta

```text
app/
├── page.tsx
├── obras/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── artistas/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── colecoes/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── encontrar-arte/page.tsx
├── minha-selecao/page.tsx
├── para-artistas/page.tsx
├── empresas-e-arquitetos/page.tsx
├── autenticidade/page.tsx
├── sobre/page.tsx
└── contato/page.tsx

components/
├── layout/
├── home/
├── artworks/
├── artists/
├── collections/
├── curation/
├── forms/
└── ui/

data/
├── artworks.ts
├── artists.ts
├── collections.ts
├── contexts.ts
└── navigation.ts

lib/
├── curation/
│   ├── matching.ts
│   └── scoring.ts
├── supabase/
│   └── client.ts
├── constants.ts
└── utils.ts

types/
├── artwork.ts
├── artist.ts
├── collection.ts
├── curation.ts
└── lead.ts

public/
├── logo/
├── images/
└── placeholders/
```

## Experiência principal: curadoria por contexto

A rota `/encontrar-arte` deve ser o coração da plataforma.

Fluxo inicial:

```text
1. Onde a obra vai estar?
2. Qual é o momento?
3. Qual orçamento faz sentido?
4. Que sensação você quer criar?
5. Seleção recomendada pela curadoria
```

O resultado deve apresentar:

- obras compatíveis;
- artistas relacionados;
- coleções relacionadas;
- nota curatorial explicando a escolha;
- botão “Salvar na minha seleção”;
- botão “Falar com a curadoria”.

## Minha seleção Arandu

A Arandu deve evitar a lógica de carrinho tradicional no início.

Fluxo recomendado:

```text
Usuário salva obras
↓
Monta uma seleção pessoal
↓
Informa ambiente, momento e orçamento
↓
Envia para curadoria
↓
Recebe orientação, proposta ou atendimento
```

CTA preferencial: `Salvar na minha seleção`.

## Prioridade arquitetural

A primeira versão deve ter dados mockados bem estruturados. Depois, as mesmas estruturas devem migrar para Supabase/PostgreSQL sem alterar a experiência principal.
