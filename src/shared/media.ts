export type AniListMediaType = 'ANIME' | 'MANGA';
export type AniListSort = 'POPULARITY_DESC' | 'START_DATE_DESC' | 'START_DATE';
export const DEFAULT_MINIMUM_BL_TAG_RANK = 70 as const;
export const ALL_ANI_LIST_TAG_RANKS = 0 as const;
export type AniListTagRankFilter = typeof ALL_ANI_LIST_TAG_RANKS | typeof DEFAULT_MINIMUM_BL_TAG_RANK;

export interface MediaTitle {
  id: number;
  type: AniListMediaType;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  displayTitle: string;
  format: string | null;
  status: string | null;
  description: string | null;
  startYear: number | null;
  episodes: number | null;
  chapters: number | null;
  coverImage: string | null;
  bannerImage: string | null;
  averageScore: number | null;
  isAdult: boolean;
  boysLoveRank: number | null;
  streamingEpisodes: StreamingEpisode[];
  streamingLinks: StreamingLink[];
  sourceUrl: string;
}

export interface StreamingEpisode {
  title: string;
  url: string;
  site: string | null;
  thumbnail: string | null;
}

export interface StreamingLink {
  url: string;
  site: string;
}

export interface MediaPageResponse {
  type: AniListMediaType;
  page: number;
  hasNextPage: boolean;
  total: number;
  items: MediaTitle[];
  source: 'AniList';
}
