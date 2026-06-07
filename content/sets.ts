import type { Collection } from '@/types/collection';

export const collections: Collection[] = [
  {
    id: 'set-primeira-obra',
    slug: 'primeira-obra',
    title: 'Primeira obra',
    description: 'Uma selecao para comecar a comprar arte com acompanhamento, criterio e seguranca.',
    type: 'intencao',
    artworkIds: ['artwork-sertao-silencioso'],
    imageGradient: 'linear-gradient(135deg, #f7f0e6, #b85a3c)',
    featured: true
  },
  {
    id: 'set-arte-para-escritorio',
    slug: 'arte-para-escritorio',
    title: 'Arte para escritorio',
    description: 'Obras com sobriedade, presenca e identidade para ambientes de trabalho.',
    type: 'ambiente',
    artworkIds: ['artwork-equilibrio-suspenso'],
    imageGradient: 'linear-gradient(135deg, #201a17, #b85a3c)',
    featured: true
  }
];

export function getCollectionBySlug(slug: string) {
  return collections.find((collection) => collection.slug === slug);
}
