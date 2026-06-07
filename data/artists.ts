import type { Artist } from '@/types/artist';

export const artists: Artist[] = [
  {
    id: 'artist-marina-silveira',
    slug: 'marina-silveira',
    name: 'Marina Silveira',
    city: 'Sao Paulo',
    state: 'SP',
    languages: ['pintura'],
    shortBio: 'Investiga terra, pigmento e memoria domestica em pinturas de composicao silenciosa.',
    curatorialText: 'A producao de Marina parte de camadas de cor e materia para construir superficies densas, marcadas por gestos contidos. Suas obras funcionam bem em ambientes que pedem presenca sem excesso visual.',
    trajectory: [
      { year: 2021, title: 'Inicio da serie Solos', description: 'Pesquisa de pigmentos terrosos e composicoes de grande escala.' },
      { year: 2023, title: 'Mostra coletiva em Sao Paulo', description: 'Participacao em recorte sobre pintura contemporanea brasileira.' },
      { year: 2026, title: 'Selecao Arandu', description: 'Entrada na curadoria com obras da serie Estudos de Solo.' }
    ],
    exhibitions: ['Mostra Corpo e Materia, Sao Paulo, 2023'],
    labels: ['Materia e territorio', 'Abstracao brasileira', 'Natureza e paisagem'],
    imageGradient: 'linear-gradient(135deg, #7b3f2f, #d3a87c)',
    featured: true
  },
  {
    id: 'artist-camila-reboucas',
    slug: 'camila-reboucas',
    name: 'Camila Reboucas',
    city: 'Recife',
    state: 'PE',
    languages: ['fotografia'],
    shortBio: 'Fotografa paisagens, interiores e vestigios de presenca no Nordeste brasileiro.',
    curatorialText: 'Camila constrói imagens de ritmo lento, com interesse por luz natural, silencio e permanencia. Sua fotografia e indicada para colecoes iniciais, presentes autorais e ambientes de contemplacao.',
    trajectory: [
      { year: 2020, title: 'Pesquisa documental', description: 'Inicio de registro de paisagens e arquiteturas afetivas.' },
      { year: 2024, title: 'Serie Sertao Silencioso', description: 'Consolidacao de uma linguagem fotografica marcada por luz seca e horizonte.' }
    ],
    exhibitions: ['Circuito de Fotografia do Recife, 2024'],
    labels: ['Fotografia documental', 'Sertoes e territorios', 'Memoria'],
    imageGradient: 'linear-gradient(135deg, #8b5e34, #f0d0a1)',
    featured: true
  },
  {
    id: 'artist-arthur-davila',
    slug: 'arthur-davila',
    name: "Arthur D'Avila",
    city: 'Curitiba',
    state: 'PR',
    languages: ['escultura'],
    shortBio: 'Trabalha volume, equilibrio e tensao em esculturas de pequena e media escala.',
    curatorialText: 'A obra de Arthur tem interesse por estruturas suspensas e pontos de apoio instaveis. Suas esculturas sao indicadas para aparadores, escritorios, recepcoes e colecoes que buscam tridimensionalidade.',
    trajectory: [
      { year: 2019, title: 'Atelie de metal', description: 'Inicio da pesquisa em bronze, madeira e equilibrio estrutural.' },
      { year: 2025, title: 'Serie Equilibrios', description: 'Desenvolvimento de esculturas de presenca contida.' }
    ],
    exhibitions: ['Objeto e Permanencia, Curitiba, 2025'],
    labels: ['Escultura contemporanea', 'Presenca', 'Arquitetura'],
    imageGradient: 'linear-gradient(135deg, #5a3b2c, #c28a52)',
    featured: true
  },
  {
    id: 'artist-lucas-mendes',
    slug: 'lucas-mendes',
    name: 'Lucas Mendes',
    city: 'Belo Horizonte',
    state: 'MG',
    languages: ['pintura', 'escultura'],
    shortBio: 'Pesquisa cidade, fluxo e construcao por meio de relevos, madeira e tinta acrilica.',
    curatorialText: 'Lucas aproxima linguagem urbana e materia artesanal. Suas obras dialogam com escritorios, ambientes corporativos e projetos de arquitetura que buscam movimento sem usar simbolos literais da cidade.',
    trajectory: [
      { year: 2022, title: 'Relevos urbanos', description: 'Inicio de obras em madeira, cor e composicao modular.' },
      { year: 2026, title: 'Entrada na Arandu', description: 'Selecao de obras ligadas a cidade, movimento e estrutura.' }
    ],
    exhibitions: ['Camadas da Cidade, Belo Horizonte, 2024'],
    labels: ['Cidade e movimento', 'Metropoles brasileiras', 'Materia urbana'],
    imageGradient: 'linear-gradient(135deg, #2b211d, #b85a3c)',
    featured: true
  }
];

export function getArtistBySlug(slug: string) {
  return artists.find((artist) => artist.slug === slug);
}

export function getArtistById(id: string) {
  return artists.find((artist) => artist.id === id);
}
