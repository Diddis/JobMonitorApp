import './_group.css';
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Clock3, ExternalLink, MapPin,
  Plus, RefreshCw, Rss, Trash2,
} from 'lucide-react';
import { AppShell, PageHeader, SOURCES } from './_shared';

const searches = [
  {
    id: 'search-ux',
    title: 'UX designer · Stockholm',
    jobs: [
      {
        title: 'Senior UX Designer',
        employer: 'Northstar Digital AB',
        location: 'Stockholm',
        employmentType: 'Full-time',
        published: '18 Jun 2025',
        deadline: '12 Jul 2025',
        score: 75,
        description: 'Help shape intuitive digital services for millions of people. You will work closely with product managers, researchers and engineers to make complex services feel simple and human.',
        skills: ['UX design', 'Figma', 'User research', 'Prototyping', 'Design systems', 'Accessibility'],
        requirements: ['Several years of experience in UX or product design', 'Strong Figma and prototyping skills', 'Experience with user research and usability testing', 'Fluent Swedish and English'],
        source: 'Platsbanken · JobSearch · Full description',
      },
      {
        title: 'Product Designer',
        employer: 'Klarna Bank AB',
        location: 'Stockholm · Hybrid',
        employmentType: 'Full-time',
        published: '16 Jun 2025',
        deadline: 'Not stated',
        score: 67,
        description: 'Join a cross-functional team working across the full product journey. Bring a thoughtful, research-led approach to interaction design and collaborate with colleagues across the Nordics.',
        skills: ['Product design', 'Interaction design', 'Figma', 'Design systems', 'Collaboration'],
        requirements: ['Experience designing digital products', 'Portfolio showing interaction and visual design', 'Comfort working in an agile product team'],
        source: 'JobAd Links · Excerpt',
      },
    ],
  },
  {
    id: 'search-service',
    title: 'Service designer · Malmö',
    jobs: [
      {
        title: 'Tjänstedesigner',
        employer: 'Malmö stad',
        location: 'Malmö',
        employmentType: 'Full-time',
        published: '14 Jun 2025',
        deadline: '30 Jun 2025',
        score: 67,
        description: 'Vill du bidra till mer tillgängliga och sammanhängande tjänster för Malmöborna? Tillsammans med verksamheter och invånare utvecklar du lösningar med människors behov i centrum.',
        skills: ['Service design', 'Facilitation', 'Workshopledning', 'User research', 'Public sector'],
        requirements: ['Relevant higher education or equivalent experience', 'Experience leading co-creative processes', 'Ability to communicate complex ideas clearly'],
        source: 'Platsbanken · JobSearch · Full description',
      },
    ],
  },
];

const profileTerms = new Set(['ux design', 'figma', 'user research', 'prototyping', 'design systems', 'accessibility', 'service design', 'facilitation']);

function JobCard({ job, index }: { job: (typeof searches)[number]['jobs'][number]; index: number }) {
  return <article className="panel job-card" style={{ animationDelay: `${Math.min(index * 45, 300)}ms` }}>
    <div className="job-top">
      <div><h3 className="job-title">{job.title}</h3><div className="job-company">{job.employer}</div></div>
      <div className="match-score" title="Compared locally against the requirements provided by the source."><b>{job.score}%</b> requirements</div>
    </div>
    <div className="job-meta">
      <span><MapPin size={13} />{job.location}</span>
      <span><BriefcaseBusiness size={13} />{job.employmentType}</span>
      <span><CalendarDays size={13} />Published {job.published}</span>
      <span><Clock3 size={13} />Deadline: {job.deadline}</span>
    </div>
    <p className="job-description">{job.description}</p>
    <div className="tag-row" aria-label="Skills and keyword comparison">{job.skills.map(skill => <span className={`tag ${profileTerms.has(skill.toLowerCase()) ? 'matched' : ''}`} key={skill}>{skill}</span>)}</div>
    <div className="results-meta" style={{ marginTop: 10 }}>In common: {job.skills.filter(skill => profileTerms.has(skill.toLowerCase())).slice(0, 6).join(', ')} · Browser comparison</div>
    <div className="requirement-breakdown">
      <h4>Requirement check <span>{job.requirements.length - 1} of {job.requirements.length} found</span></h4>
      <div className="requirement-list">
        {job.requirements.map((requirement, i) => {
          const matched = i !== job.requirements.length - 1;
          return <div className={`requirement-item ${matched ? 'matched' : ''}`} key={requirement}>
            <span className="requirement-mark" aria-hidden="true">{matched ? '✓' : '—'}</span>
            <span className="requirement-text">{requirement}{matched && i === 1 && <small>Profile terms: Figma, prototyping</small>}</span>
            <span className="requirement-status">{matched ? 'Found in profile' : 'Not found in profile'}</span>
          </div>;
        })}
      </div>
      <p className="requirement-note">Keyword matches are a clue, not a verdict. Review the original listing for context.</p>
    </div>
    <div className="job-foot"><span className="source-label">{job.source}</span><a className="job-link" href="https://arbetsformedlingen.se/platsbanken/" target="_blank" rel="noreferrer noopener">Original listing <ExternalLink size={13} /></a></div>
  </article>;
}

