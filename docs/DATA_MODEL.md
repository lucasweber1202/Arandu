# Modelo de Dados da Arandu

## Objetivo

O modelo de dados deve sustentar uma plataforma de curadoria, não apenas um catálogo de produtos.

Cada obra deve ser conectada a:

- artista;
- contexto de uso;
- intenção de compra;
- orçamento;
- escala;
- sensação desejada;
- certificado;
- trajetória curatorial.

## Artwork

Representa uma obra cadastrada na Arandu.

```ts
type Artwork = {
  id: string;
  slug: string;
  title: string;
  artistId: string;
  year: number;
  category: 'pintura' | 'fotografia' | 'escultura' | 'gravura' | 'edicao-limitada';
  technique: string;
  dimensions: {
    heightCm: number;
    widthCm: number;
    depthCm?: number;
  };
  price?: number;
  priceLabel: string;
  priceRange: 'ate-1000' | '1000-3000' | '3000-7000' | 'acima-7000' | 'sob-consulta';
  availability: 'disponivel' | 'reservada' | 'vendida' | 'sob-consulta';
  images: string[];
  description: string;
  curatorialNote: string;
  presenceText?: string;
  scaleGuidance?: string;
  contextTags: string[];
  environmentTags: string[];
  intentionTags: string[];
  moodTags: string[];
  colorTags: string[];
  sizeCategory: 'pequena' | 'media' | 'grande' | 'escultural';
  certificateAvailable: boolean;
  editionType: 'obra-unica' | 'edicao-limitada' | 'prova-de-artista';
  featured: boolean;
  status: 'rascunho' | 'em-analise' | 'publicada' | 'arquivada';
};
```

## Artist

Representa um artista curado ou em análise.

```ts
type Artist = {
  id: string;
  slug: string;
  name: string;
  artisticName?: string;
  city: string;
  state: string;
  languages: Array<'pintura' | 'fotografia' | 'escultura' | 'gravura' | 'instalacao'>;
  shortBio: string;
  curatorialText: string;
  trajectory: ArtistTrajectoryItem[];
  exhibitions: string[];
  labels: string[];
  image: string;
  featured: boolean;
  status: 'submetido' | 'em-analise' | 'curado' | 'pausado' | 'recusado';
};

type ArtistTrajectoryItem = {
  year: number;
  title: string;
  description: string;
};
```

## Collection

Representa coleções editoriais e coleções por intenção.

```ts
type Collection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: 'editorial' | 'intencao' | 'ambiente' | 'orcamento' | 'categoria';
  artworkIds: string[];
  heroImage?: string;
  featured: boolean;
};
```

## CurationContext

Representa opções da experiência “Encontre arte para”.

```ts
type CurationContext = {
  environment?: string;
  moment?: string;
  budget?: string;
  mood?: string[];
  wallSize?: 'pequena' | 'media' | 'grande' | 'nao-sei';
};
```

## BuyerLead

Representa interesse de comprador.

```ts
type BuyerLead = {
  id: string;
  name: string;
  email: string;
  whatsapp?: string;
  artworkInterest?: string;
  selectedArtworks?: string[];
  environment?: string;
  moment?: string;
  budget?: string;
  message?: string;
  preferredContact?: 'email' | 'whatsapp' | 'telefone';
  status: 'novo' | 'em-contato' | 'proposta-enviada' | 'convertido' | 'perdido';
  createdAt: string;
};
```

## ArtistSubmission

Representa submissão de portfólio.

```ts
type ArtistSubmission = {
  id: string;
  artisticName: string;
  fullName: string;
  city: string;
  state: string;
  languages: string[];
  portfolioUrl: string;
  instagram?: string;
  shortBio: string;
  availableWorks?: string;
  priceRange?: string;
  exhibitions?: string;
  message?: string;
  status: 'nova' | 'em-analise' | 'aprovada' | 'recusada' | 'aguardando-retorno';
  createdAt: string;
};
```

## ArchitectBrief

Representa briefing de empresas, arquitetos e designers.

```ts
type ArchitectBrief = {
  id: string;
  name: string;
  office?: string;
  email: string;
  whatsapp?: string;
  projectType: 'residencial' | 'corporativo' | 'hospitalidade' | 'comercial' | 'outro';
  environment: string;
  city: string;
  state: string;
  budget?: string;
  deadline?: string;
  wallDimensions?: string;
  preferredLanguages?: string[];
  references?: string[];
  message?: string;
  quantityEstimate?: number;
  needsFormalProposal: boolean;
  status: 'novo' | 'em-analise' | 'proposta-em-preparo' | 'proposta-enviada' | 'convertido' | 'perdido';
  createdAt: string;
};
```

## Certificate

Representa certificado de autenticidade.

```ts
type Certificate = {
  id: string;
  artworkId: string;
  certificateNumber: string;
  artistName: string;
  artworkTitle: string;
  year: number;
  technique: string;
  dimensions: string;
  image: string;
  artistSignatureAvailable: boolean;
  curatorValidation: string;
  issuedAt?: string;
  status: 'rascunho' | 'emitido' | 'cancelado';
};
```

## Tags curatoriais principais

```text
Ambiente:
- casa
- apartamento
- escritorio
- empresa
- recepcao
- arquitetura
- hotelaria
- presente

Momento:
- primeira-obra
- primeira-colecao
- nova-casa
- reforma
- presente-autoral
- inauguracao
- projeto-profissional

Sensação:
- acolhimento
- sofisticacao
- impacto
- silencio
- brasilidade
- cor
- memoria
- natureza
- movimento
- presenca
```
