import { load } from 'cheerio';
import { ALL_ANI_LIST_TAG_RANKS, DEFAULT_MINIMUM_BL_TAG_RANK, type AniListMediaType, type AniListSort, type AniListTagRankFilter, type MediaPageResponse, type MediaTitle, type StreamingEpisode, type StreamingLink } from '../shared/media.js';

const API_URL = 'https://graphql.anilist.co';
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_LIMIT = 180;
const allowedTagRanks = new Set<AniListTagRankFilter>([ALL_ANI_LIST_TAG_RANKS, DEFAULT_MINIMUM_BL_TAG_RANK]);
const allowedTypes = new Set<AniListMediaType>(['ANIME', 'MANGA']);
const allowedSorts = new Set<AniListSort>(['POPULARITY_DESC', 'START_DATE_DESC', 'START_DATE']);
const UPSTREAM_WINDOW_MS = 60_000;
const UPSTREAM_REQUEST_LIMIT = 20;
const upstreamRequests: number[] = [];
let upstreamBackoffUntil = 0;

export class AniListRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`AniList requests are temporarily limited. Retry in ${retryAfterSeconds} seconds.`);
    this.name = 'AniListRateLimitError';
  }
}

function reserveUpstreamSlot(): void {
  const now = Date.now();
  while (upstreamRequests.length > 0 && upstreamRequests[0] <= now - UPSTREAM_WINDOW_MS) upstreamRequests.shift();
  if (upstreamBackoffUntil > now) throw new AniListRateLimitError(Math.ceil((upstreamBackoffUntil - now) / 1000));
  if (upstreamRequests.length >= UPSTREAM_REQUEST_LIMIT) {
    throw new AniListRateLimitError(Math.max(1, Math.ceil((upstreamRequests[0] + UPSTREAM_WINDOW_MS - now) / 1000)));
  }
  upstreamRequests.push(now);
}

type AniListRecord = {
  id: number;
  type: AniListMediaType;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  format?: string | null;
  status?: string | null;
  description?: string | null;
  startDate?: { year?: number | null } | null;
  episodes?: number | null;
  chapters?: number | null;
  coverImage?: { large?: string | null; extraLarge?: string | null } | null;
  bannerImage?: string | null;
  averageScore?: number | null;
  isAdult?: boolean | null;
  tags?: Array<{ name: string; rank?: number | null }> | null;
  streamingEpisodes?: Array<{ title?: string | null; url?: string | null; site?: string | null; thumbnail?: string | null }> | null;
  externalLinks?: Array<{ url?: string | null; site?: string | null; type?: string | null }> | null;
};

type Cached<T> = { expiresAt: number; value: T };
const responseCache = new Map<string, Cached<MediaPageResponse | MediaTitle | null>>();
const inFlight = new Map<string, Promise<MediaPageResponse | MediaTitle | null>>();

const COMMON_FIELDS = `
  id
  type
  title { romaji english native }
  format
  status
  description(asHtml: true)
  startDate { year }
  episodes
  chapters
  coverImage { large extraLarge }
  bannerImage
  averageScore
  isAdult
  tags { name rank }
  streamingEpisodes { title url site thumbnail }
  externalLinks { url site type }
`;

const SEARCH_QUERY = `
  query BrowseBlMedia($page: Int!, $perPage: Int!, $type: MediaType!, $sort: [MediaSort!]!, $search: String, $isAdult: Boolean, $minimumRank: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage total }
      media(
        type: $type
        tag_in: ["Boys' Love"]
        minimumTagRank: $minimumRank
        isAdult: $isAdult
        sort: $sort
        search: $search
      ) { ${COMMON_FIELDS} }
    }
  }
`;

const DETAIL_QUERY = `
  query BlMediaDetail($id: Int!) {
    Media(id: $id) { ${COMMON_FIELDS} }
  }
`;

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = load(value).text().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 900 ? `${text.slice(0, 897).trimEnd()}…` : text;
}

function displayTitle(record: AniListRecord): string {
  return record.title?.english?.trim() || record.title?.romaji?.trim() || record.title?.native?.trim() || `Untitled media ${record.id}`;
}

