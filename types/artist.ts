export type ArtistLanguage = 'pintura' | 'fotografia' | 'escultura' | 'gravura';

export type ArtistTrajectoryItem = {
  year: number;
  title: string;
  description: string;
};

export type Artist = {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  languages: ArtistLanguage[];
  shortBio: string;
  curatorialText: string;
  trajectory: ArtistTrajectoryItem[];
  exhibitions: string[];
  labels: string[];
  imageGradient: string;
  featured: boolean;
};
