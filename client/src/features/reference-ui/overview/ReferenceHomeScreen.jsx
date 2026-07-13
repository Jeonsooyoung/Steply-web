import { PageShell } from '../shared/ReferenceShell';
import { Metric, Panel, ScreenHeading, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { assessmentSteps, homeMetrics } from './overviewData';

export function ReferenceHomeScreen() {
  return (
    <PageShell active="Home" className="ref-home-page">
      <main className="ref-page ref-home">
        <ScreenHeading title="Good morning, Mrs. Kim" subtitle="Here’s your Steply plan for today. Move at your own pace and keep support nearby." />

        <section className="ref-home-hero">
          <div className="ref-home-hero__copy">
            <span className="ref-home-kicker">TODAY’S FOCUS</span>
            <h2>Build steady balance, one step at a time.</h2>
            <p>Your next assessment takes about 10 minutes. The camera guides your position without saving raw video.</p>
            <div className="ref-home-hero__actions">
              <button type="button" className="primary" onClick={() => goTo('/display/session/plan')}>Start Today’s Assessment<SteplyIcon name="arrowRight" size={17} /></button>
              <button type="button" onClick={() => goTo('/display/reports')}>View Weekly Report</button>
            </div>
          </div>
          <div className="ref-home-hero__visual" aria-hidden="true">
            <span className="ref-home-orbit ref-home-orbit--one" />
            <span className="ref-home-orbit ref-home-orbit--two" />
            <div><strong>93%</strong><small>Weekly adherence</small></div>
          </div>
        </section>

        <section className="ref-home-metrics">
          {homeMetrics.map((metric) => <Metric key={metric.label} {...metric} />)}
        </section>

        <section className="ref-home-grid">
          <Panel className="ref-home-plan">
            <div className="ref-panel-heading"><SectionTitle icon="clipboardList">Today’s Assessment Plan</SectionTitle><span>3 steps</span></div>
            <div className="ref-home-plan__list">
              {assessmentSteps.map((step) => (
                <button type="button" key={step.number} onClick={() => goTo(step.href)}>
                  <span>{step.number}</span><i><SteplyIcon name={step.icon} /></i><p><b>{step.title}</b>{step.description}</p><strong><SteplyIcon name="arrowRight" size={19} /></strong>
                </button>
              ))}
            </div>
          </Panel>
          <aside className="ref-home-aside">
            <Panel><SectionTitle icon="heart">A gentle reminder</SectionTitle><p>Small, consistent sessions are more helpful than pushing too hard. Take a break whenever you need one.</p></Panel>
            <Panel className="ref-home-next"><SectionTitle icon="calendarDays" tone="amber">Next reassessment</SectionTitle><strong>May 26, 2025</strong><p>We’ll compare your balance and strength with this week’s results.</p></Panel>
          </aside>
        </section>
      </main>
    </PageShell>
  );
}
