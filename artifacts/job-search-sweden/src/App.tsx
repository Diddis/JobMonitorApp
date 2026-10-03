import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Link, Router as WouterRouter, useLocation } from 'wouter';
import { useImportResume, useListJobSources, useSearchJobs } from '@workspace/api-client-react';
import type { JobListing, JobSearchResult, JobSource } from '@workspace/api-client-react';
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Check, CircleAlert, Clock3,
  ExternalLink, FileText, MapPin, Plus, RefreshCw, Rss, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Upload, UserRound, X,
} from 'lucide-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const KEYS = {
  preferences: 'nordjobb.preferences.v1',
  profile: 'nordjobb.profile.v1',
  search: 'nordjobb.search.v1',
  searches: 'nordjobb.searches.v1',
  results: 'nordjobb.results.v1',
};

type Preferences = { sourceIds: string[]; feeds: string[]; refreshMinutes: number; refreshScheduleVersion?: number };
type Profile = { skills: string[]; evidence: Record<string, string>; cvText: string; filename: string };
type SearchForm = { query: string; location: string };
type SavedSearch = { id: string; query: string; location: string };
type SearchCache = Record<string, JobSearchResult>;
const DEFAULT_PREFS: Preferences = { sourceIds: ['jobsearch', 'job-ad-links'], feeds: [], refreshMinutes: 60 };
const DEFAULT_PROFILE: Profile = { skills: [], evidence: { experience: '', education: '', preferences: '' }, cvText: '', filename: '' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } as T : fallback;
  } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}