function normalize(record: AniListRecord): MediaTitle {
  const blRank = record.tags?.find((tag) => tag.name === "Boys' Love")?.rank ?? null;
  const episodeLinks: StreamingEpisode[] = (record.streamingEpisodes ?? [])
    .flatMap((episode) => {
      const url = safeUrl(episode.url);
      return url ? [{ title: episode.title?.trim() || 'Episode', url, site: episode.site?.trim() || null, thumbnail: safeUrl(episode.thumbnail) }] : [];
    });
  const streamingLinks: StreamingLink[] = (record.externalLinks ?? [])
    .filter((link) => link.type === 'STREAMING')
    .flatMap((link) => {
      const url = safeUrl(link.url);
      const site = link.site?.trim();
      return url && site ? [{ url, site }] : [];
    });
  const type = record.type === 'MANGA' ? 'MANGA' : 'ANIME';

  return {
    id: record.id,
    type,
    title: {
      romaji: record.title?.romaji ?? null,
      english: record.title?.english ?? null,
      native: record.title?.native ?? null,
    },
    displayTitle: displayTitle(record),
    format: record.format ?? null,
    status: record.status ?? null,
    description: cleanDescription(record.description),
    startYear: record.startDate?.year ?? null,
    episodes: record.episodes ?? null,
    chapters: record.chapters ?? null,
    coverImage: safeUrl(record.coverImage?.extraLarge ?? record.coverImage?.large),
    bannerImage: safeUrl(record.bannerImage),
    averageScore: record.averageScore ?? null,
    isAdult: Boolean(record.isAdult),
    boysLoveRank: blRank,
    streamingEpisodes: episodeLinks,
    streamingLinks,
    sourceUrl: `https://anilist.co/${type === 'ANIME' ? 'anime' : 'manga'}/${record.id}`,
  };
}

async function queryAniList<T>(key: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const previous = inFlight.get(key);
  if (previous) return previous as Promise<T>;
  reserveUpstreamSlot();

  const request = (async () => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'BL-Pulse/1.0' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 429) {
      const headerSeconds = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
      const retryAfterSeconds = Math.max(1, Math.min(300, Number.isFinite(headerSeconds) ? headerSeconds : 60));
      upstreamBackoffUntil = Math.max(upstreamBackoffUntil, Date.now() + retryAfterSeconds * 1000);
      throw new AniListRateLimitError(retryAfterSeconds);
    }
    if (!response.ok) throw new Error(`AniList returned HTTP ${response.status}.`);
    const payload = await response.json() as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'AniList query failed.');
    const result = (payload.data ?? {}) as T;
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result as MediaPageResponse | MediaTitle | null });
    if (responseCache.size > CACHE_LIMIT) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey) responseCache.delete(oldestKey);
    }
    return result;
  })();

  inFlight.set(key, request as Promise<MediaPageResponse | MediaTitle | null>);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export async function browseAniList(input: {
  type: AniListMediaType;
  page: number;
  sort: AniListSort;
  search?: string;
  includeAdult?: boolean;
  minimumRank?: AniListTagRankFilter;
}): Promise<MediaPageResponse> {
  if (!allowedTypes.has(input.type)) throw new Error('Choose Anime or Manga.');
  if (!allowedSorts.has(input.sort)) throw new Error('Choose a supported sort order.');
  const minimumRank = input.minimumRank ?? DEFAULT_MINIMUM_BL_TAG_RANK;
  if (!allowedTagRanks.has(minimumRank)) throw new Error('Choose a supported AniList tag-rank filter.');
  const page = Math.max(1, Math.min(300, Math.floor(input.page) || 1));
  const search = input.search?.replace(/\s+/g, ' ').trim().slice(0, 80) || null;
  const key = `page:${input.type}:${page}:${input.sort}:rank${minimumRank}:${input.includeAdult ? 'adult' : 'general'}:${search ?? ''}`;
  const result = await queryAniList<{ Page?: { pageInfo?: { hasNextPage?: boolean; total?: number }; media?: AniListRecord[] } }>(key, SEARCH_QUERY, {
    page,
    perPage: 24,
    type: input.type,
    sort: [input.sort],
    search,
    isAdult: input.includeAdult ? null : false,
    minimumRank,
  });
  const pageResult = result.Page;
  const items = (pageResult?.media ?? []).map(normalize).filter((item) => (input.includeAdult || !item.isAdult) && (item.boysLoveRank ?? 0) >= minimumRank);
  return {
    type: input.type,
    page,
    hasNextPage: page < 300 && Boolean(pageResult?.pageInfo?.hasNextPage),
    total: pageResult?.pageInfo?.total ?? items.length,
    items,
    source: 'AniList',
  };
}

export async function getAniListMedia(type: AniListMediaType, id: number, includeAdult = false, minimumRank: AniListTagRankFilter = DEFAULT_MINIMUM_BL_TAG_RANK): Promise<MediaTitle | null> {
  if (!allowedTypes.has(type) || !Number.isSafeInteger(id) || id <= 0) return null;
  if (!allowedTagRanks.has(minimumRank)) return null;
  const key = `detail:${type}:${id}`;
  const result = await queryAniList<{ Media?: AniListRecord | null }>(key, DETAIL_QUERY, { id });
  const record = result.Media;
  const boysLoveTag = record?.tags?.find((tag) => tag.name === "Boys' Love");
  if (!record || !boysLoveTag || record.type !== type || (!includeAdult && record.isAdult) || (boysLoveTag.rank ?? 0) < minimumRank) return null;
  return normalize(record);
}
