import './_group.css';
import { Clock3, Plus, Rss, Trash2 } from 'lucide-react';
import { AppShell, PageHeader, SOURCES } from './_shared';

const refreshChoices = [
  { value: 0, label: 'Manual only' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
];

export function CurrentSettings() {
  return <AppShell active="settings">
    <PageHeader eyebrow="Your search, your settings" title="Choose where to look.">Select trusted sources, add feeds you already follow, and decide how often this workspace checks for new listings.</PageHeader>
    <section className="panel settings-section">
      <h2>Swedish job sources</h2><p>Choose the sources to include when you search. You can change this any time.</p>
      {SOURCES.map(source => <div className="source-setting" key={source.id}>
        <div><strong>{source.name}</strong><small>{source.description} {source.contentNote}</small></div>
        <input className="switch" type="checkbox" aria-label={`Select ${source.name}`} checked={source.id !== 'custom-feed'} readOnly />
      </div>)}
    </section>
    <section className="panel settings-section">
      <h2>Your RSS &amp; Atom feeds</h2><p>Add feeds from local employers, specialist boards or organisations you trust. Feed addresses are sent only when searching with the custom feed source. Up to 10 feeds.</p>
      <form className="feed-add"><input className="control" aria-label="Feed URL" placeholder="https://example.se/jobs/feed.xml" /><button className="button secondary" type="button"><Plus size={15} />Add feed</button></form>
      <div style={{ marginTop: 13 }}>
        <div className="feed-item"><span><Rss size={13} style={{ verticalAlign: 'middle', marginRight: 8 }} />https://www.stockholm.se/ledigajobb/feed.xml</span><button className="icon-action" type="button" aria-label="Remove feed"><Trash2 size={14} /></button></div>
      </div>
    </section>
    <section className="panel settings-section">
      <h2>Refresh schedule</h2><p>Automatic refreshes run while this page is open. You can always refresh manually from your matches.</p>
      <div className="radio-row" role="radiogroup" aria-label="Automatic refresh interval">
        {refreshChoices.map(choice => <label className="radio-option" key={choice.value}><input type="radio" name="refresh-interval" value={choice.value} checked={choice.value === 60} readOnly /><span>{choice.label}</span></label>)}
      </div>
      <div className="footnote"><Clock3 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Current schedule: every 60 minutes while the workspace is open.</div>
    </section>
    <div className="footnote">Settings and feed choices are saved in local storage on this device. No application tracking is included.</div>
  </AppShell>;
}