function loadPreferences(): Preferences {
  const preferences = load(KEYS.preferences, DEFAULT_PREFS);
  if (preferences.refreshScheduleVersion === undefined) {
    return {
      ...preferences,
      refreshMinutes: preferences.refreshMinutes === 0 ? DEFAULT_PREFS.refreshMinutes : preferences.refreshMinutes,
      refreshScheduleVersion: 1,
    };
  }
  return preferences;
}
function initialSavedSearches(): SavedSearch[] {
  try {
    const existing = localStorage.getItem(KEYS.searches);
    if (existing) {
      const parsed = JSON.parse(existing);
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string').map(item => ({
        id: item.id, query: typeof item.query === 'string' ? item.query : '', location: typeof item.location === 'string' ? item.location : '',
      })) : [];
    }
    const legacy = JSON.parse(localStorage.getItem(KEYS.search) || '{}') as Partial<SearchForm>;
    const query = typeof legacy.query === 'string' ? legacy.query.trim() : '';
    const location = typeof legacy.location === 'string' ? legacy.location.trim() : '';
    const migrated = query || location ? [{ id: `search-${Date.now().toString(36)}`, query, location }] : [];
    return migrated;
  } catch { return []; }
}
function prettyDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-SE', { dateStyle: 'medium' }).format(date);
}
function timeSince(value?: string) {
  if (!value) return 'No search run yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `Last checked ${value}`;
  return `Last checked ${new Intl.DateTimeFormat('en-SE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
}
function tokens(value: string) {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}+#.-]{2,}/gu) ?? [])];
}
const COMPARISON_STOP_WORDS = new Set([
  'och', 'eller', 'med', 'för', 'från', 'inom', 'som', 'har', 'dig', 'den', 'det', 'att', 'av',
  'och', 'samt', 'du', 'din', 'dina', 'ett', 'en', 'är', 'på', 'till', 'i', 'the', 'and', 'or',
  'with', 'from', 'within', 'that', 'this', 'for', 'your', 'you', 'have', 'has', 'of', 'to',
  'a', 'an', 'is', 'are', 'be', 'as', 'experience', 'experienced', 'erfarenhet', 'kunskap',
  'kunskaper', 'goda', 'god', 'relevant', 'krav', 'required', 'years', 'year', 'års', 'år',
  'cirka', 'minst', 'stark', 'starkt', 'strong', 'good', 'ability', 'förmåga',
]);
function meaningfulTokens(value: string) {
  return tokens(value).filter(word => !COMPARISON_STOP_WORDS.has(word) && !/^\d+$/.test(word));
}
function compareJob(job: JobListing, profile: Profile) {
  const listingWords = new Set(meaningfulTokens([job.title, job.description, ...job.skills, ...job.requirements].join(' ')));
  const profileWords = new Set([...profile.skills, ...Object.values(profile.evidence).join(' ').split(/[,\n]/)].flatMap(meaningfulTokens));
  const matches = [...profileWords].filter(word => listingWords.has(word));
  const requirementText = job.requirements.length ? job.requirements : job.skills;
  const requirements = requirementText.map(label => {
    const matchedTerms = meaningfulTokens(label).filter(word => profileWords.has(word));
    return { label, matched: matchedTerms.length > 0, matchedTerms };
  });
  const requirementMatches = requirements.filter(item => item.matched).length;
  const keywordOverlap = profileWords.size ? Math.round((matches.length / profileWords.size) * 100) : 0;
  const score = requirements.length ? Math.round((requirementMatches / requirements.length) * 100) : keywordOverlap;
  return { matches, requirements, score, scoreBasis: requirements.length ? 'requirements' : 'keywords', hasProfile: profileWords.size > 0 };
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const current = location === '/' ? 'search' : location.replace('/', '');
  return <div className="app-frame">
    <aside className="sidebar">
      <Link href="/" className="brand" data-testid="link-home">
        <span className="brand-mark">n</span>
        <span><span className="brand-name">nordjobb</span><span className="brand-note">your work, in view</span></span>
      </Link>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        <Link href="/" className={`nav-link ${current === 'search' ? 'active' : ''}`} data-testid="link-search"><Search size={17} /> Job matches</Link>
        <Link href="/profile" className={`nav-link ${current === 'profile' ? 'active' : ''}`} data-testid="link-profile"><UserRound size={17} /> Your profile</Link>
        <Link href="/settings" className={`nav-link ${current === 'settings' ? 'active' : ''}`} data-testid="link-settings"><Settings2 size={17} /> Search settings</Link>
      </nav>
      <div className="side-bottom">
        <div className="privacy-note"><span className="privacy-dot" />Your profile stays on this device. It is never sent with a job search.</div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="crumb">SWEDEN <span aria-hidden="true">/</span> PERSONAL SEARCH</div>
        <div className="top-status"><span className="dot" /> A quieter way to look</div>
      </header>
      <div className="content">{children}</div>
    </main>
  </div>;
}

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="page-head"><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-intro">{children}</p></div>;
}

function HomePage() {
  const sourcesQuery = useListJobSources();
  const searchMutation = useSearchJobs();
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [profile] = useState<Profile>(() => load(KEYS.profile, DEFAULT_PROFILE));
  const [searches, setSearches] = useState<SavedSearch[]>(initialSavedSearches);
  const [cache, setCache] = useState<SearchCache>(() => load(KEYS.results, {}));
  const [draft, setDraft] = useState<SearchForm>({ query: '', location: '' });
  const [searchStates, setSearchStates] = useState<Record<string, 'loading' | 'error'>>({});
  const [sourceError, setSourceError] = useState('');
  const prefsRef = useRef(prefs);
  const searchesRef = useRef(searches);
  const mutationRef = useRef(searchMutation.mutateAsync);
  const didInitialRun = useRef(false);
  const inFlightSearches = useRef(new Set<string>());
  const sourceConfigKey = JSON.stringify([prefs.sourceIds, prefs.feeds]);
  const sourceConfigRef = useRef(sourceConfigKey);
  const sources = (sourcesQuery.data ?? []) as JobSource[];

  prefsRef.current = prefs;
  searchesRef.current = searches;
  mutationRef.current = searchMutation.mutateAsync;

  const runSearch = async (search: SavedSearch) => {
    if (inFlightSearches.current.has(search.id)) return;
    inFlightSearches.current.add(search.id);
    const currentPrefs = prefsRef.current;
    const sourceIds = [...currentPrefs.sourceIds];
    if (currentPrefs.feeds.length && !sourceIds.includes('custom-feed')) sourceIds.push('custom-feed');
    if (!sourceIds.length) {
      setSourceError('Choose at least one source in Search settings before searching.');
      setSearchStates(old => ({ ...old, [search.id]: 'error' }));
      inFlightSearches.current.delete(search.id);
      return;
    }
    setSourceError('');
    setSearchStates(old => ({ ...old, [search.id]: 'loading' }));
    try {
      const result = await mutationRef.current({ data: {
        query: search.query.trim() || undefined,
        location: search.location.trim() || undefined,
      sourceIds: sourceIds as ('jobsearch' | 'job-ad-links' | 'custom-feed')[],
      customFeedUrls: currentPrefs.feeds,
      limit: 30,
      } });
      if (!searchesRef.current.some(item => item.id === search.id)) return;
      setCache(old => {
        const next = { ...old, [search.id]: result };
        return next;
      });
      setSearchStates(old => { const next = { ...old }; delete next[search.id]; return next; });
    } catch {
      if (searchesRef.current.some(item => item.id === search.id)) setSearchStates(old => ({ ...old, [search.id]: 'error' }));
    } finally {
      inFlightSearches.current.delete(search.id);
    }
  };
  const runAllSearches = () => searchesRef.current.forEach(search => { void runSearch(search); });

  useEffect(() => {
    save(KEYS.preferences, prefs);
  }, [prefs]);
  useEffect(() => { save(KEYS.searches, searches); }, [searches]);
  useEffect(() => { save(KEYS.results, cache); }, [cache]);
  useEffect(() => {
    if (!didInitialRun.current) {
      didInitialRun.current = true;
      runAllSearches();
    }
    const onVisible = () => { if (document.visibilityState === 'visible') runAllSearches(); };
    document.addEventListener('visibilitychange', onVisible);
    if (prefs.refreshMinutes > 0) {
      const timer = window.setInterval(runAllSearches, prefs.refreshMinutes * 60_000);
      return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    }
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [prefs.refreshMinutes]);
  useEffect(() => {
    if (sourceConfigRef.current !== sourceConfigKey) {
      sourceConfigRef.current = sourceConfigKey;
      runAllSearches();
    }
  }, [sourceConfigKey]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = draft.query.trim();
    const location = draft.location.trim();
    if (!query && !location) return;
    const search = { id: `search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, query, location };
    setSearches(old => [...old, search]);
    searchesRef.current = [...searchesRef.current, search];
    setDraft({ query: '', location: '' });
    void runSearch(search);
  };
  const removeSearch = (search: SavedSearch) => {
    if (!window.confirm(`Remove “${search.query || search.location}” and its cached results?`)) return;
    setSearches(old => old.filter(item => item.id !== search.id));
    searchesRef.current = searchesRef.current.filter(item => item.id !== search.id);
    setCache(old => {
      const next = { ...old }; delete next[search.id]; return next;
    });
    setSearchStates(old => { const next = { ...old }; delete next[search.id]; return next; });
  };

  return <>
    <PageHeader eyebrow="Your searches, already at work" title="A little closer to the right role.">Your saved searches gather fresh Swedish opportunities here. Matches stay on this device between visits, and your profile comparisons happen locally.</PageHeader>
    <section className="saved-results" aria-label="Saved search results">
      <div className="results-head results-head-main">
        <div><h2>Your matches</h2><div className="results-meta" data-testid="text-last-refreshed">{searches.length ? `${searches.length} saved ${searches.length === 1 ? 'search' : 'searches'} · ${prefs.refreshMinutes ? `refreshes every ${prefs.refreshMinutes} min` : 'manual refresh'}` : 'Add a search below to start gathering matches'}</div></div>
        {searches.length > 0 && <button type="button" className="button quiet small" onClick={runAllSearches} data-testid="button-refresh"><RefreshCw size={14} />Refresh all</button>}
      </div>
      {sourceError && <div className="alert" role="alert" data-testid="status-search-config">{sourceError}</div>}
      {!searches.length && <div className="panel state-box"><div className="upload-icon" style={{ margin: '0 auto' }}><Sparkles size={19} /></div><h3>Your first search sets the rhythm.</h3><p>Add a role, a place, or both below. Your latest matches will be ready here when you return.</p></div>}
      {searches.map((search, searchIndex) => {
        const result = cache[search.id];
        const matched = result?.jobs.map(job => ({ job, comparison: compareJob(job, profile) })) ?? [];
        const sourceStatus = result?.sources ?? [];
        const failedSources = sourceStatus.filter(source => source.status === 'failed');
        const label = [search.query, search.location].filter(Boolean).join(' · ') || 'Broad search';
        return <section className="search-result-group" key={search.id} data-testid={`group-search-${search.id}`}>
          <div className="saved-search-heading">
            <div><div className="eyebrow">SAVED SEARCH {String(searchIndex + 1).padStart(2, '0')}</div><h3>{label}</h3><div className="results-meta" data-testid={`text-search-refreshed-${search.id}`}>{result ? `${result.jobs.length} opportunities · ${timeSince(result.refreshedAt)}` : searchStates[search.id] === 'loading' ? 'First search in progress' : 'No cached results yet'}</div></div>
            <div className="saved-search-actions">
              {searchStates[search.id] === 'loading' && <span className="refresh-state"><RefreshCw size={13} className="refresh-turn" /> Updating</span>}
              <button type="button" className="button quiet small" onClick={() => void runSearch(search)} data-testid={`button-refresh-search-${search.id}`}><RefreshCw size={13} />Refresh</button>
              <button type="button" className="icon-action remove-search" aria-label={`Remove search ${label}`} onClick={() => removeSearch(search)} data-testid={`button-remove-search-${search.id}`}><Trash2 size={14} /></button>
            </div>
          </div>
          {searchStates[search.id] === 'error' && <div className="alert partial" role="status" data-testid={`status-search-error-${search.id}`}>{result ? 'This refresh could not finish. Your last successful results are still here.' : 'This search could not be completed. Check your connection and try again.'}</div>}
          {result?.partial && <div className="alert partial" role="status" data-testid={`status-partial-results-${search.id}`}><CircleAlert size={15} />Some sources did not return results. Available matches are shown below.</div>}
          {failedSources.map((source, index) => <div className="alert partial" key={`${source.sourceId}-${index}`} data-testid={`status-source-failure-${search.id}-${source.sourceId}`}><strong>{source.name}:</strong> {source.message || 'This source could not be reached.'}</div>)}
          {result && sourceStatus.length > 0 && <div className="results-meta source-summary" data-testid={`text-source-summary-${search.id}`}>{sourceStatus.map(s => `${s.name}: ${s.status === 'success' ? `${s.resultCount} found` : s.status}`).join(' · ')}</div>}
          {!result && searchStates[search.id] === 'loading' && <div className="panel loading-lines" aria-label={`Loading matches for ${label}`}><div className="skeleton" /><div className="skeleton" style={{ width: '75%' }} /><div className="skeleton" style={{ width: '91%' }} /></div>}
          {result && !matched.length && <div className="panel state-box"><BriefcaseBusiness size={23} /><h3>No matches in this refresh.</h3><p>Try broadening this search or including another source in settings.</p></div>}
          <div className="job-list">
        {matched.map(({ job, comparison }, index) => <article className="panel job-card" key={`${job.id}-${index}`} data-testid={`card-job-${search.id}-${job.id}`} style={{ animationDelay: `${Math.min(index * 45, 300)}ms` }}>
          <div className="job-top"><div><h3 className="job-title">{job.title}</h3><div className="job-company">{job.employer || 'Employer not listed'}</div></div><div className="match-score" title="Compared locally against the requirements provided by the source, or keyword overlap when those requirements are unavailable."><b>{comparison.score}%</b> {comparison.scoreBasis === 'requirements' ? 'requirements' : 'keyword overlap'}</div></div>
          <div className="job-meta">
            {job.location && <span><MapPin size={13} />{job.location}</span>}
            {job.employmentType && <span><BriefcaseBusiness size={13} />{job.employmentType}</span>}
            {job.publishedAt && <span><CalendarDays size={13} />Published {prettyDate(job.publishedAt)}</span>}
            <span><Clock3 size={13} />Deadline: {job.deadline ? prettyDate(job.deadline) : 'Not stated'}</span>
          </div>
          <p className="job-description">{job.description}</p>
          {job.skills.length > 0 && <div className="tag-row" aria-label="Skills and keyword comparison">{job.skills.slice(0, 9).map((skill, i) => <span className={`tag ${comparison.matches.some(match => match === skill.toLowerCase()) ? 'matched' : ''}`} key={`${skill}-${i}`} title={comparison.matches.some(match => match === skill.toLowerCase()) ? 'Also present in your profile' : 'Keyword from listing'}>{skill}</span>)}</div>}
          {profile.skills.length > 0 && <div className="results-meta" style={{ marginTop: 10 }} data-testid={`text-comparison-${search.id}-${job.id}`}>{comparison.matches.length ? `In common: ${comparison.matches.slice(0, 6).join(', ')}` : 'No profile keywords found in this listing.'} · Browser comparison</div>}
          {comparison.requirements.length > 0 ? <div className="requirement-breakdown" data-testid={`list-requirements-${search.id}-${job.id}`}>
            <h4>Requirement check <span>{comparison.requirements.filter(item => item.matched).length} of {comparison.requirements.length} found</span></h4>
            <div className="requirement-list">
              {comparison.requirements.slice(0, 8).map((item, requirementIndex) => <div className={`requirement-item ${item.matched ? 'matched' : ''}`} key={`${item.label}-${requirementIndex}`} data-testid={`requirement-${search.id}-${job.id}-${requirementIndex}`}>
                <span className="requirement-mark" aria-hidden="true">{item.matched ? '✓' : '—'}</span>
                <span className="requirement-text">{item.label}{item.matched && item.matchedTerms.length > 0 && <small>Profile terms: {item.matchedTerms.slice(0, 4).join(', ')}</small>}</span>
                <span className="requirement-status">{!comparison.hasProfile ? 'Add profile details' : item.matched ? 'Found in profile' : 'Not found in profile'}</span>
              </div>)}
            </div>
            {comparison.requirements.length > 8 && <p className="requirement-note">Showing 8 of {comparison.requirements.length} listed requirements.</p>}
            <p className="requirement-note">Keyword matches are a clue, not a verdict. Review the original listing for context.</p>
          </div> : <p className="requirement-note" data-testid={`text-requirements-unavailable-${search.id}-${job.id}`}>{job.contentDepth === 'excerpt' ? 'This source provides an excerpt; requirements may not be included.' : 'No structured requirements were found in this listing text.'} Review the original listing for its criteria.</p>}
          <div className="job-foot"><span className="source-label">{job.sourceNames.join(' · ') || 'Job source'}{job.contentDepth === 'full' ? ' · Full description' : ' · Excerpt'}</span><a className="job-link" href={job.sourceUrl} target="_blank" rel="noreferrer noopener" data-testid={`link-original-job-${search.id}-${job.id}`}>Original listing <ExternalLink size={13} /></a></div>
        </article>)}
          </div>
        </section>;
      })}
    </section>
    <section className="panel search-panel add-search-panel">
      <div className="panel-heading"><div><div className="eyebrow">{searches.length ? 'ADD ANOTHER SEARCH' : 'START YOUR SEARCHES'}</div><h2 className="panel-title">{searches.length ? 'Keep another possibility close.' : 'Set up your first saved search.'}</h2><p className="panel-sub">Each search uses your shared source and feed settings.</p></div><div className="add-search-mark"><Plus size={17} /></div></div>
      <form onSubmit={onSubmit}>
        <div className="field-grid">
          <div className="field"><label htmlFor="search-query">Role or keywords</label><input id="search-query" className="control" data-testid="input-search-query" maxLength={200} placeholder="e.g. service designer, fysioterapeut" value={draft.query} onChange={e => setDraft({ ...draft, query: e.target.value })} /></div>
          <div className="field"><label htmlFor="search-location">Location</label><input id="search-location" className="control" data-testid="input-search-location" maxLength={120} placeholder="e.g. Malmö, remote, Västra Götaland" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></div>
        </div>
        <div className="search-actions"><span className="hint">Only these keywords, location, and chosen sources are sent when searching.</span><button className="button" type="submit" data-testid="button-search" disabled={!draft.query.trim() && !draft.location.trim()}><Plus size={15} />Save &amp; find matches</button></div>
      </form>
    </section>
    <aside className="panel sidebar-panel home-source-panel">
      <div className="source-panel-head"><div><div className="eyebrow">SHARED ACROSS SEARCHES</div><h2 className="side-panel-title">Sources in your searches</h2></div><Link href="/settings" className="job-link" data-testid="link-edit-sources">Manage <ArrowRight size={12} /></Link></div>
      {sourcesQuery.isLoading && <div className="loading-lines" aria-label="Loading sources"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}
      {sourcesQuery.isError && <div className="alert" role="alert"><CircleAlert size={14} /> Sources could not load. <button className="job-link" onClick={() => sourcesQuery.refetch()} data-testid="button-retry-sources">Try again</button></div>}
      {sources.map(source => <label className="source-row switch-label" key={source.id}>
        <span><span className="source-name">{source.name}</span><span className="source-desc">{source.description}</span></span>
        <input className="switch" type="checkbox" aria-label={`Include ${source.name}`} data-testid={`toggle-source-${source.id}`} checked={prefs.sourceIds.includes(source.id)} onChange={e => setPrefs(previous => ({ ...previous, sourceIds: e.target.checked ? [...previous.sourceIds, source.id] : previous.sourceIds.filter(id => id !== source.id) }))} />
      </label>)}
      {!sourcesQuery.isLoading && !sourcesQuery.isError && !sources.length && <div className="state-box"><p>No sources are available right now.</p></div>}
      {prefs.feeds.length > 0 && <div className="source-row"><span><span className="source-name">Your RSS / Atom feeds</span><span className="source-desc">{prefs.feeds.length} added in settings</span></span><span className="source-count"><Rss size={14} /></span></div>}
      <div className="footnote">Refresh {prefs.refreshMinutes ? `every ${prefs.refreshMinutes} minutes` : 'manually'} · schedule and feeds are shared across every saved search.</div>
    </aside>
  </>;
}

