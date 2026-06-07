import type { Artwork } from '@/types/artwork';
import type { SelectionState } from '@/types/select';

function overlap(values: string[], selected: string[]) {
  return selected.reduce((total, item) => total + (values.includes(item) ? 1 : 0), 0);
}

export function rankArtwork(artwork: Artwork, selection: SelectionState) {
  let points = 0;

  if (selection.environment && artwork.environmentTags.includes(selection.environment)) points += 4;
  if (selection.moment && artwork.intentionTags.includes(selection.moment)) points += 3;
  if (selection.budget && artwork.priceRange === selection.budget) points += 3;

  points += overlap(artwork.moodTags, selection.feelings) * 2;

  return points;
}

export function getRecommendations(artworks: Artwork[], selection: SelectionState) {
  return artworks
    .map((artwork) => ({ artwork, points: rankArtwork(artwork, selection) }))
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .map((item) => item.artwork);
}
