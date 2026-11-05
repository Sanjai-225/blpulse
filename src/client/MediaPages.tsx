import { useEffect, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, CircleAlert, LoaderCircle, Search, Sparkles, Tv } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ALL_ANI_LIST_TAG_RANKS, DEFAULT_MINIMUM_BL_TAG_RANK, type AniListMediaType, type AniListSort, type AniListTagRankFilter, type MediaPageResponse, type MediaTitle, type StreamingLink } from '../shared/media';
import { metadataForPath } from '../shared/seo';
import { applyPageMetadata } from './seo';
import { fetchMediaPage, fetchMediaTitle } from './api';

const rankCaption = 'AniList Boys’ Love tag rank';

function headingFor(type: AniListMediaType): string {
  return type === 'ANIME' ? 'BL Anime' : 'BL Manga';
}

function browsePath(type: AniListMediaType): string {
  return type === 'ANIME' ? '/anime' : '/manga';
}

function boundedHeading(value: string): string {
  return value.length <= 78 ? value : `${value.slice(0, 77).trimEnd()}…`;
}

function MediaCard({ item }: { item: MediaTitle }) {
  const params = new URLSearchParams();
  if (item.isAdult) params.set('mature', '1');
  if ((item.boysLoveRank ?? 0) < DEFAULT_MINIMUM_BL_TAG_RANK) params.set('tagRank', 'all');
  const query = params.toString();
  const detailPath = `${browsePath(item.type)}/${item.id}${query ? `?${query}` : ''}`;
  return (
    <Link className="media-card" to={detailPath}>
      <div className="media-card-art">
        {item.coverImage
          ? <img src={item.coverImage} alt={`${item.displayTitle} cover`} loading="lazy" />
          : <div className="media-card-fallback"><Sparkles size={24} /><span>{headingFor(item.type)}</span></div>}
        <span className="media-rank" aria-label={`${rankCaption}: ${item.boysLoveRank ?? 'not reported'}`}>BL {item.boysLoveRank ?? '—'}</span>
        {item.isAdult && <span className="media-adult-badge">MATURE</span>}
      </div>
      <div className="media-card-copy">
        <h2 title={item.displayTitle}>{boundedHeading(item.displayTitle)}</h2>
        <p>{[item.format, item.startYear, item.status?.replaceAll('_', ' ')].filter(Boolean).join(' · ') || headingFor(item.type)}</p>
        {item.averageScore !== null && <span className="media-score">AniList score {item.averageScore}%</span>}
      </div>
    </Link>
  );
}

export function MediaSpotlightRail({ type, items }: { type: AniListMediaType; items: MediaTitle[] }) {
  if (items.length === 0) return null;
  return (
    <section className="media-spotlight content-section" aria-label={`Popular BL ${type === 'ANIME' ? 'Anime' : 'Manga'} titles`}>
      <div className="section-heading"><div><div className="eyebrow">ANILIST · BL TAGGED</div><h2>{type === 'ANIME' ? 'BL Anime to explore' : 'BL Manga to explore'}</h2></div><Link className="text-link" to={browsePath(type)}>See all <ArrowUpRight size={13} /></Link></div>
      <div className="media-spotlight-rail">{items.slice(0, 8).map((item) => <MediaCard item={item} key={item.id} />)}</div>
    </section>
  );
}

export function MediaCategoryCards() {
  return (
    <section className="media-category-section" aria-label="Browse Anime and Manga">
      <Link className="media-category-card media-category-anime" to="/anime">
        <span className="media-category-icon"><Tv size={21} /></span>
        <span className="eyebrow">ANILIST · LIVE BROWSING</span>
        <h2>BL Anime</h2>
        <p>Browse Boys’ Love anime from current releases to the back catalogue.</p>
        <span className="media-category-link">Explore anime <ArrowUpRight size={15} /></span>
      </Link>
      <Link className="media-category-card media-category-manga" to="/manga">
        <span className="media-category-icon"><BookOpen size={21} /></span>
        <span className="eyebrow">ANILIST · LIVE BROWSING</span>
        <h2>BL Manga</h2>
        <p>Find manga by title, release year and source-reported BL tag rank.</p>
        <span className="media-category-link">Explore manga <ArrowUpRight size={15} /></span>
      </Link>
    </section>
  );
}