function ProfilePage() {
  const importMutation = useImportResume();
  const [profile, setProfile] = useState<Profile>(() => load(KEYS.profile, DEFAULT_PROFILE));
  const [skill, setSkill] = useState('');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { save(KEYS.profile, profile); }, [profile]);
  const addSkill = (event: FormEvent) => {
    event.preventDefault();
    const value = skill.trim();
    if (value && !profile.skills.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) setProfile(old => ({ ...old, skills: [...old.skills, value] }));
    setSkill('');
  };
  const importFile = (file?: File) => {
    if (!file) return;
    setImportError('');
    importMutation.mutate({ data: { file } }, {
      onSuccess: (response) => setProfile(old => ({ ...old, cvText: response.extractedText, filename: response.filename })),
      onError: () => setImportError('We could not read that file. Try a text-based PDF or DOCX, or paste your CV text below.'),
    });
  };
  const evidenceFields: [keyof Profile['evidence'], string, string][] = [
    ['experience', 'Experience evidence', 'What have you done that you want a new employer to understand?'],
    ['education', 'Education & credentials', 'Relevant studies, certifications, licences or training.'],
    ['preferences', 'What matters in a role', 'For example: team size, working style, sector, or conditions.'],
  ];
  return <>
    <PageHeader eyebrow="Your working profile" title="Make your strengths visible.">A private reference for your search. Use the imported text to find your own details, then add the skills and evidence you want to compare against jobs.</PageHeader>
    <div className="profile-layout">
      <section className="panel profile-main">
        <h2 className="section-title">CV text</h2>
        <p className="section-copy">Import a document to extract text, or paste it directly. The original file is not retained by the service. Your text stays in this browser.</p>
        <div className="upload-box">
          <div className="upload-icon"><FileText size={19} /></div>
          <div className="upload-copy"><strong>{profile.filename || 'Bring your CV into view'}</strong><span>{profile.filename ? 'Text imported and saved in this browser.' : 'PDF, DOCX or text document'}</span></div>
          <input ref={fileRef} className="file-input" type="file" accept=".pdf,.doc,.docx,.txt" onChange={event => importFile(event.target.files?.[0])} data-testid="input-resume-file" />
          <button className="button secondary small" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending} type="button" data-testid="button-import-resume"><Upload size={14} />{importMutation.isPending ? 'Reading…' : 'Choose file'}</button>
        </div>
        {importMutation.isPending && <div className="panel loading-lines" aria-label="Reading CV"><div className="skeleton" /><div className="skeleton" /></div>}
        {importError && <div className="alert" role="alert" data-testid="status-resume-error">{importError}</div>}
        {importMutation.isError && !importError && <div className="alert" role="alert">Import could not be completed. Try again or paste your text.</div>}
        <div className="field"><label htmlFor="cv-text">Extracted or pasted CV text</label><textarea id="cv-text" className="control" rows={9} value={profile.cvText} placeholder="Paste the parts of your CV you want to keep at hand…" onChange={e => setProfile(old => ({ ...old, cvText: e.target.value }))} data-testid="textarea-cv-text" /></div>
        <div className="profile-count" style={{ marginTop: 8 }} data-testid="text-cv-word-count">{profile.cvText.trim() ? `${profile.cvText.trim().split(/\s+/).length} words · Stored only on this device` : 'No CV text added'}</div>
        <div className="consent"><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Your CV and profile are not sent with a job search. Only the role keywords, location and selected source settings are sent to find listings.</div>
        <div style={{ borderTop: '1px solid #e8e6dd', margin: '23px 0 20px' }} />
        <h2 className="section-title">Skills you want to use</h2>
        <p className="section-copy">These words power a transparent, local comparison on your match cards.</p>
        <form className="skill-edit" onSubmit={addSkill}><input className="control" aria-label="Add a skill" placeholder="Add a skill or keyword" value={skill} onChange={e => setSkill(e.target.value)} data-testid="input-add-skill" /><button className="button secondary" type="submit" disabled={!skill.trim()} data-testid="button-add-skill"><Plus size={15} />Add</button></form>
        <div className="skill-list" data-testid="list-profile-skills">
          {profile.skills.map((item, index) => <span className="skill-chip" key={`${item}-${index}`}>{item}<button className="icon-action" type="button" aria-label={`Remove ${item}`} onClick={() => setProfile(old => ({ ...old, skills: old.skills.filter((_, i) => i !== index) }))} data-testid={`button-remove-skill-${index}`}><X size={13} /></button></span>)}
          {!profile.skills.length && <span className="hint">No skills added yet. Add a few to see what overlaps with a listing.</span>}
        </div>
        <h2 className="section-title" style={{ marginTop: 22 }}>Evidence & preferences</h2>
        <p className="section-copy">Make the experience behind each keyword easy to recall.</p>
        {evidenceFields.map(([field, label, placeholder]) => <div className="evidence-item" key={field}><div className="evidence-label">{label}</div><textarea className="control" aria-label={label} placeholder={placeholder} value={profile.evidence[field]} onChange={e => setProfile(old => ({ ...old, evidence: { ...old.evidence, [field]: e.target.value } }))} data-testid={`textarea-evidence-${field}`} /></div>)}
      </section>
      <aside className="panel profile-side">
        <div className="eyebrow">A note on match signals</div><h2 className="side-panel-title" style={{ marginTop: 11 }}>Overlap is a clue, not a verdict.</h2>
        <p className="section-copy">We compare terms from your skills and evidence with the listing text in this browser. The percentage is deliberately simple and visible—not an automated suitability decision.</p>
        <div className="source-row"><span className="source-name">Your saved profile</span><span className="source-count">LOCAL</span></div>
        <div className="source-row"><span className="source-name">Used for match comparison</span><Check size={15} color="#648675" /></div>
        <div className="source-row"><span className="source-name">Included in API search</span><X size={15} color="#9b6457" /></div>
        <button className="button quiet small" style={{ marginTop: 14 }} onClick={() => { if (window.confirm('Clear your saved CV text, skills and evidence from this browser?')) { setProfile(DEFAULT_PROFILE); } }} data-testid="button-clear-profile"><Trash2 size={13} />Clear profile</button>
      </aside>
    </div>
  </>;
}

