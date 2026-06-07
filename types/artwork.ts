export type ArtworkCategory = 'pintura' | 'fotografia' | 'escultura' | 'gravura' | 'edicao-limitada';
export type PriceRange = 'ate-1000' | '1000-3000' | '3000-7000' | 'acima-7000' | 'sob-consulta';
export type Availability = 'disponivel' | 'reservada' | 'vendida' | 'sob-consulta';
export type SizeCategory = 'pequena' | 'media' | 'grande' | 'escultural';
export type EditionType = 'obra-unica' | 'edicao-limitada' | 'prova-de-artista';

export type Artwork = {
  id: string;
  slug: string;
  title: string;
  artistId: string;
  year: number;
  category: ArtworkCategory;
  technique: string;
  dimensions: {
    heightCm: number;
    widthCm: number;
    depthCm?: number;
  };
  price?: number;
  priceLabel: string;
  priceRange: PriceRange;
  availability: Availability;
  imageGradient: string;
  description: string;
  curatorialNote: string;
  presenceText: string;
  scaleGuidance: string;
  contextTags: string[];
  environmentTags: string[];
  intentionTags: string[];
  moodTags: string[];
  colorTags: string[];
  sizeCategory: SizeCategory;
  certificateAvailable: boolean;
  editionType: EditionType;
  featured: boolean;
};
