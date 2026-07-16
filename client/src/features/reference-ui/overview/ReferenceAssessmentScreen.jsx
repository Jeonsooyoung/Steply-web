import { PageShell } from '../shared/ReferenceShell';
import { CheckList, Panel, ScreenHeading, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { assessmentSafetyItems, assessmentSteps } from './overviewData';

export function ReferenceAssessmentScreen() {
  return (
    <PageShell active="Assessment" className="ref-assessment-page">
      <main className="ref-page ref-assessment">
        <ScreenHeading title="Assessment Center" subtitle="Connect your camera, complete the guided balance and chair stand tests, and review your latest results." />

        <section className="ref-assessment-banner">
          <div><span>READY FOR TODAY</span><h2>Your assessment is ready.</h2><p>Choose a step below. You can pause at any time and continue when you feel comfortable.</p></div>
          <button type="button" onClick={() => goTo('/display/connect')}>Begin Camera Setup<SteplyIcon name="arrowRight" size={17} /></button>
        </section>

        <div className="ref-assessment-layout">
          <section className="ref-assessment-steps">
            {assessmentSteps.map((step) => (
              <Panel className="ref-assessment-step" key={step.number}>
                <div className="ref-assessment-step__number">{step.number}</div>
                <div className="ref-assessment-step__icon"><SteplyIcon name={step.icon} size={25} /></div>
                <div><span>{step.category}</span><h2>{step.title}</h2><p>{step.description}</p></div>
                <button type="button" onClick={() => goTo(step.href)}>{step.action}<SteplyIcon name="arrowRight" size={16} /></button>
              </Panel>
            ))}
          </section>
          <aside className="ref-assessment-aside">
            <Panel className="ref-assessment-safety"><SectionTitle icon="shieldCheck">Before you begin</SectionTitle><CheckList items={assessmentSafetyItems} /></Panel>
            <Panel className="ref-assessment-status"><SectionTitle icon="camera">Camera status</SectionTitle><div><i />Ready to connect</div><p>Your camera stream stays in the current session and raw video is not saved.</p></Panel>
          </aside>
        </div>
      </main>
    </PageShell>
  );
}
