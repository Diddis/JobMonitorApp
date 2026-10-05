import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Link, Router as WouterRouter, useLocation } from 'wouter';
import { useListJobSources, useSearchJobs } from '@workspace/api-client-react';
import type { JobListing, JobSearchInput, JobSearchResult, JobSource } from '@workspace/api-client-react';
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, ChevronDown, CircleAlert, Clock3, MapPin, Plus, RefreshCw, Rss, Search, Settings2, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const KEYS = { preferences: 'nordjobb.preferences.v1', profile: 'nordjobb.profile.v1', search: 'nordjobb.search.v1', searches: 'nordjobb.searches.v1', results: 'nordjobb.results.v1' };
type Preferences = { sourceIds: string[]; feeds: string[]; refreshMinutes: number; refreshScheduleVersion?: number };
type Profile = { skills: string[]; education: string };
type SavedSearch = { id: string; query: string; location: string };
type SearchCache = Record<string, JobSearchResult>;
const DEFAULT_PREFS: Preferences = { sourceIds: ['jobsearch', 'job-ad-links'], feeds: [], refreshMinutes: 60 };
const DEFAULT_PROFILE: Profile = { skills: [], education: '' };

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be unavailable. */ } }
function loadPreferences(): Preferences {
  const p = { ...DEFAULT_PREFS, ...read<Partial<Preferences>>(KEYS.preferences, {}) };
  if (p.refreshScheduleVersion === undefined) { p.refreshMinutes = p.refreshMinutes === 0 ? 60 : p.refreshMinutes; p.refreshScheduleVersion = 1; }
  return p;
}
function loadProfile(): Profile {
  const raw = read<Record<string, unknown>>(KEYS.profile, {});
  const education = typeof raw.education === 'string' ? raw.education : typeof (raw.evidence as Record<string, unknown> | undefined)?.education === 'string' ? (raw.evidence as Record<string, string>).education : '';
  const profile: Profile = { skills: Array.isArray(raw.skills) ? raw.skills.filter((x): x is string => typeof x === 'string') : [], education };
  save(KEYS.profile, profile);
  return profile;
}
function loadSearches(): SavedSearch[] {
  try {
    const stored = localStorage.getItem(KEYS.searches);
    if (stored) {
      const values = JSON.parse(stored);
      return Array.isArray(values) ? values.filter((x): x is SavedSearch => !!x && typeof x.id === 'string').map(x => ({ id: x.id, query: typeof x.query === 'string' ? x.query : '', location: typeof x.location === 'string' ? x.location : '' })) : [];
    }
    const legacy = read<Partial<SavedSearch>>(KEYS.search, {});
    const query = typeof legacy.query === 'string' ? legacy.query.trim() : '';
    const location = typeof legacy.location === 'string' ? legacy.location.trim() : '';
    return query || location ? [{ id: `search-${Date.now().toString(36)}`, query, location }] : [];
  } catch { return []; }
}
function dateLabel(value?: string | null) {
  if (!value) return 'Not stated';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-SE', { dateStyle: 'medium' }).format(date);
}
function timeLabel(value?: string) {
  if (!value) return 'Waiting for first refresh';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-SE', { hour: '2-digit', minute: '2-digit' }).format(date);
}
function words(value: string) { return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}+#.-]{2,}/gu) ?? [])]; }
const STOP = new Set('och eller med för från inom som har dig den det att av samt du din dina ett en är på till i the and or with from within that this for your you have has of to a an is are be as experience experienced erfarenhet kunskap kunskaper required years year års år'.split(' '));
function compareJob(job: JobListing, profile: Profile) {
  const listing = new Set(words([job.title, job.description, ...job.skills, ...job.requirements].join(' ')).filter(x => !STOP.has(x)));
  const terms = new Set([...profile.skills, profile.education].flatMap(words).filter(x => !STOP.has(x)));
  const overlap = [...terms].filter(x => listing.has(x));
  const requirements = (job.requirements.length ? job.requirements : job.skills).map(label => {
    const found = words(label).filter(x => terms.has(x) && !STOP.has(x));
    return { label, found };
  });
  const scored = requirements.length ? Math.round(requirements.filter(x => x.found.length).length / requirements.length * 100) : (terms.size ? Math.round(overlap.length / terms.size * 100) : 0);
  return { score: scored, overlap, requirements, hasProfile: terms.size > 0, basis: requirements.length ? 'criteria' : 'keyword overlap' };
}
type MergedJob = { key: string; job: JobListing; savedSearches: SavedSearch[] };
function listingKey(job: JobListing) {
  const url = job.sourceUrl.trim().replace(/\/+$/, '').toLowerCase();
  return url || [job.title, job.employer ?? '', job.location ?? ''].map(value => value.trim().toLowerCase()).join('|');
}
function mergeListings(first: JobListing, second: JobListing): JobListing {
  const preferred = first.contentDepth === 'full' || second.contentDepth !== 'full' ? first : second;
  const other = preferred === first ? second : first;
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  return {
    ...preferred,
    employer: preferred.employer || other.employer,
    location: preferred.location || other.location,
    sourceIds: unique([...first.sourceIds, ...second.sourceIds]),
    sourceNames: unique([...first.sourceNames, ...second.sourceNames]),
    sourceUrl: preferred.sourceUrl || other.sourceUrl,
    description: preferred.description || other.description,
    requirements: unique([...preferred.requirements, ...other.requirements]),
    skills: unique([...preferred.skills, ...other.skills]),
    experienceRequirement: preferred.experienceRequirement || other.experienceRequirement,
    publishedAt: preferred.publishedAt || other.publishedAt,
    deadline: preferred.deadline || other.deadline,
    employmentType: preferred.employmentType || other.employmentType,
  };
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const active = location === '/' ? 'search' : location.slice(1);
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark">n</span><span><span className="brand-name">nordjobb</span><span className="brand-note">your work, in view</span></span></Link>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        <Link href="/" className={`nav-link ${active === 'search' ? 'active' : ''}`} data-testid="link-search"><Search size={17} />Job matches</Link>
        <Link href="/settings" className={`nav-link ${active === 'settings' ? 'active' : ''}`} data-testid="link-settings"><Settings2 size={17} />Search settings</Link>
        <Link href="/profile" className={`nav-link ${active === 'profile' ? 'active' : ''}`} data-testid="link-profile"><UserRound size={17} />Your profile</Link>
      </nav>
      <div className="side-bottom"><div className="privacy-note"><span className="privacy-dot" />Your profile stays on this device. It is never sent with a job search.</div></div>
    </aside>
    <main className="main-area"><div className="content">{children}</div></main>
  </div>;
}
function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="page-head"><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-intro">{children}</p></div>;
}