export function MediaLibraryPage({ type }: { type: AniListMediaType }) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AniListSort>('POPULARITY_DESC');
  const [includeAdult, setIncludeAdult] = useState(false);
  const [minimumRank, setMinimumRank] = useState<AniListTagRankFilter>(DEFAULT_MINIMUM_BL_TAG_RANK);
  const [items, setItems] = useState<MediaTitle[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setItems([]);
    setPage(1);
    fetchMediaPage(type, 1, sort, query, controller.signal, includeAdult, minimumRank).then((result: MediaPageResponse) => {
      setItems(result.items);
      setPage(result.page);
      setHasNextPage(result.hasNextPage);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'The AniList catalog could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [type, sort, query, includeAdult, minimumRank, retryVersion]);

  async function loadMore() {
    if (loadingMore || !hasNextPage) return;
    setLoadingMore(true);
    setError('');
    try {
      const next = await fetchMediaPage(type, page + 1, sort, query, undefined, includeAdult, minimumRank);
      setItems((current) => [...current, ...next.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setPage(next.page);
      setHasNextPage(next.hasNextPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The next page could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }

  function changeSort(event: ChangeEvent<HTMLSelectElement>) {
    setSort(event.target.value as AniListSort);
  }

  function changeMinimumRank(event: ChangeEvent<HTMLSelectElement>) {
    setMinimumRank(event.target.value === String(ALL_ANI_LIST_TAG_RANKS) ? ALL_ANI_LIST_TAG_RANKS : DEFAULT_MINIMUM_BL_TAG_RANK);
  }

  return (
    <div className="media-library page-content">
      <header className="media-library-heading">
        <div className="eyebrow"><span className="live-indicator"><i /></span> ANILIST · BOYS’ LOVE TAG</div>
        <h1>{headingFor(type)}<span> discovery.</span></h1>
        <p>Search the live AniList index, browse recent or older releases, and open each title for source-tag details and available episode or chapter destinations.</p>
        <div className="media-attribution">Titles and cover art are supplied by AniList. Results are fetched as you browse, not stored. Tags and ranks are community-maintained metadata—not a verified BL score—and may be inaccurate or incomplete.</div>
      </header>

      <div className="media-controls">
        <label className="media-search"><Search size={17} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Search ${type === 'ANIME' ? 'anime' : 'manga'} titles`} aria-label={`Search ${type === 'ANIME' ? 'anime' : 'manga'} titles`} /></label>
        <label className="media-sort"><span>Order</span><select value={sort} onChange={changeSort}><option value="POPULARITY_DESC">Popular</option><option value="START_DATE_DESC">Newest first</option><option value="START_DATE">Oldest first</option></select></label>
      </div>
      <div className="media-filter-row">
        <label className="media-mature-toggle"><input type="checkbox" checked={includeAdult} onChange={(event) => setIncludeAdult(event.target.checked)} /><span>Include mature titles</span><small>Off by default · mature results are labeled</small></label>
        <label className="media-rank-filter"><span>BL tag rank</span><select value={minimumRank} onChange={changeMinimumRank} aria-label="Choose a minimum AniList Boys’ Love tag rank"><option value={DEFAULT_MINIMUM_BL_TAG_RANK}>Rank 70+ · default filter</option><option value={ALL_ANI_LIST_TAG_RANKS}>All AniList-tagged titles</option></select><small>Rank is source metadata and does not verify relevance.</small></label>
      </div>

      <div className="media-results-summary"><span>{loading ? 'Checking AniList…' : `${items.length.toLocaleString()} titles loaded`}</span><span> · </span><span>Page {page} · {minimumRank ? 'rank 70+ filter' : 'all AniList-tagged results'} · source results may be incomplete</span></div>
      {error && <div className="media-alert" role="alert"><CircleAlert size={17} /><span>{error}</span><button type="button" onClick={() => setRetryVersion((version) => version + 1)}>Retry</button></div>}
      {loading && items.length === 0 && <div className="media-loading"><LoaderCircle className="spin" size={24} /><span>Finding source-tagged titles…</span></div>}
      {!loading && !error && items.length === 0 && <div className="media-empty"><Search size={22} /><h2>No titles in this result.</h2><p>Try a different phrase or sort order. AniList’s Boys’ Love tagging is community-maintained and may not include every title.</p></div>}

      {items.length > 0 && <div className="media-grid">{items.map((item) => <MediaCard item={item} key={item.id} />)}</div>}
      {hasNextPage && <div className="media-more-wrap"><button className="button button-secondary media-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <LoaderCircle className="spin" size={16} /> : null}{loadingMore ? 'Loading more' : 'Load more titles'}</button></div>}
      <div className="media-source-footnote">Classification is based on AniList’s community <strong>Boys’ Love</strong> tag. Rank 70+ is the default filter; choose “All AniList-tagged titles” to broaden results. Tag rank is not a verified relevance score. Results may be incomplete or change as AniList is updated.</div>
    </div>
  );
}

function officialSearchUrl(site: string, title: string, chapterOrEpisode: number, type: AniListMediaType): string | null {
  const q = encodeURIComponent(`${title} ${type === 'ANIME' ? 'episode' : 'chapter'} ${chapterOrEpisode}`);
  const normalized = site.toLowerCase();
  if (type === 'ANIME' && normalized.includes('crunchyroll')) return `https://www.crunchyroll.com/search?q=${q}`;
  if (type === 'ANIME' && normalized.includes('netflix')) return `https://www.netflix.com/search?q=${q}`;
  if (type === 'ANIME' && normalized.includes('youtube')) return `https://www.youtube.com/results?search_query=${q}`;
  return null;
}

function EpisodeAndChapterPicker({ item }: { item: MediaTitle }) {
  const isAnime = item.type === 'ANIME';
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [number, setNumber] = useState(1);
  const direct = item.streamingEpisodes[selectedIndex];
  const platformActions = [...new Map(item.streamingLinks.map((link: StreamingLink) => {
    const searchUrl = officialSearchUrl(link.site, item.displayTitle, number, item.type);
    return [link.site, { site: link.site, url: searchUrl ?? link.url, search: Boolean(searchUrl) }] as const;
  })).values()];
  const maxNumber = isAnime ? item.episodes : item.chapters;
  const safeNumber = Number.isInteger(number) && number > 0 && (maxNumber === null || number <= maxNumber);

  return (
    <section className="episode-panel" aria-labelledby="episode-panel-title">
      <div className="episode-panel-heading"><div><div className="eyebrow">{isAnime ? 'EPISODE DESTINATIONS' : 'CHAPTER DESTINATIONS'}</div><h2 id="episode-panel-title">Choose where to continue.</h2></div><span className="episode-source-badge">AniList source</span></div>
      {isAnime && item.streamingEpisodes.length > 0 ? (
        <div className="episode-direct-block">
          <label className="episode-select-label" htmlFor="episode-select">Source-listed episodes</label>
          <div className="episode-control-row"><select id="episode-select" value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{item.streamingEpisodes.map((episode, index) => <option key={`${episode.url}-${index}`} value={index}>{episode.title}{episode.site ? ` · ${episode.site}` : ''}</option>)}</select>
            {direct && <a className="button button-primary" href={direct.url} target="_blank" rel="noopener noreferrer">Open selected episode <ArrowUpRight size={15} /></a>}</div>
          <p>These episode URLs are provided directly by AniList and are the only episode destinations shown as direct links.</p>
        </div>
      ) : (
        <div className="episode-search-block">
          <div className="episode-control-row"><label className="episode-number-label" htmlFor="chapter-episode-number">{isAnime ? 'Episode number' : 'Chapter number'}{maxNumber ? <span> of {maxNumber}</span> : null}<input id="chapter-episode-number" type="number" min="1" max={maxNumber ?? undefined} value={number} onChange={(event) => setNumber(Number(event.target.value))} /></label></div>
          <p>A direct {isAnime ? 'episode' : 'chapter'} URL is not supplied for this title. If AniList lists a {isAnime ? 'streaming' : 'reading'} service, use its verified search when supported or open its source-listed page and choose the number there. Search results do not confirm availability.</p>
          {platformActions.length > 0 && safeNumber ? <div className="episode-search-links">{platformActions.map((action) => <a className="watch-link" href={action.url} key={action.site} target="_blank" rel="noopener noreferrer"><span className="watch-platform-dot" /><span><strong>{action.search ? `Search ${action.site}` : `Open ${action.site} title page`}</strong><small>{isAnime ? `Episode ${number} · ${action.search ? 'search only' : 'select on service'}` : `Chapter ${number} · ${action.search ? 'search only' : 'select on service'}`}</small></span><ArrowUpRight size={16} /></a>)}</div> : <div className="episode-no-source"><CalendarDays size={17} /><span>{safeNumber ? 'AniList does not list a streaming destination for this title.' : `Enter a valid ${isAnime ? 'episode' : 'chapter'} number${maxNumber ? ` from 1 to ${maxNumber}` : ''}.`}</span></div>}
        </div>
      )}
      {item.streamingLinks.length > 0 && <div className="source-platforms"><div className="eyebrow">{isAnime ? 'SOURCE-LISTED STREAMING PAGES' : 'SOURCE-LISTED READING PAGES'}</div>{item.streamingLinks.map((link) => <a href={link.url} key={`${link.site}-${link.url}`} target="_blank" rel="noopener noreferrer">{link.site} {isAnime ? 'title page' : 'reading page'} <ArrowUpRight size={13} /></a>)}</div>}
    </section>
  );
}

export function MediaDetailPage({ type }: { type: AniListMediaType }) {
  const { id = '' } = useParams();
  const location = useLocation();
  const includeAdult = new URLSearchParams(location.search).get('mature') === '1';
  const minimumRank: AniListTagRankFilter = new URLSearchParams(location.search).get('tagRank') === 'all'
    ? ALL_ANI_LIST_TAG_RANKS
    : DEFAULT_MINIMUM_BL_TAG_RANK;
  const numericId = Number(id);
  const [item, setItem] = useState<MediaTitle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setItem(null);
    setError('');
    setLoading(true);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      setError('This title is not available in the AniList catalog.');
      setLoading(false);
      return () => controller.abort();
    }
    fetchMediaTitle(type, numericId, includeAdult, minimumRank, controller.signal).then((nextItem) => {
      if (!controller.signal.aborted) setItem(nextItem);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'This title could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [type, numericId, includeAdult, minimumRank]);

  useEffect(() => {
    applyPageMetadata(metadataForPath(location.pathname, undefined, item ?? undefined).metadata);
  }, [location.pathname, item?.id, item?.displayTitle, item?.description]);

  if (loading) return <div className="media-loading page-content"><LoaderCircle className="spin" size={24} /><span>Opening AniList title details…</span></div>;
  if (!item) return <div className="detail-missing page-content"><div className="empty-mark"><CircleAlert size={22} /></div><h1>{error || 'Title not found.'}</h1><Link className="button button-secondary" to={browsePath(type)}>Browse {headingFor(type)} <ArrowLeft size={16} /></Link></div>;

  return (
    <div className="media-detail page-content">
      <Link className="back-link" to={browsePath(type)}><ArrowLeft size={16} /> Back to {headingFor(type)}</Link>
      <section className="media-detail-hero">
        {item.bannerImage && <img className="media-detail-banner" src={item.bannerImage} alt="" />}
        <div className="media-detail-poster">{item.coverImage ? <img src={item.coverImage} alt={`${item.displayTitle} cover`} /> : <BookOpen size={34} />}</div>
        <div className="media-detail-copy"><div className="eyebrow">ANILIST · {item.type === 'ANIME' ? 'ANIME' : 'MANGA'} · BL TAG RANK {item.boysLoveRank ?? '—'}</div><h1 title={item.displayTitle}>{boundedHeading(item.displayTitle)}</h1><div className="media-detail-facts">{[item.format, item.startYear, item.status?.replaceAll('_', ' '), item.type === 'ANIME' && item.episodes ? `${item.episodes} episodes` : null, item.type === 'MANGA' && item.chapters ? `${item.chapters} chapters` : null, item.boysLoveRank !== null && item.boysLoveRank < DEFAULT_MINIMUM_BL_TAG_RANK ? 'Lower-rank community tag' : null, item.isAdult ? 'Mature content · AniList' : 'Not flagged mature · AniList'].filter(Boolean).map((fact) => <span key={fact}>{fact}</span>)}</div><p>{item.description || 'AniList has not provided a synopsis for this title.'}</p><a className="button button-secondary" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">View source details <ArrowUpRight size={15} /></a></div>
      </section>
      <div className="media-attribution media-detail-attribution">Title details, cover artwork, tags and any direct episode URLs are supplied by AniList. BL Pulse does not host episodes or chapters.</div>
      <EpisodeAndChapterPicker item={item} key={item.id} />
      <div className="media-source-footnote">The Boys’ Love tag and rank are community-maintained by AniList contributors. Links are only as current as the source data; check the platform before viewing.</div>
    </div>
  );
}
