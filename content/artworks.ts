import type { Artwork } from '@/types/artwork';

export const artworks: Artwork[] = [
  {
    id: 'artwork-estudo-de-solo-04',
    slug: 'estudo-de-solo-04',
    title: 'Estudo de Solo 04',
    artistId: 'artist-marina-silveira',
    year: 2026,
    category: 'pintura',
    technique: 'Oleo sobre tela',
    dimensions: { heightCm: 120, widthCm: 100 },
    price: 4200,
    priceLabel: 'R$ 4.200',
    priceRange: '3000-7000',
    availability: 'disponivel',
    imageGradient: 'radial-gradient(circle at 35% 35%, #d6a46d, #9e3d2c 45%, #39231d)',
    description: 'Pintura de superficie terrosa, composta por campos de cor e gestos de baixa intensidade.',
    curatorialNote: 'Selecionada pela maturidade de composicao e pela capacidade de criar presenca sem excesso visual.',
    presenceText: 'Uma obra de densidade silenciosa, indicada para ambientes que pedem acolhimento e materia.',
    scaleGuidance: 'Indicada para paredes medias ou grandes, acima de 1,80 m de largura.',
    contextTags: ['primeira-colecao', 'obra-grande', 'curadoria-arandu'],
    environmentTags: ['casa', 'apartamento', 'recepcao', 'arquitetura'],
    intentionTags: ['decorar-ambiente', 'comecar-colecao'],
    moodTags: ['acolhimento', 'memoria', 'presenca'],
    colorTags: ['terrosos', 'vermelho', 'madeira'],
    sizeCategory: 'grande',
    certificateAvailable: true,
    editionType: 'obra-unica',
    featured: true
  },
  {
    id: 'artwork-sertao-silencioso',
    slug: 'sertao-silencioso',
    title: 'Sertao Silencioso',
    artistId: 'artist-camila-reboucas',
    year: 2025,
    category: 'fotografia',
    technique: 'Impressao fine art em papel algodao',
    dimensions: { heightCm: 60, widthCm: 90 },
    price: 2100,
    priceLabel: 'R$ 2.100',
    priceRange: '1000-3000',
    availability: 'disponivel',
    imageGradient: 'linear-gradient(135deg, #f0d0a1, #a36b3f 58%, #42281d)',
    description: 'Fotografia de paisagem seca, horizonte baixo e luz de fim de tarde.',
    curatorialNote: 'Obra indicada para quem procura uma primeira fotografia com narrativa, silencio e territorio.',
    presenceText: 'Cria uma atmosfera contemplativa e funciona bem em salas, quartos e escritorios.',
    scaleGuidance: 'Indicada para paredes pequenas ou medias. Pode ser usada sozinha ou em composicao.',
    contextTags: ['primeira-obra', 'fotografia-brasileira', 'presente-autoral'],
    environmentTags: ['casa', 'apartamento', 'escritorio', 'presente'],
    intentionTags: ['primeira-obra', 'presentear'],
    moodTags: ['silencio', 'memoria', 'natureza'],
    colorTags: ['areia', 'terrosos'],
    sizeCategory: 'media',
    certificateAvailable: true,
    editionType: 'edicao-limitada',
    featured: true
  },
  {
    id: 'artwork-equilibrio-suspenso',
    slug: 'equilibrio-suspenso',
    title: 'Equilibrio Suspenso',
    artistId: 'artist-arthur-davila',
    year: 2026,
    category: 'escultura',
    technique: 'Bronze fundido',
    dimensions: { heightCm: 45, widthCm: 20, depthCm: 18 },
    price: 8900,
    priceLabel: 'R$ 8.900',
    priceRange: 'acima-7000',
    availability: 'disponivel',
    imageGradient: 'radial-gradient(circle at 50% 20%, #d7a15f, #7a4a2d 50%, #241714)',
    description: 'Escultura de pequeno porte com tensao entre apoio, peso e instabilidade.',
    curatorialNote: 'Selecionada pela relacao entre forma e equilibrio, com forte adequacao a projetos corporativos.',
    presenceText: 'Funciona como ponto de atencao em aparadores, mesas laterais e recepcoes.',
    scaleGuidance: 'Indicada para superficies horizontais, aparadores ou bases de apoio com iluminacao dirigida.',
    contextTags: ['escultura-contemporanea', 'obra-de-impacto', 'projeto-corporativo'],
    environmentTags: ['empresa', 'recepcao', 'escritorio', 'arquitetura'],
    intentionTags: ['projeto-profissional', 'colecao-madura'],
    moodTags: ['sofisticacao', 'impacto', 'presenca'],
    colorTags: ['bronze', 'madeira', 'carvao'],
    sizeCategory: 'escultural',
    certificateAvailable: true,
    editionType: 'obra-unica',
    featured: true
  }
];

export function getArtworkBySlug(slug: string) {
  return artworks.find((artwork) => artwork.slug === slug);
}

export function getArtworksByArtistId(artistId: string) {
  return artworks.filter((artwork) => artwork.artistId === artistId);
}

export function getFeaturedArtworks() {
  return artworks.filter((artwork) => artwork.featured);
}
