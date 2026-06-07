export type CollectionType = 'editorial' | 'intencao' | 'ambiente' | 'orcamento' | 'categoria';

export type Collection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: CollectionType;
  artworkIds: string[];
  imageGradient: string;
  featured: boolean;
};
