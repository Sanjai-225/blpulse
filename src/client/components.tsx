import { useState, type CSSProperties, type FormEvent, type ReactNode, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, Radio, RefreshCw, Search } from 'lucide-react';
import type { Series, SeriesStatus } from '../shared/types';

const MARK_URL = '/manus-storage/async-images/eZkOacWV3Quk6YVrhNnzv9/image-2.webp';
export function Header({
  refreshing,
  onRefresh,
  lastRefreshed,
  refreshAvailable,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  lastRefreshed: string | null;
  refreshAvailable: boolean;
}) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refreshAvailable) return;
    const value = query.trim();
    navigate(value ? `/discover?q=${encodeURIComponent(value)}` : '/discover');
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" aria-label="BL Pulse home">
          <span className="brand-mark"><img src={MARK_URL} alt="" /></span>
          <span className="brand-name">BL<span>PULSE</span></span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <NavLink to="/discover" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Live action</NavLink>
          <NavLink to="/anime" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Anime</NavLink>
          <NavLink to="/manga" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Manga</NavLink>
        </nav>
        <div className="topbar-actions">
          <form className="header-search" onSubmit={submit} role="search">
            <Search size={16} aria-hidden="true" />
            <input aria-label="Search live-action BL series" disabled={!refreshAvailable} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={refreshAvailable ? 'Search live action…' : 'Search after TMDB setup'} />
            {query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </form>
          {refreshAvailable
            ? <button className={`refresh-button ${refreshing ? 'is-refreshing' : ''}`} onClick={onRefresh} disabled={refreshing} title={lastRefreshed ? `Last refreshed ${new Date(lastRefreshed).toLocaleString()}` : 'Refresh from source'} aria-label="Refresh catalog from source"><RefreshCw size={17} /><span>{refreshing ? 'Syncing' : 'Sync'}</span></button>
            : <span className="refresh-pending"><Radio size={14} /> TMDB setup pending</span>}
        </div>
      </div>
    </header>
  );
}

const statusLabel: Record<SeriesStatus, string> = {
  airing: 'Airing now',
  upcoming: 'Coming soon',
  completed: 'Completed',
};

export function StatusPill({ status, compact = false }: { status: SeriesStatus; compact?: boolean }) {
  return <span className={`status-pill status-${status} ${compact ? 'compact' : ''}`}><i />{statusLabel[status]}</span>;
}

function titleHue(title: string): number {
  return title.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
}

export function SeriesCard({ series }: { series: Series }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hue = titleHue(series.title);
  const hueStyle = { '--poster-hue': `${hue}deg` } as CSSProperties;
  return (
    <Link className="series-card" to={`/series/${encodeURIComponent(series.id)}`} style={hueStyle}>
      <div className={`poster-art ${series.coverUrl && !imageFailed ? 'has-art' : 'generated-art'}`}>
        {series.coverUrl && !imageFailed
          ? <img src={series.coverUrl} alt={`${series.title} source artwork`} loading="lazy" onError={() => setImageFailed(true)} />
          : <div className="poster-fallback"><span className="poster-orbit" /><span className="poster-country">{series.country}</span><strong>{series.title}</strong><span className="poster-edition">A BL PULSE PICK</span></div>}
        <div className="poster-shade" />
        <div className="poster-badges"><StatusPill status={series.status} compact /></div>
        <div className="poster-caption">
          <div className="poster-country-label">{series.country}</div>
          <h3>{series.title}</h3>
          {series.platforms.length > 0 && <div className="poster-platforms">{series.platforms.slice(0, 2).map((platform) => <span key={platform.name}>{platform.name}</span>)}</div>}
        </div>
        <span className="poster-open"><ArrowUpRight size={16} /></span>
      </div>
    </Link>
  );
}

export function SeriesRail({ title, eyebrow, series, action }: { title: string; eyebrow?: string; series: Series[]; action?: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  function scroll(direction: number) {
    rail.current?.scrollBy({ left: direction * 620, behavior: 'smooth' });
  }
  if (series.length === 0) return null;
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2>{title}</h2>
        </div>
        <div className="section-tools">
          {action}
          <button className="rail-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}><ArrowLeft size={17} /></button>
          <button className="rail-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}><ArrowRight size={17} /></button>
        </div>
      </div>
      <div className="series-rail" ref={rail}>
        {series.map((item) => <SeriesCard key={item.id} series={item} />)}
      </div>
    </section>
  );
}

export function Freshness({ lastRefreshed, sourceOnline }: { lastRefreshed: string | null; sourceOnline: boolean }) {
  const date = lastRefreshed ? new Date(lastRefreshed) : null;
  return (
    <div className="freshness-strip">
      <span className={`signal-dot ${sourceOnline ? '' : 'offline'}`}><i /></span>
      <span>{sourceOnline ? 'Source signal live' : lastRefreshed ? 'Showing last saved catalog' : 'Live-action source setup pending'}</span>
      <span className="freshness-divider" />
      <span>{date ? `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : sourceOnline ? 'No refresh timestamp recorded' : 'Connect TMDB to enable live-action listings'}</span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <Link className="footer-brand" to="/"><span className="footer-pulse"><Radio size={16} /></span> BL PULSE</Link>
      <p>Find the story. Follow the source. Watch on the platform.</p>
      <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer">Anime &amp; manga data: AniList</a>
      <span className="footer-note">BL Pulse is an independent discovery guide. Availability varies by region; titles, cover art and source links are credited to their providers.</span>
    </footer>
  );
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="text-link" to={to}>{children}<ChevronRight size={16} /></Link>;
}
