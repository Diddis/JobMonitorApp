import './_group.css';
import { Check, FileText, Plus, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { AppShell, PageHeader } from './_shared';

const skills = ['UX design', 'Figma', 'User research', 'Prototyping', 'Accessibility', 'Service design'];
const evidenceFields = [
  ['Experience evidence', 'What have you done that you want a new employer to understand?', 'Led discovery and service-design workshops for a public-sector digital service. Partnered with product and engineering teams to test prototypes with users.'],
  ['Education & credentials', 'Relevant studies, certifications, licences or training.', 'MSc Interaction Design · Umeå Institute of Design'],
  ['What matters in a role', 'For example: team size, working style, sector, or conditions.', 'Collaborative teams, meaningful public services, and a healthy balance of research and delivery.'],
];

export function CurrentProfile() {
  return <AppShell active="profile">
    <PageHeader eyebrow="Your working profile" title="Make your strengths visible.">A private reference for your search. Use the imported text to find your own details, then add the skills and evidence you want to compare against jobs.</PageHeader>
    <div className="profile-layout">
      <section className="panel profile-main">
        <h2 className="section-title">CV text</h2>
        <p className="section-copy">Import a document to extract text, or paste it directly. The original file is not retained by the service. Your text stays in this browser.</p>
        <div className="upload-box">
          <div className="upload-icon"><FileText size={19} /></div>
          <div className="upload-copy"><strong>CV_Anna_Lindqvist.pdf</strong><span>Text imported and saved in this browser.</span></div>
          <input className="file-input" type="file" accept=".pdf,.doc,.docx,.txt" />
          <button className="button secondary small" type="button"><Upload size={14} />Choose file</button>
        </div>
        <div className="field"><label htmlFor="cv-text">Extracted or pasted CV text</label><textarea id="cv-text" className="control" rows={9} defaultValue={'Anna Lindqvist\nSenior UX & Service Designer · Stockholm\n\nCurious, research-led designer with 7 years of experience turning complex needs into clear digital services. Experienced in the full design process, from discovery and user interviews to prototyping, usability testing and delivery with cross-functional teams.\n\nEXPERIENCE\nSenior UX Designer · Form & Funktion Studio · 2021–present\nLed design for public services and B2B platforms. Planned and facilitated research, mapped service journeys and built tested prototypes in Figma. Introduced an accessible component library used by three product teams.\n\nEDUCATION\nMSc Interaction Design · Umeå Institute of Design'} /></div>
        <div className="profile-count" style={{ marginTop: 8 }}>90 words · Stored only on this device</div>
        <div className="consent"><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Your CV and profile are not sent with a job search. Only the role keywords, location and selected source settings are sent to find listings.</div>
        <div style={{ borderTop: '1px solid #e8e6dd', margin: '23px 0 20px' }} />
        <h2 className="section-title">Skills you want to use</h2>
        <p className="section-copy">These words power a transparent, local comparison on your match cards.</p>
        <form className="skill-edit"><input className="control" aria-label="Add a skill" placeholder="Add a skill or keyword" /><button className="button secondary" type="button"><Plus size={15} />Add</button></form>
        <div className="skill-list" data-testid="list-profile-skills">
          {skills.map(skill => <span className="skill-chip" key={skill}>{skill}<button className="icon-action" type="button" aria-label={`Remove ${skill}`}><X size={13} /></button></span>)}
        </div>
        <h2 className="section-title" style={{ marginTop: 22 }}>Evidence & preferences</h2>
        <p className="section-copy">Make the experience behind each keyword easy to recall.</p>
        {evidenceFields.map(([label, placeholder, value]) => <div className="evidence-item" key={label}><div className="evidence-label">{label}</div><textarea className="control" aria-label={label} placeholder={placeholder} defaultValue={value} /></div>)}
      </section>
      <aside className="panel profile-side">
        <div className="eyebrow">A note on match signals</div><h2 className="side-panel-title" style={{ marginTop: 11 }}>Overlap is a clue, not a verdict.</h2>
        <p className="section-copy">We compare terms from your skills and evidence with the listing text in this browser. The percentage is deliberately simple and visible—not an automated suitability decision.</p>
        <div className="source-row"><span className="source-name">Your saved profile</span><span className="source-count">LOCAL</span></div>
        <div className="source-row"><span className="source-name">Used for match comparison</span><Check size={15} color="#648675" /></div>
        <div className="source-row"><span className="source-name">Included in API search</span><X size={15} color="#9b6457" /></div>
        <button className="button quiet small" style={{ marginTop: 14 }} type="button"><Trash2 size={13} />Clear profile</button>
      </aside>
    </div>
  </AppShell>;
}
