import { PageShell } from '../shared/ReferenceShell';
import { Metric, Panel, ScreenHeading, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { reportMetrics, reportPeriod, weeklySnapshot } from './reportData';
import { TrendChart } from './TrendChart';

export function ReferenceReportScreen() {
  function shareReport() {
    if (navigator.share) navigator.share({ title: 'Steply Weekly Report', text: 'Mrs. Kim’s Steply weekly report.' }).catch(() => {});
    else navigator.clipboard?.writeText(window.location.href);
  }

  return (
    <PageShell active="Reports" wide className="ref-report-page">
      <main className="ref-page ref-report">
        <ScreenHeading title="Weekly Report" subtitle="Here’s how you did this week—your progress, safety, and activity overview.">
          <button type="button" className="ref-date-button"><SteplyIcon name="calendarDays" size={18} />{reportPeriod}<SteplyIcon name="chevronDown" size={17} /></button>
        </ScreenHeading>
        <section className="ref-metrics-row">
          {reportMetrics.map((metric) => <Metric key={metric.label} {...metric} />)}
        </section>
        <section className="ref-report-grid">
          <Panel className="ref-trends-panel">
            <div className="ref-panel-heading"><SectionTitle icon="chartTrend">Balance &amp; Strength Trends</SectionTitle><span>4 Weeks</span></div>
            <TrendChart />
            <div className="ref-note"><SteplyIcon name="trendingUp" size={14} />Consistent improvement in strength and balance.</div>
          </Panel>
          <Panel className="ref-adherence-panel">
            <h2>Exercise Adherence</h2>
            <div className="ref-adherence-content">
              <div className="ref-donut"><span><strong>93%</strong>Adherent</span></div>
              <ul><li><i className="green" /><strong>Completed<br />93% <small>(13/14)</small></strong></li><li><i className="amber" /><strong>Missed<br />7% <small>(1/14)</small></strong></li></ul>
            </div>
            <div className="ref-note"><SteplyIcon name="circleCheck" size={14} />Great job staying consistent!</div>
          </Panel>
          <Panel className="ref-quick-panel">
            <SectionTitle icon="zap" tone="amber">Quick Actions</SectionTitle>
            <button type="button" onClick={() => window.print()}><span><SteplyIcon name="download" /></span><b>Download PDF<small>Save or print your report</small></b><i><SteplyIcon name="arrowRight" size={18} /></i></button>
            <button type="button" onClick={shareReport}><span><SteplyIcon name="share" /></span><b>Share with Caregiver<small>Send report securely</small></b><i><SteplyIcon name="arrowRight" size={18} /></i></button>
            <button type="button" onClick={() => goTo('/display/session/plan')}><span><SteplyIcon name="calendarPlus" /></span><b>Schedule Reassessment<small>Plan your next assessment</small></b><i><SteplyIcon name="arrowRight" size={18} /></i></button>
          </Panel>
          <Panel className="ref-improved-panel">
            <SectionTitle icon="trendingUp">What Improved This Week</SectionTitle>
            <div><span><SteplyIcon name="accessibility" /></span><p><b>Chair Stand Reps</b>Increased by 2 reps on average.</p><strong><SteplyIcon name="trendingUp" size={14} />20%</strong></div>
            <div><span><SteplyIcon name="personStanding" /></span><p><b>Tandem Hold</b>Increased by 5 seconds.</p><strong><SteplyIcon name="trendingUp" size={14} />25%</strong></div>
            <div className="ref-note"><SteplyIcon name="heart" size={14} />Keep up the great work—small steps lead to big gains!</div>
          </Panel>
          <Panel className="ref-safety-panel">
            <SectionTitle icon="shieldCheck" tone="amber">Safety Events</SectionTitle>
            <div className="ref-safety-empty"><span><SteplyIcon name="check" size={34} /></span><p><b>No safety events</b> this week.</p></div>
            <div className="ref-note ref-note--amber"><SteplyIcon name="shieldCheck" size={14} />Great job staying safe!</div>
          </Panel>
          <Panel className="ref-snapshot-panel">
            <SectionTitle icon="calendarCheck">Weekly Snapshot</SectionTitle>
            <dl>{weeklySnapshot.map(([icon, label, value]) => <div key={label}><dt><SteplyIcon name={icon} size={14} />{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className="ref-note"><SteplyIcon name="heart" size={14} />You’re building a stronger, more stable you.</div>
          </Panel>
        </section>
      </main>
    </PageShell>
  );
}
