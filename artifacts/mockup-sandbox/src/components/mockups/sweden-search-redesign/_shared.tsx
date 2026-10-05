import type { ReactNode } from 'react';
import { Search, Settings2, UserRound } from 'lucide-react';

export const SOURCES = [
  {
    id: 'jobsearch',
    name: 'Platsbanken · JobSearch',
    description: 'Search current ads from Sweden’s Public Employment Service.',
    contentNote: 'Fuller job details may include an application deadline.',
  },
  {
    id: 'job-ad-links',
    name: 'JobAd Links',
    description: 'Search references and metadata from a wider group of Swedish job boards.',
    contentNote: 'Descriptions are abbreviated and link to the original posting; deadlines may not be present.',
  },
  {
    id: 'custom-feed',
    name: 'Custom RSS / Atom feeds',
    description: 'Add public RSS or Atom job feeds.',
    contentNote: 'Custom feeds are fetched only when you search. Only public HTTP(S) URLs are accepted.',
  },
];

export function AppShell({ active, children }: { active: 'search' | 'profile' | 'settings'; children: ReactNode }) {
  return <div className="app-frame sweden-current">
    <aside className="sidebar">
      <a href="/" className="brand">
        <span className="brand-mark">n</span>
        <span><span className="brand-name">nordjobb</span><span className="brand-note">your work, in view</span></span>
      </a>
      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        <a href="#" onClick={event => event.preventDefault()} className={`nav-link ${active === 'search' ? 'active' : ''}`}><Search size={17} /> Job matches</a>
        <a href="#" onClick={event => event.preventDefault()} className={`nav-link ${active === 'profile' ? 'active' : ''}`}><UserRound size={17} /> Your profile</a>
        <a href="#" onClick={event => event.preventDefault()} className={`nav-link ${active === 'settings' ? 'active' : ''}`}><Settings2 size={17} /> Search settings</a>
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

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="page-head"><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-intro">{children}</p></div>;
}

