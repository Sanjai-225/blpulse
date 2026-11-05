import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, Filter, Globe2, LoaderCircle, Radio, Sparkles, Tv, WandSparkles } from 'lucide-react';
import { DEFAULT_MINIMUM_BL_TAG_RANK, type MediaTitle } from '../shared/media';
import type { CatalogResponse, Series, SeriesStatus } from '../shared/types';
import { metadataForPath } from '../shared/seo';
import { fetchCatalog, fetchMediaPage, fetchSeries, refreshCatalog as requestRefresh } from './api';
import { Footer, Freshness, Header, SectionLink, SeriesCard, SeriesRail, StatusPill } from './components';
import { applyPageMetadata } from './seo';
import { MediaCategoryCards, MediaDetailPage, MediaLibraryPage, MediaSpotlightRail } from './MediaPages';

const emptyCatalog: CatalogResponse = {
  series: [], lastRefreshed: null, lastChecked: null, sourceOnline: false, refreshing: false, editorial: null,
};

function timeLabel(value: string | null): string {
  if (!value) return 'Waiting for first sync';
  const date = new Date(value);
  return `Last synced ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

interface HeroArtwork {
  url: string;
  title: string;
  label: 'Live action' | 'Anime' | 'Manga';
  path: string;
}

function App() {
  const location = useLocation();
  const [catalog, setCatalog] = useState<CatalogResponse>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const detailId = location.pathname.match(/^\/series\/([^/]+)\/?$/)?.[1];
  const routeSeries = detailId ? catalog.series.find((item) => item.id === decodeURIComponent(detailId)) : undefined;
  const pageSeo = metadataForPath(location.pathname, routeSeries).metadata;

  useEffect(() => {
    if (/^\/(?:anime|manga)\/\d+\/?$/.test(location.pathname)) return;
    applyPageMetadata(pageSeo);
  }, [pageSeo.title, pageSeo.description, pageSeo.canonicalPath, pageSeo.image, pageSeo.noindex, pageSeo.keywords.join(',')]);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    let remainingPolls = 24;
    async function load() {
      try {
        const next = await fetchCatalog();
        if (!active) return;
        setCatalog(next);
        if (next.refreshing && remainingPolls > 0) {
          remainingPolls -= 1;
          timeoutId = window.setTimeout(() => { void load(); }, 2_500);
        }
      } catch {
        if (active) setNotice('We could not reach the catalog source. Try syncing again in a moment.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  async function sync() {
    if (refreshBusy) return;
    setRefreshBusy(true);
    setNotice('');
    try {
      const next = await requestRefresh();
      setCatalog(next);
      setNotice('Live-action catalog updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The latest source could not be reached.');
      try { setCatalog(await fetchCatalog()); } catch { /* retain current catalog */ }
    } finally {
      setRefreshBusy(false);
    }
  }

  function updateOne(updated: Series) {
    setCatalog((current) => ({ ...current, series: current.series.map((item) => item.id === updated.id ? updated : item) }));
  }

  const status: CatalogResponse = { ...catalog, refreshing: refreshBusy };
  return (
    <div className="app-shell">
      <Header refreshing={status.refreshing} onRefresh={sync} lastRefreshed={catalog.lastRefreshed} refreshAvailable={Boolean(catalog.sourceOnline || catalog.lastChecked || catalog.series.length)} />
      {notice && <div className={`notice-bar ${notice.includes('could not') || notice.includes('couldn’t') || notice.includes('not reach') ? 'notice-error' : ''}`} role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
      <main>
        <Routes>
          <Route path="/" element={<HomePage catalog={status} loading={loading} />} />
          <Route path="/discover" element={<DiscoverPage catalog={status} loading={loading} />} />
          <Route path="/series/:id" element={<SeriesPage catalog={status} updateOne={updateOne} />} />
          <Route path="/anime" element={<MediaLibraryPage type="ANIME" />} />
          <Route path="/anime/:id" element={<MediaDetailPage type="ANIME" />} />
          <Route path="/manga" element={<MediaLibraryPage type="MANGA" />} />
          <Route path="/manga/:id" element={<MediaDetailPage type="MANGA" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function HomePage({ catalog, loading }: { catalog: CatalogResponse; loading: boolean }) {
  const airing = catalog.series.filter((item) => item.status === 'airing');
  const upcoming = catalog.series.filter((item) => item.status === 'upcoming');
  const completed = catalog.series.filter((item) => item.status === 'completed');
  const featured = airing[0] ?? upcoming[0] ?? completed[0];
  const [animePicks, setAnimePicks] = useState<MediaTitle[]>([]);
  const [mangaPicks, setMangaPicks] = useState<MediaTitle[]>([]);
  const [failedArt, setFailedArt] = useState<string[]>([]);
  const [rotationIndex, setRotationIndex] = useState(() => Math.floor(Math.random() * 10_000));
  const [rotationStarted, setRotationStarted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchMediaPage('ANIME', 1, 'POPULARITY_DESC', '', controller.signal, false, DEFAULT_MINIMUM_BL_TAG_RANK),
      fetchMediaPage('MANGA', 1, 'POPULARITY_DESC', '', controller.signal, false, DEFAULT_MINIMUM_BL_TAG_RANK),
    ]).then(([anime, manga]) => {
      if (controller.signal.aborted) return;
      setAnimePicks(anime.items);
      setMangaPicks(manga.items);
    }).catch(() => {
      // Keep the original generated hero artwork if AniList is temporarily unavailable.
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let rotationTimer: number | undefined;
    const openingTimer = window.setTimeout(() => {
      setRotationStarted(true);
      rotationTimer = window.setInterval(() => setRotationIndex((index) => index + 1), 8_000);
    }, 8_000);
    return () => {
      window.clearTimeout(openingTimer);
      if (rotationTimer !== undefined) window.clearInterval(rotationTimer);
    };
  }, []);

  const heroArt = useMemo(() => {
    if (!rotationStarted) return null;
    const candidates: HeroArtwork[] = [
      ...catalog.series.flatMap((item) => item.coverUrl ? [{ url: item.coverUrl, title: item.title, label: 'Live action' as const, path: `/series/${item.id}` }] : []),
      ...animePicks.flatMap((item) => item.bannerImage || item.coverImage ? [{ url: item.bannerImage || item.coverImage!, title: item.displayTitle, label: 'Anime' as const, path: `/anime/${item.id}` }] : []),
      ...mangaPicks.flatMap((item) => item.bannerImage || item.coverImage ? [{ url: item.bannerImage || item.coverImage!, title: item.displayTitle, label: 'Manga' as const, path: `/manga/${item.id}` }] : []),
    ].filter((item, index, all) => !failedArt.includes(item.url) && all.findIndex((candidate) => candidate.url === item.url) === index);
    return candidates.length ? candidates[rotationIndex % candidates.length] : null;
  }, [animePicks, catalog.series, failedArt, mangaPicks, rotationIndex, rotationStarted]);

  return (
    <>
      <section className="hero">
        {heroArt && <div className="hero-dynamic-backdrop" key={heroArt.url}><img src={heroArt.url} alt="" onError={() => setFailedArt((current) => [...current, heroArt.url])} /></div>}
        <div className="hero-glow" />
        <div className="hero-content">
          <Freshness lastRefreshed={catalog.lastRefreshed} sourceOnline={catalog.sourceOnline} />
          <div className="hero-kicker"><span className="kicker-icon"><Radio size={14} /></span> STORIES WORTH STAYING UP FOR</div>
          <h1>Your next story<br /><span>starts here.</span></h1>
          <p className="hero-copy">Explore BL series, anime and manga — then follow source-backed links to your next story.</p>
          {featured && <div className="hero-feature"><span className="hero-feature-line" /><div><span className="hero-feature-label">ON THE SIGNAL</span><strong>{featured.title}</strong><span className="hero-feature-meta">{featured.country} <span>·</span> {featured.status === 'airing' ? 'Airing now' : featured.status === 'upcoming' ? 'Coming soon' : 'Completed'}</span></div></div>}
          <div className="hero-actions">
            <Link className="button button-primary" to={featured ? `/series/${featured.id}` : '/discover'}><Sparkles size={17} /> Explore the story</Link>
            <Link className="button button-secondary" to="/discover"><BookOpen size={17} /> Browse all series</Link>
          </div>
          <div className="hero-footnote"><span className="pulse-mini" /> {catalog.series.length ? `${catalog.series.length.toLocaleString()} live-action series` : catalog.sourceOnline ? 'Live-action catalog connected' : 'AniList browsing is live'} <span className="footnote-divider">/</span> {catalog.lastRefreshed ? timeLabel(catalog.lastRefreshed) : 'Live-action source setup pending'}</div>
        </div>
        <div className="hero-side-note"><span>THE</span><span>BL</span><span>COLLECTION</span></div>
        {heroArt && <div className="hero-art-credit"><span>IN THE ROTATION · {heroArt.label.toUpperCase()}</span><Link to={heroArt.path}>{heroArt.title} <ArrowUpRight size={12} /></Link></div>}
        <div className="hero-bottom-fade" />
      </section>

      <div className="page-content">
        <div className="catalog-intro">
          <div className="intro-copy"><div className="eyebrow">THE CATALOG</div><h2>Find the feeling.<br /><em>Follow the story.</em></h2></div>
          <p>BL Anime and Manga browse AniList live. Live-action discovery is paused until its licensed data connection is configured.</p>
        </div>
        <MediaCategoryCards />
        <MediaSpotlightRail type="ANIME" items={animePicks} />
        <MediaSpotlightRail type="MANGA" items={mangaPicks} />
        {loading && catalog.sourceOnline && catalog.series.length === 0 && <LoadingState label="Finding the latest stories" />}
        {!loading && catalog.series.length === 0 && <EmptyState />}
        <SeriesRail title="Happening now" eyebrow="CURRENTLY AIRING" series={airing.slice(0, 24)} action={<SectionLink to="/discover?status=airing">See all</SectionLink>} />
        <SeriesRail title="On the horizon" eyebrow="UPCOMING" series={upcoming.slice(0, 24)} action={<SectionLink to="/discover?status=upcoming">See all</SectionLink>} />
        {catalog.editorial && <EditorialCard post={catalog.editorial} />}
        <SeriesRail title="A story for every mood" eyebrow="COMPLETED SERIES" series={completed.slice(0, 24)} action={<SectionLink to="/discover?status=completed">Explore archive</SectionLink>} />
        <div className="source-note"><span className="source-note-icon"><Radio size={16} /></span><p><strong>Source-first, without the guesswork.</strong> Anime and Manga data is credited to AniList. Live-action provider availability will appear after the licensed TMDB connection is configured.</p><Link className="text-link" to="/anime">Explore Anime <ArrowUpRight size={15} /></Link></div>
      </div>
    </>
  );
}

function EditorialCard({ post }: { post: NonNullable<CatalogResponse['editorial']> }) {
  return (
    <section className="editorial-card">
      <div className="editorial-icon"><WandSparkles size={20} /></div>
      <div className="editorial-content"><div className="eyebrow">A NOTE FROM THE SIGNAL <span className="editorial-source">{post.source === 'AI-assisted' ? 'AI · SOURCE-GROUNDED' : 'CATALOG PICK'}</span></div><h2>{post.title}</h2><p>{post.body}</p></div>
      <span className="editorial-decoration">✳</span>
    </section>
  );
}

function DiscoverPage({ catalog, loading }: { catalog: CatalogResponse; loading: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [country, setCountry] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [genre, setGenre] = useState('all');
  const [year, setYear] = useState('all');
  const [sort, setSort] = useState('featured');

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
    setStatus(searchParams.get('status') ?? 'all');
  }, [searchParams]);

  const countries = useMemo(() => [...new Set(catalog.series.map((item) => item.country))].sort(), [catalog.series]);
  const platforms = useMemo(() => [...new Set(catalog.series.flatMap((item) => item.platforms.map((link) => link.name)))].sort(), [catalog.series]);
  const genres = useMemo(() => [...new Set(catalog.series.flatMap((item) => item.genres))].sort(), [catalog.series]);
  const years = useMemo(() => [...new Set(catalog.series.map((item) => item.year).filter((item): item is number => typeof item === 'number'))].sort((a, b) => b - a), [catalog.series]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = catalog.series.filter((item) => {
      const matchesText = !normalized || [item.title, item.country, item.year, ...item.genres, ...item.platforms.map((link) => link.name)].join(' ').toLowerCase().includes(normalized);
      const matchesStatus = status === 'all' || item.status === status;
      const matchesCountry = country === 'all' || item.country === country;
      const matchesPlatform = platform === 'all' || item.platforms.some((link) => link.name === platform);
      const matchesGenre = genre === 'all' || item.genres.includes(genre);
      const matchesYear = year === 'all' || String(item.year ?? '') === year;
      return matchesText && matchesStatus && matchesCountry && matchesPlatform && matchesGenre && matchesYear;
    });
    if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'country') items.sort((a, b) => a.country.localeCompare(b.country) || a.title.localeCompare(b.title));
    if (sort === 'newest') items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
    return items;
  }, [catalog.series, query, status, country, platform, genre, year, sort]);

  function chooseStatus(value: string) {
    setStatus(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status'); else next.set('status', value);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setQuery(''); setCountry('all'); setPlatform('all'); setGenre('all'); setYear('all'); setSort('featured'); chooseStatus('all');
  }

  return (
    <div className="discover-page page-content">
      <div className="discover-heading"><div className="eyebrow"><span className="live-indicator"><i /></span> LIVE-ACTION DISCOVERY</div><h1>Find your <em>next story.</em></h1><p>The live-action catalog is waiting for its licensed TMDB connection. Anime and Manga browsing is available now.</p><Freshness lastRefreshed={catalog.lastRefreshed} sourceOnline={catalog.sourceOnline} /></div>
      <div className="filters-panel">
        <div className="filter-search"><Filter size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, countries, years, platforms" aria-label="Search all series" /></div>
        <div className="filter-selects">
          <label><span>Status</span><select value={status} onChange={(event) => chooseStatus(event.target.value)}><option value="all">All statuses</option><option value="airing">Airing now</option><option value="upcoming">Coming soon</option><option value="completed">Completed</option></select></label>
          <label><span>Country</span><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Platform</span><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">All known platforms</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Source tag</span><select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="all">All source tags</option>{genres.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Year</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Source order</option><option value="title">Title A–Z</option><option value="country">Country</option><option value="newest">Latest source year</option></select></label>
        </div>
        <p className="filter-hint">Platform, source-tag and year filters use details fetched so far. Open a card to retrieve that title’s latest guide, year, and direct watch links.</p>
      </div>
      <div className="results-line"><div><strong>{filtered.length.toLocaleString()}</strong> {filtered.length === 1 ? 'series' : 'series'}<span> · </span><span>{status === 'all' ? 'All statuses' : status === 'airing' ? 'Airing now' : status === 'upcoming' ? 'Coming soon' : 'Completed'}</span></div><button className="clear-filters" onClick={clearFilters}>Clear filters</button></div>
      {loading && catalog.sourceOnline && catalog.series.length === 0 ? <LoadingState label="Loading the source catalog" /> : filtered.length > 0 ? <div className="discover-grid">{filtered.map((item) => <SeriesCard key={item.id} series={item} />)}</div> : !catalog.sourceOnline && catalog.series.length === 0 ? <EmptyState /> : <div className="empty-results"><div className="empty-mark"><Filter size={21} /></div><h2>No series match these filters.</h2><p>Try another title, country, platform, or category.</p><button className="button button-secondary" onClick={clearFilters}>Reset discovery filters</button></div>}
      {!catalog.sourceOnline && catalog.series.length > 0 && <div className="stale-banner"><Radio size={16} /><span>The live-action source is offline. Showing only the last saved TMDB catalog snapshot.</span></div>}
    </div>
  );
}

function SeriesPage({ catalog, updateOne }: { catalog: CatalogResponse; updateOne: (series: Series) => void }) {
  const { id = '' } = useParams();
  const cached = catalog.series.find((item) => item.id === id);
  const [series, setSeries] = useState<Series | undefined>(cached);
  const [loading, setLoading] = useState(!cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSeries(cached);
    setLoading(true);
    setFailed(false);
    fetchSeries(id).then((detail) => {
      if (active) { setSeries(detail); updateOne(detail); }
    }).catch(() => {
      if (active && !cached) setFailed(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, cached?.detailFetchedAt]);

  if (loading && !series) return <LoadingState label="Opening the source guide" />;
  if (!series) return <div className="detail-missing page-content"><div className="empty-mark"><BookOpen size={22} /></div><h1>{failed ? 'This series is not in the live catalog.' : 'Series not found.'}</h1><Link className="button button-secondary" to="/discover"><ArrowLeft size={16} /> Back to discovery</Link></div>;

  return (
    <div className="detail-page">
      <section className="detail-hero">
        <div className="detail-hero-image" style={series.coverUrl ? { backgroundImage: `linear-gradient(90deg, rgba(9,8,13,.99) 0%, rgba(9,8,13,.9) 36%, rgba(9,8,13,.38) 72%, rgba(9,8,13,.45) 100%), url("${series.coverUrl}")` } : undefined} />
        <div className="detail-hero-content">
          <Link className="back-link" to="/discover"><ArrowLeft size={16} /> Back to discovery</Link>
          <div className="detail-kicker"><StatusPill status={series.status} /> <span className="detail-country"><Globe2 size={14} /> {series.country}</span></div>
          <h1>{series.title}</h1>
          <div className="detail-tags">{series.genres.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
          <p className="detail-synopsis">{series.synopsis ?? 'No synopsis is available from the current live-action data source.'}</p>
          <div className="detail-actions">
            <a className="button button-primary" href={series.platforms[0]?.url ?? series.sourceUrl} target="_blank" rel="noopener noreferrer"><Tv size={17} /> {series.platforms.length ? `Open ${series.platforms[0].name}` : 'Open source guide'} <ArrowUpRight size={16} /></a>
            <a className="button button-secondary" href={series.sourceUrl} target="_blank" rel="noopener noreferrer"><BookOpen size={17} /> Full source details</a>
          </div>
        </div>
      </section>
      <div className="detail-body page-content">
        <div className="detail-info-card"><div className="eyebrow">AT A GLANCE</div><div className="detail-facts"><div><span>STATUS</span><strong>{series.status === 'airing' ? 'Airing now' : series.status === 'upcoming' ? 'Coming soon' : 'Completed'}</strong></div><div><span>COUNTRY</span><strong>{series.country}</strong></div><div><span>YEAR / RELEASE</span><strong>{series.releaseDate ?? (series.year ? String(series.year) : 'Not listed')}</strong></div><div><span>SOURCE TAGS</span><strong>{series.genres.length ? series.genres.slice(0, 2).join(' · ') : 'Not listed'}</strong></div></div></div>
        <section className="watch-panel"><div className="watch-panel-heading"><div><div className="eyebrow">WHERE TO WATCH</div><h2>Follow the signal.</h2></div><span className="source-verified"><Radio size={14} /> Provider links</span></div><p className="watch-disclaimer">Provider availability can change by region and time. BL Pulse does not host episodes.</p>
          {series.platforms.length ? <div className="watch-links">{series.platforms.map((item) => <a className="watch-link" key={item.name} href={item.url} target="_blank" rel="noopener noreferrer"><span className="watch-platform-dot" /><span><strong>{item.name}</strong><small>Open provider destination</small></span><ArrowUpRight size={17} /></a>)}</div> : <div className="no-watch-links"><Tv size={18} /><div><strong>No provider link is available yet.</strong><p>A platform destination will appear only when it is returned by a source.</p></div></div>}
        </section>
        <div className="source-card"><span className="source-card-mark"><Radio size={18} /></span><div><div className="eyebrow">SOURCE & FRESHNESS</div><p>Title details and provider links are shown only when returned by a configured source.</p><a href={series.sourceUrl} target="_blank" rel="noopener noreferrer">View source details <ArrowUpRight size={14} /></a><small>Catalog snapshot {timeLabel(catalog.lastRefreshed).replace('Last synced ', '')}</small></div></div>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="loading-state"><LoaderCircle size={25} className="spin" /><span>{label}</span><small>Checking the connected catalog source</small></div>;
}

function EmptyState() {
  return <div className="empty-results empty-catalog"><div className="empty-mark"><Radio size={22} /></div><h2>Live-action is waiting on its source.</h2><p>Connect the licensed TMDB data source to populate this section. Anime and Manga are already browsable from AniList.</p><div className="empty-actions"><Link className="button button-secondary" to="/anime">Browse BL Anime</Link><Link className="button button-secondary" to="/manga">Browse BL Manga</Link></div></div>;
}

function NotFound() {
  return <div className="detail-missing page-content"><div className="empty-mark"><CalendarDays size={22} /></div><h1>Page not on the signal.</h1><Link className="button button-secondary" to="/">Back to BL Pulse</Link></div>;
}

export default App;
