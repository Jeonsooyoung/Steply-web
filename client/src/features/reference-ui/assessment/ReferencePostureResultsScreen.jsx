import { PageShell } from '../shared/ReferenceShell';
import { CheckList, Metric, Panel, ScreenHeading, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { alignmentRows, postureMetrics, postureObservations } from './assessmentData';

export function ReferencePostureResultsScreen({ dashboard }) {
  return (
    <PageShell active="Assessment" className="ref-posture-page">
      <main className="ref-page ref-posture">
        <ScreenHeading title="Posture Measurement Results" subtitle="Here’s a summary of your posture and stability today." />
        <section className="ref-posture-metrics">{postureMetrics.map((metric) => <Metric key={metric.label} {...metric} />)}</section>
        <section className="ref-posture-grid">
          <Panel className="ref-alignment">
            <SectionTitle>Alignment Analysis</SectionTitle>
            <dl>{alignmentRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value === 'Mild sway' ? 'amber' : ''}>{value}</dd></div>)}</dl>
            <div className="ref-alignment-note"><SteplyIcon name="shieldCheck" size={30} /><span>Overall alignment looks good.<br />Keep up your daily routine!</span></div>
          </Panel>
          <aside className="ref-posture-aside">
            <Panel><SectionTitle icon="eye">What we observed</SectionTitle><CheckList items={postureObservations} /></Panel>
            <Panel>
              <SectionTitle icon="target" tone="amber">Recommended focus areas</SectionTitle>
              <button type="button"><span><SteplyIcon name="accessibility" /></span><b>Knee stability<small>Strengthen your knees for better support.</small></b><i><SteplyIcon name="arrowRight" size={19} /></i></button>
              <button type="button"><span><SteplyIcon name="scale" /></span><b>Dynamic balance<small>Improve weight shifting and control.</small></b><i><SteplyIcon name="arrowRight" size={19} /></i></button>
            </Panel>
          </aside>
        </section>
        <footer className="ref-posture-actions">
          <div className="ref-posture-actions__secondary">
            <button type="button" onClick={() => window.print()}><SteplyIcon name="download" size={18} />Download Report</button>
            <button type="button" onClick={() => goTo('/display/home')}>Back to Dashboard</button>
          </div>
          <button
            type="button"
            className="ref-posture-recommendation"
            onClick={() => goTo('/display/exercises/plan')}
          >
            <span><SteplyIcon name="play" size={19} /></span>
            <b>View Recommended Exercises<small>Your personalized balance plan is ready</small></b>
            <i><SteplyIcon name="arrowRight" size={23} /></i>
          </button>
        </footer>
      </main>
    </PageShell>
  );
}