function SettingsPage() {
  const sourcesQuery = useListJobSources();
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [feedInput, setFeedInput] = useState('');
  const [feedError, setFeedError] = useState('');
  useEffect(() => { save(KEYS.preferences, prefs); }, [prefs]);
  const addFeed = (event: FormEvent) => {
    event.preventDefault();
    const value = feedInput.trim();
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      if (prefs.feeds.includes(value)) { setFeedError('That feed is already in your list.'); return; }
      if (prefs.feeds.length >= 10) { setFeedError('You can add up to 10 feeds.'); return; }
      setPrefs(old => ({ ...old, feeds: [...old.feeds, value] }));
      setFeedInput(''); setFeedError('');
    } catch { setFeedError('Enter a valid RSS or Atom feed URL starting with https:// or http://.'); }
  };
  const refreshChoices = [{ value: 0, label: 'Manual only' }, { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }, { value: 60, label: '1 hour' }, { value: 240, label: '4 hours' }];
  const sources = (sourcesQuery.data ?? []) as JobSource[];
  return <>
    <PageHeader eyebrow="Your search, your settings" title="Choose where to look.">Select trusted sources, add feeds you already follow, and decide how often this workspace checks for new listings.</PageHeader>
    <section className="panel settings-section">
      <h2>Swedish job sources</h2><p>Choose the sources to include when you search. You can change this any time.</p>
      {sourcesQuery.isLoading && <div className="loading-lines"><div className="skeleton" /><div className="skeleton" /></div>}
      {sourcesQuery.isError && <div className="alert" role="alert">Could not load sources. <button className="job-link" onClick={() => sourcesQuery.refetch()} data-testid="button-retry-settings-sources">Retry</button></div>}
      {sources.map(source => <div className="source-setting" key={source.id}><div><strong>{source.name}</strong><small>{source.description}{source.contentNote ? ` ${source.contentNote}` : ''}</small></div><input className="switch" type="checkbox" aria-label={`Select ${source.name}`} checked={prefs.sourceIds.includes(source.id)} onChange={e => setPrefs(old => ({ ...old, sourceIds: e.target.checked ? [...old.sourceIds, source.id] : old.sourceIds.filter(id => id !== source.id) }))} data-testid={`toggle-settings-source-${source.id}`} /></div>)}
      {!sourcesQuery.isLoading && !sourcesQuery.isError && sources.length === 0 && <div className="state-box"><p>No supported sources were returned.</p></div>}
    </section>

    <section className="panel settings-section">
      <h2>Your RSS & Atom feeds</h2><p>Add feeds from local employers, specialist boards or organisations you trust. Feed addresses are sent only when searching with the custom feed source. Up to 10 feeds.</p>
      <form className="feed-add" onSubmit={addFeed}><input className="control" aria-label="Feed URL" placeholder="https://example.se/jobs/feed.xml" value={feedInput} onChange={e => setFeedInput(e.target.value)} data-testid="input-feed-url" /><button className="button secondary" type="submit" data-testid="button-add-feed"><Plus size={15} />Add feed</button></form>
      {feedError && <div className="alert" role="alert" data-testid="status-feed-error">{feedError}</div>}
      <div style={{ marginTop: 13 }}>
        {prefs.feeds.map((url, index) => <div className="feed-item" key={url}><span><Rss size={13} style={{ verticalAlign: 'middle', marginRight: 8 }} />{url}</span><button className="icon-action" type="button" aria-label={`Remove feed ${url}`} onClick={() => setPrefs(old => ({ ...old, feeds: old.feeds.filter((_, i) => i !== index) }))} data-testid={`button-remove-feed-${index}`}><Trash2 size={14} /></button></div>)}
        {!prefs.feeds.length && <div className="footnote">No custom feeds added yet. Built-in sources work independently.</div>}
      </div>
    </section>

    <section className="panel settings-section">
      <h2>Refresh schedule</h2><p>Automatic refreshes run while this page is open. You can always refresh manually from your matches.</p>
      <div className="radio-row" role="radiogroup" aria-label="Automatic refresh interval">
        {refreshChoices.map(choice => <label className="radio-option" key={choice.value}><input type="radio" name="refresh-interval" value={choice.value} checked={prefs.refreshMinutes === choice.value} onChange={() => setPrefs(old => ({ ...old, refreshMinutes: choice.value, refreshScheduleVersion: 1 }))} data-testid={`radio-refresh-${choice.value}`} /><span>{choice.label}</span></label>)}
      </div>
      <div className="footnote"><Clock3 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Current schedule: {prefs.refreshMinutes ? `every ${prefs.refreshMinutes} minutes while the workspace is open` : 'manual only'}.</div>
    </section>
    <div className="footnote">Settings and feed choices are saved in local storage on this device. No application tracking is included.</div>
  </>;
}

function Router() {
  return <AppShell><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/profile" component={ProfilePage} />
    <Route path="/settings" component={SettingsPage} />
    <Route component={NotFound} />
  </Switch></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

export default App;