function HomePage() {
  const sourceQuery = useListJobSources();
  const searchMutation = useSearchJobs();
  const [prefs] = useState(loadPreferences);
  const [profile] = useState(loadProfile);
  const [searches] = useState(loadSearches);
  const [cache, setCache] = useState<SearchCache>(() => read(KEYS.results, {}));
  const [states, setStates] = useState<Record<string, 'loading' | 'error'>>({});
  const [sourceError, setSourceError] = useState('');
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(() => new Set());
  const searchRef = useRef(searches);
  const prefsRef = useRef(prefs);
  const mutateRef = useRef(searchMutation.mutateAsync);
  const flights = useRef(new Set<string>());
  const ran = useRef(false);
  searchRef.current = searches; prefsRef.current = prefs; mutateRef.current = searchMutation.mutateAsync;

  const runSearch = async (item: SavedSearch) => {
    if (flights.current.has(item.id)) return;
    flights.current.add(item.id);
    const config = prefsRef.current;
    const sourceIds = [...config.sourceIds];
    if (config.feeds.length && !sourceIds.includes('custom-feed')) sourceIds.push('custom-feed');
    if (!sourceIds.length) { setSourceError('Choose at least one job source in Search settings.'); setStates(s => ({ ...s, [item.id]: 'error' })); flights.current.delete(item.id); return; }
    setSourceError('');
    setStates(s => ({ ...s, [item.id]: 'loading' }));
    const input: JobSearchInput = { query: item.query.trim() || undefined, location: item.location.trim() || undefined, sourceIds: sourceIds as JobSearchInput['sourceIds'], customFeedUrls: config.feeds, limit: 30 };
    try {
      const result = await mutateRef.current({ data: input });
      if (!searchRef.current.some(s => s.id === item.id)) return;
      setCache(old => ({ ...old, [item.id]: result }));
      setStates(old => { const next = { ...old }; delete next[item.id]; return next; });
    } catch { if (searchRef.current.some(s => s.id === item.id)) setStates(old => ({ ...old, [item.id]: 'error' })); }
    finally { flights.current.delete(item.id); }
  };
  const runAll = () => searchRef.current.forEach(item => { void runSearch(item); });
  useEffect(() => { save(KEYS.results, cache); }, [cache]);
  useEffect(() => {
    if (!ran.current) { ran.current = true; runAll(); }
    const visible = () => { if (document.visibilityState === 'visible') runAll(); };
    document.addEventListener('visibilitychange', visible);
    const timer = prefs.refreshMinutes > 0 ? window.setInterval(runAll, prefs.refreshMinutes * 60_000) : undefined;
    return () => { if (timer) window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [prefs.refreshMinutes]);
  useEffect(() => { save(KEYS.searches, searches); }, [searches]);

  const merged = new Map<string, MergedJob>();
  for (const search of searches) {
    for (const job of cache[search.id]?.jobs ?? []) {
      const key = listingKey(job);
      const existing = merged.get(key);
      if (existing) {
        existing.job = mergeListings(existing.job, job);
        if (!existing.savedSearches.some(item => item.id === search.id)) existing.savedSearches.push(search);
      } else {
        merged.set(key, { key, job, savedSearches: [search] });
      }
    }
  }
  const allJobs = [...merged.values()].sort((a, b) => {
    const aDate = a.job.publishedAt ? Date.parse(a.job.publishedAt) : 0;
    const bDate = b.job.publishedAt ? Date.parse(b.job.publishedAt) : 0;
    return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
  });
  const pendingCount = searches.filter(search => states[search.id] === 'loading').length;
  const failedSearches = searches.filter(search => states[search.id] === 'error');
  const failedSources = [...new Set(searches.flatMap(search => (cache[search.id]?.sources ?? [])
    .filter(source => source.status === 'failed')
    .map(source => `${source.name}${source.message ? `: ${source.message}` : ''}`)))];

  return <>
    <div className="matches-page-head">
      <h1 className="page-title">Your matches</h1>
      <div className="matches-page-actions">
        <div className="results-meta" data-testid="text-last-refreshed">{searches.length ? `${allJobs.length} unique ${allJobs.length === 1 ? 'posting' : 'postings'} across ${searches.length} saved ${searches.length === 1 ? 'search' : 'searches'} · ${prefs.refreshMinutes ? `checks every ${prefs.refreshMinutes} min` : 'manual refresh'}` : 'No saved searches yet'}</div>
        {pendingCount > 0 && <span className="refresh-state"><RefreshCw size={13} className="refresh-turn" />Checking {pendingCount}</span>}
        {searches.length > 0 && <button type="button" className="button quiet small" onClick={runAll} data-testid="button-refresh"><RefreshCw size={14} />Refresh all</button>}
      </div>
    </div>
    <section aria-label="All job postings">
      {sourceError && <div className="alert" role="alert" data-testid="status-search-config">{sourceError} <Link href="/settings" className="inline-link">Open settings</Link></div>}
      {failedSearches.length > 0 && <div className="alert partial" role="status" data-testid="status-search-errors"><CircleAlert size={15} />Could not refresh: {failedSearches.map(search => [search.query, search.location].filter(Boolean).join(' · ') || 'Broad search').join('; ')}. Cached postings remain visible where available.</div>}
      {failedSources.length > 0 && <div className="alert partial" role="status" data-testid="status-source-errors"><CircleAlert size={15} />Some sources could not return results: {failedSources.slice(0, 3).join(' · ')}{failedSources.length > 3 ? ` · and ${failedSources.length - 3} more` : ''}</div>}
      {!searches.length && <div className="panel state-box"><div className="empty-symbol"><Search size={19} /></div><h3>Your searches will appear here.</h3><p>Add a job title and location in Search settings. New opportunities will be gathered automatically while Nordjobb is open.</p><Link href="/settings" className="button">Set up a search</Link></div>}
      {searches.length > 0 && allJobs.length === 0 && pendingCount > 0 && <div className="panel loading-lines" aria-label="Loading job postings"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" style={{ width: '72%' }} /></div>}
      {searches.length > 0 && allJobs.length === 0 && pendingCount === 0 && <div className="panel state-box"><div className="empty-symbol"><BriefcaseBusiness size={19} /></div><h3>No postings yet.</h3><p>Results from all your saved searches will appear together here.</p><button className="button quiet small" onClick={runAll}>Try again</button></div>}
      {allJobs.length > 0 && <div className="job-list">{allJobs.map(({ key, job, savedSearches }, index) => {
        const comparison = compareJob(job, profile);
        const isExpanded = expandedJobs.has(key);
        const detailId = `job-details-${index}`;
        return <article className={`panel job-card ${isExpanded ? 'expanded' : ''}`} key={key} data-testid={`card-job-${index}`} style={{ animationDelay: `${Math.min(index * 45, 300)}ms` }}>
          <button className="job-card-toggle" type="button" aria-expanded={isExpanded} aria-controls={detailId} aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${job.title}`} onClick={() => setExpandedJobs(current => { const next = new Set(current); isExpanded ? next.delete(key) : next.add(key); return next; })}>
            <span className="job-top"><span className="job-heading-copy"><span className="job-title" role="heading" aria-level={2}>{job.title}</span><span className="job-company">{job.employer || 'Employer not listed'}</span></span><span className="job-expand-cue">{isExpanded ? 'Hide details' : 'View details'}<ChevronDown size={15} aria-hidden="true" /></span></span>
            <span className="job-preview">{job.description || 'No description is available from this source.'}</span>
            <span className="job-meta">{job.location && <span><MapPin size={13} />{job.location}</span>}{job.employmentType && <span><BriefcaseBusiness size={13} />{job.employmentType}</span>}{job.publishedAt && <span><CalendarDays size={13} />Published {dateLabel(job.publishedAt)}</span>}<span><Clock3 size={13} />Deadline {dateLabel(job.deadline)}</span></span>
          </button>
          <div id={detailId} className="job-expanded" hidden={!isExpanded}>
            <section className="matched-searches" aria-label="Saved search criteria connected to this posting">
              <h3>Saved search criteria</h3>
              <div className="criteria-list">{savedSearches.map(search => {
                const query = search.query.trim(), location = search.location.trim();
                return <span className="criteria-chip" key={search.id}><Search size={13} aria-hidden="true" />{[query || (location ? '' : 'Broad search'), location].filter(Boolean).join(' · ')}</span>;
              })}</div>
            </section>
            <div className="expanded-job-meta"><div className="match-score" title="Compared locally with your skills and education"><b>{comparison.score}%</b><span>{comparison.basis}</span></div><span className="results-meta">Compared on this device using your skills and education.</span></div>
            <div className="expanded-description"><h3>Job description</h3><p className="job-description">{job.description || 'No description is available from this source.'}</p></div>
            {job.skills.length > 0 && <div className="tag-row" aria-label="Listing skills">{job.skills.slice(0, 8).map((skill, i) => <span className={`tag ${comparison.overlap.includes(skill.toLocaleLowerCase()) ? 'matched' : ''}`} key={`${skill}-${i}`}>{skill}</span>)}</div>}
            {profile.skills.length > 0 || profile.education ? <div className="results-meta comparison-line" data-testid={`text-comparison-${index}`}>{comparison.overlap.length ? `In common: ${comparison.overlap.slice(0, 6).join(', ')}` : 'No profile terms found in this listing'} · compared on this device</div> : null}
            {comparison.requirements.length > 0 && <div className="requirement-breakdown" data-testid={`list-requirements-${index}`}><h4>Requirement check <span>{comparison.requirements.filter(x => x.found.length).length} of {comparison.requirements.length} found</span></h4><div className="requirement-list">{comparison.requirements.slice(0, 8).map((item, i) => <div className={`requirement-item ${item.found.length ? 'matched' : ''}`} key={`${item.label}-${i}`} data-testid={`requirement-${index}-${i}`}><span className="requirement-mark">{item.found.length ? '✓' : '—'}</span><span className="requirement-text">{item.label}{item.found.length > 0 && <small>Profile terms: {item.found.slice(0, 4).join(', ')}</small>}</span><span className="requirement-status">{!comparison.hasProfile ? 'Add profile details' : item.found.length ? 'Found in profile' : 'Not found in profile'}</span></div>)}</div><p className="requirement-note">A keyword overlap is a clue, not a verdict. Review the full listing.</p></div>}
            {comparison.requirements.length === 0 && <p className="requirement-note">{job.contentDepth === 'excerpt' ? 'This listing is an excerpt; requirements may not be included.' : 'No structured requirements were found.'} Review the original listing.</p>}
            <div className="job-foot"><span className="source-label">{job.sourceNames.join(' · ') || 'Job source'} · {job.contentDepth === 'full' ? 'Full description' : 'Excerpt'}</span><a className="job-link" href={job.sourceUrl} target="_blank" rel="noreferrer noopener" data-testid={`link-original-job-${index}`}>Original listing <ArrowUpRight size={14} /></a></div>
          </div>
        </article>;
      })}</div>}
    </section>
    {sourceQuery.isError && <div className="quiet-footnote">Source status is temporarily unavailable. <button className="inline-button" onClick={() => sourceQuery.refetch()}>Retry</button></div>}
  </>;
}

function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [skill, setSkill] = useState('');
  useEffect(() => { save(KEYS.profile, { skills: profile.skills, education: profile.education }); }, [profile]);
  const addSkill = (e: FormEvent) => {
    e.preventDefault(); const value = skill.trim();
    if (value && !profile.skills.some(x => x.toLocaleLowerCase() === value.toLocaleLowerCase())) setProfile(p => ({ ...p, skills: [...p.skills, value] }));
    setSkill('');
  };
  return <>
    <PageHeader eyebrow="Private, and kept here" title="Your profile">Add the skills and education you want to compare with listings. This information stays in your browser and is never included in a search request.</PageHeader>
    <section className="panel profile-main profile-single">
      <div className="profile-section-head"><div><h2 className="section-title">Skills</h2><p className="section-copy">Use the words you want to see reflected in your next role.</p></div><span className="local-badge"><ShieldCheck size={14} />Stored locally</span></div>
      <form className="skill-edit" onSubmit={addSkill}><input className="control" aria-label="Add a skill" placeholder="Add a skill or keyword" value={skill} onChange={e => setSkill(e.target.value)} data-testid="input-add-skill" /><button className="button" type="submit" disabled={!skill.trim()} data-testid="button-add-skill"><Plus size={15} />Add skill</button></form>
      <div className="skill-list" data-testid="list-profile-skills">{profile.skills.map((item, index) => <span className="skill-chip" key={`${item}-${index}`}>{item}<button className="icon-action" type="button" aria-label={`Remove ${item}`} onClick={() => setProfile(p => ({ ...p, skills: p.skills.filter((_, i) => i !== index) }))} data-testid={`button-remove-skill-${index}`}><X size={13} /></button></span>)}{!profile.skills.length && <span className="hint">No skills yet. Add a few to see useful overlap on matches.</span>}</div>
      <div className="education-block"><h2 className="section-title">Education</h2><p className="section-copy">Studies, certifications, licences or training that matter to your search.</p><textarea className="control education-input" aria-label="Education" placeholder="For example: Bachelor of Nursing, Uppsala University, 2021" value={profile.education} onChange={e => setProfile(p => ({ ...p, education: e.target.value }))} data-testid="textarea-education" /></div>
      <div className="privacy-strip"><ShieldCheck size={17} /><span><strong>Only skills and education are used for match comparisons.</strong><br />They remain on this device and are not sent to job sources.</span></div>
    </section>
  </>;
}

function SettingsPage() {
  const sourceQuery = useListJobSources();
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [searches, setSearches] = useState<SavedSearch[]>(loadSearches);
  const [draft, setDraft] = useState({ query: '', location: '' });
  const [feed, setFeed] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { save(KEYS.preferences, prefs); }, [prefs]);
  useEffect(() => { save(KEYS.searches, searches); }, [searches]);
  const addSearch = (e: FormEvent) => {
    e.preventDefault();
    const query = draft.query.trim(), location = draft.location.trim();
    if (!query && !location) { setError('Add a job title, keyword or location.'); return; }
    setSearches(s => [...s, { id: `search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, query, location }]);
    setDraft({ query: '', location: '' }); setError('');
  };
  const removeSearch = (item: SavedSearch) => {
    const name = [item.query, item.location].filter(Boolean).join(' · ') || 'this search';
    if (!window.confirm(`Remove “${name}” and its cached results?`)) return;
    setSearches(s => s.filter(x => x.id !== item.id));
    const results = read<SearchCache>(KEYS.results, {}); delete results[item.id]; save(KEYS.results, results);
  };
  const addFeed = (e: FormEvent) => {
    e.preventDefault();
    try {
      const url = new URL(feed.trim());
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      if (prefs.feeds.includes(feed.trim())) { setError('That feed is already saved.'); return; }
      if (prefs.feeds.length >= 10) { setError('You can add up to 10 feeds.'); return; }
      setPrefs(p => ({ ...p, feeds: [...p.feeds, feed.trim()] })); setFeed(''); setError('');
    } catch { setError('Enter a valid http or https RSS / Atom feed URL.'); }
  };
  const intervals = [{ value: 0, label: 'Manual only' }, { value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hour' }, { value: 240, label: '4 hours' }];
  const sources = (sourceQuery.data ?? []) as JobSource[];
  return <>
    <PageHeader eyebrow="A few useful defaults" title="Search settings">Save the roles you care about. Choose shared sources and a refresh rhythm; Nordjobb checks only while the app is open.</PageHeader>
    <section className="panel settings-section"><div className="settings-heading"><span className="section-index">01</span><div><h2>Saved searches</h2><p>Each saved search gathers its own matches. Your source choices apply to all.</p></div></div>
      {searches.map((item, i) => <div className="saved-setting" key={item.id} data-testid={`row-saved-search-${item.id}`}><div className="saved-number">{String(i + 1).padStart(2, '0')}</div><div className="saved-setting-copy"><strong>{[item.query, item.location].filter(Boolean).join(' · ') || 'Broad search'}</strong><small>{item.query || 'Any role'}{item.location ? ` · ${item.location}` : ''}</small></div><button className="icon-action delete-action" type="button" aria-label={`Remove search ${item.query || item.location}`} onClick={() => removeSearch(item)} data-testid={`button-remove-search-${item.id}`}><Trash2 size={15} /></button></div>)}
      {!searches.length && <div className="inline-empty">No saved searches yet. Start with a role, a place, or both.</div>}
      <form className="add-search-form" onSubmit={addSearch}><div className="field"><label htmlFor="saved-query">Job title or keywords</label><input id="saved-query" className="control" maxLength={200} placeholder="e.g. sjuksköterska, product designer" value={draft.query} onChange={e => setDraft(d => ({ ...d, query: e.target.value }))} data-testid="input-search-query" /></div><div className="field"><label htmlFor="saved-location">Location</label><input id="saved-location" className="control" maxLength={120} placeholder="e.g. Göteborg, Skåne" value={draft.location} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} data-testid="input-search-location" /></div><button className="button add-search-button" type="submit" data-testid="button-search"><Plus size={15} />Save search</button></form>
      {error && <div className="alert" role="alert" data-testid="status-settings-error">{error}</div>}
    </section>
    <section className="panel settings-section"><div className="settings-heading"><span className="section-index">02</span><div><h2>Job sources</h2><p>Shared by each of your saved searches.</p></div></div>
      {sourceQuery.isLoading && <div className="loading-lines"><div className="skeleton" /><div className="skeleton" /></div>}
      {sourceQuery.isError && <div className="alert" role="alert" data-testid="status-sources-error">Could not load sources. <button className="inline-button" onClick={() => sourceQuery.refetch()} data-testid="button-retry-settings-sources">Try again</button></div>}
      {sources.map(source => <label className="source-setting" key={source.id}><span><strong>{source.name}</strong><small>{source.description}{source.contentNote ? ` ${source.contentNote}` : ''}</small></span><input className="switch" type="checkbox" aria-label={`Select ${source.name}`} checked={prefs.sourceIds.includes(source.id)} onChange={e => setPrefs(p => ({ ...p, sourceIds: e.target.checked ? [...new Set([...p.sourceIds, source.id])] : p.sourceIds.filter(id => id !== source.id) }))} data-testid={`toggle-settings-source-${source.id}`} /></label>)}
      {!sourceQuery.isLoading && !sourceQuery.isError && !sources.length && <div className="inline-empty">No job sources are available right now.</div>}
    </section>
    <section className="panel settings-section"><div className="settings-heading"><span className="section-index">03</span><div><h2>RSS &amp; Atom feeds</h2><p>Include up to ten feeds from organisations and job boards you trust.</p></div></div>
      <form className="feed-add" onSubmit={addFeed}><input className="control" aria-label="Feed URL" placeholder="https://organisation.se/jobs/feed.xml" value={feed} onChange={e => setFeed(e.target.value)} data-testid="input-feed-url" /><button className="button secondary" type="submit" data-testid="button-add-feed"><Plus size={15} />Add feed</button></form>
      {prefs.feeds.map((url, i) => <div className="feed-item" key={url}><span><Rss size={14} />{url}</span><button className="icon-action" type="button" aria-label={`Remove feed ${url}`} onClick={() => setPrefs(p => ({ ...p, feeds: p.feeds.filter((_, index) => index !== i) }))} data-testid={`button-remove-feed-${i}`}><Trash2 size={14} /></button></div>)}
      {!prefs.feeds.length && <div className="inline-empty">No custom feeds added. Built-in sources work independently.</div>}
    </section>
    <section className="panel settings-section"><div className="settings-heading"><span className="section-index">04</span><div><h2>Refresh schedule</h2><p>Automatic checks happen on this device while Nordjobb is open.</p></div></div>
      <div className="radio-row" role="radiogroup" aria-label="Automatic refresh interval">{intervals.map(choice => <label className="radio-option" key={choice.value}><input type="radio" name="refresh-interval" value={choice.value} checked={prefs.refreshMinutes === choice.value} onChange={() => setPrefs(p => ({ ...p, refreshMinutes: choice.value, refreshScheduleVersion: 1 }))} data-testid={`radio-refresh-${choice.value}`} /><span>{choice.label}</span></label>)}</div>
      <div className="footnote"><Clock3 size={14} />{prefs.refreshMinutes ? `Checks every ${prefs.refreshMinutes} minutes while the app is open. Returning to a visible tab also refreshes.` : 'Manual refresh only.'}</div>
    </section>
    <div className="quiet-footnote"><ShieldCheck size={14} />Searches, profile details and settings are stored locally in this browser.</div>
  </>;
}

function Router() {
  return <AppShell><Switch><Route path="/" component={HomePage} /><Route path="/profile" component={ProfilePage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></AppShell>;
}
function App() { return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>; }
export default App;