export function CurrentMatches() {
  return <AppShell active="search">
    <PageHeader eyebrow="Your searches, already at work" title="A little closer to the right role.">Your saved searches gather fresh Swedish opportunities here. Matches stay on this device between visits, and your profile comparisons happen locally.</PageHeader>
    <section className="saved-results" aria-label="Saved search results">
      <div className="results-head results-head-main">
        <div><h2>Your matches</h2><div className="results-meta">2 saved searches · refreshes every 60 min</div></div>
        <button type="button" className="button quiet small"><RefreshCw size={14} />Refresh all</button>
      </div>
      {searches.map((search, searchIndex) => <section className="search-result-group" key={search.id}>
        <div className="saved-search-heading">
          <div><div className="eyebrow">SAVED SEARCH {String(searchIndex + 1).padStart(2, '0')}</div><h3>{search.title}</h3><div className="results-meta">{search.jobs.length} {search.jobs.length === 1 ? 'opportunity' : 'opportunities'} · Last checked 09:42</div></div>
          <div className="saved-search-actions"><button type="button" className="button quiet small"><RefreshCw size={13} />Refresh</button><button type="button" className="icon-action remove-search" aria-label={`Remove search ${search.title}`}><Trash2 size={14} /></button></div>
        </div>
        <div className="results-meta source-summary">Platsbanken · JobSearch: {search.jobs.length} found · JobAd Links: 4 found</div>
        <div className="job-list">{search.jobs.map((job, index) => <JobCard job={job} index={index} key={job.title} />)}</div>
      </section>)}
    </section>
    <section className="panel search-panel add-search-panel">
      <div className="panel-heading"><div><div className="eyebrow">ADD ANOTHER SEARCH</div><h2 className="panel-title">Keep another possibility close.</h2><p className="panel-sub">Each search uses your shared source and feed settings.</p></div><div className="add-search-mark"><Plus size={17} /></div></div>
      <form>
        <div className="field-grid">
          <div className="field"><label htmlFor="search-query">Role or keywords</label><input id="search-query" className="control" maxLength={200} placeholder="e.g. service designer, fysioterapeut" /></div>
          <div className="field"><label htmlFor="search-location">Location</label><input id="search-location" className="control" maxLength={120} placeholder="e.g. Malmö, remote, Västra Götaland" /></div>
        </div>
        <div className="search-actions"><span className="hint">Only these keywords, location, and chosen sources are sent when searching.</span><button className="button" type="button"><Plus size={15} />Save &amp; find matches</button></div>
      </form>
    </section>
    <aside className="panel sidebar-panel home-source-panel">
      <div className="source-panel-head"><div><div className="eyebrow">SHARED ACROSS SEARCHES</div><h2 className="side-panel-title">Sources in your searches</h2></div><a href="#" onClick={event => event.preventDefault()} className="job-link">Manage <ArrowRight size={12} /></a></div>
      {SOURCES.slice(0, 2).map(source => <label className="source-row switch-label" key={source.id}>
        <span><span className="source-name">{source.name}</span><span className="source-desc">{source.description}</span></span>
        <input className="switch" type="checkbox" aria-label={`Include ${source.name}`} checked readOnly />
      </label>)}
      <div className="source-row"><span><span className="source-name">Your RSS / Atom feeds</span><span className="source-desc">1 added in settings</span></span><span className="source-count"><Rss size={14} /></span></div>
      <div className="footnote">Refresh every 60 minutes · schedule and feeds are shared across every saved search.</div>
    </aside>
  </AppShell>;
}
