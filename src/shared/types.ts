export type SeriesStatus = 'airing' | 'upcoming' | 'completed';

export interface PlatformLink {
  name: string;
  url: string;
  source: 'TMDB' | 'JustWatch' | 'official';
}

export interface Series {
  id: string;
  title: string;
  country: string;
  status: SeriesStatus;
  sourceUrl: string;
  coverUrl?: string;
  synopsis?: string;
  year?: number;
  releaseDate?: string;
  genres: string[];
  platforms: PlatformLink[];
  updatedAt: string;
  detailFetchedAt?: string;
}

export interface EditorialPost {
  title: string;
  body: string;
  generatedAt: string;
  source: 'AI-assisted' | 'BL Pulse';
}

export interface CatalogResponse {
  series: Series[];
  lastRefreshed: string | null;
  lastChecked: string | null;
  sourceOnline: boolean;
  refreshing: boolean;
  error?: string;
  editorial: EditorialPost | null;
}
