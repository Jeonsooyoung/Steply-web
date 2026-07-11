import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricCard, SteplyButton, SteplyCard, StatusPill } from './SteplyPrimitives';
import { weeklyReport } from '../data/serviceModels';

function ReportTrendChart({ detailed = false }) {
  return (
    <div className="report-chart-frame">
      <ResponsiveContainer width="100%" height={detailed ? 340 : 300}>
        <LineChart data={weeklyReport.trend} margin={{ top: 20, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="session" tickLine={false} axisLine={false} tick={{ fontSize: 16, fontWeight: 700 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 16, fontWeight: 700 }} />
          <Tooltip />
          <Legend verticalAlign="top" height={30} />
          <Line
            type="monotone"
            dataKey="holdSeconds"
            name="Hold time"
            stroke="var(--primary)"
            strokeWidth={4}
            dot={{ r: 5 }}
            activeDot={{ r: 7 }}
          />
          <Line
            type="monotone"
            dataKey="stability"
            name="Stability"
            stroke="var(--secondary)"
            strokeWidth={detailed ? 4 : 3}
            dot={{ r: 4 }}
          />
          {detailed ? (
            <Line
              type="monotone"
              dataKey="adherence"
              name="Adherence"
              stroke="var(--tertiary)"
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FamilyReport() {
  return (
    <div className="report-screen">
      <SteplyCard className="report-hero">
        <div>
          <div className="eyebrow">Weekly Family Report</div>
          <h2>{weeklyReport.personName}</h2>
          <p>{weeklyReport.weekLabel}</p>
        </div>
        <StatusPill status="practice_needed">Weekly trend</StatusPill>
      </SteplyCard>

      <div className="metric-row">
        <MetricCard value="This week" label="Overall Status" detail={weeklyReport.overallStatus} accent />
        <MetricCard value="-1.8s" label="Change From Last Week" detail={weeklyReport.changeFromLastWeek} />
        <MetricCard value="58%" label="Exercise Adherence" detail="Completed planned movement sessions" />
      </div>

      <div className="report-grid">
        <SteplyCard className="report-insight-card">
          <div className="eyebrow">Family Insight</div>
          <h3>What changed this week</h3>
          <p>{weeklyReport.familyAction}</p>
        </SteplyCard>

        <SteplyCard className="report-insight-card">
          <div className="eyebrow">Functional Finding</div>
          <h3>{weeklyReport.functionalFinding}</h3>
          <p>
            This is a screening trend from repeated home movement checks. It is not a diagnosis.
          </p>
        </SteplyCard>
      </div>

      <SteplyCard className="report-chart-card">
        <div className="card-heading-row">
          <div>
            <div className="eyebrow">Last 5 Sessions</div>
            <h3>Movement trend at a glance</h3>
          </div>
          <StatusPill status="practice_needed">Review if trend continues</StatusPill>
        </div>
        <ReportTrendChart />
      </SteplyCard>
    </div>
  );
}

function ProfessionalReport() {
  return (
    <div className="report-screen report-screen--professional">
      <SteplyCard className="report-hero">
        <div>
          <div className="eyebrow">Professional Report</div>
          <h2>{weeklyReport.personName}</h2>
          <p>Screening trends, exercise adherence, and program-adjustment notes for rehabilitation review.</p>
        </div>
        <StatusPill status="recheck">Needs Review</StatusPill>
      </SteplyCard>

      <div className="metric-row">
        <MetricCard value="Needs Review" label="Risk Classification" detail="Based on repeated screening signals" status="recheck" />
        <MetricCard value={weeklyReport.functionalFinding} label="Functional Finding Trend" detail="Repeated side-to-side movement pattern" accent />
        <MetricCard value="58%" label="Adherence" detail="Exercise sessions completed this week" />
        <MetricCard
          value={weeklyReport.professionalReviewSuggested ? 'Yes' : 'Monitor'}
          label="Professional Review"
          detail={weeklyReport.trendWarning}
          status={weeklyReport.professionalReviewSuggested ? 'recheck' : 'practice_needed'}
        />
      </div>

      <div className="professional-grid">
        <SteplyCard className="report-chart-card">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Repeated Measurement History</div>
              <h3>Last 5 session trend</h3>
            </div>
          </div>
          <ReportTrendChart detailed />
        </SteplyCard>

        <SteplyCard className="program-adjustment-card">
          <div className="eyebrow">Exercise Program Guidance</div>
          <h3>Adjustment notes</h3>
          <div className="program-adjustment-list">
            {weeklyReport.failedCriteria.map((criterion) => <span key={criterion}>{criterion}</span>)}
            <span>{weeklyReport.recommendedNextAction}</span>
          </div>
          <p>{weeklyReport.professionalNote}</p>
        </SteplyCard>
      </div>

      <SteplyCard className="measurement-table-card">
        <div className="eyebrow">Measurement Log</div>
        <h3>Screening results over time</h3>
        <div className="measurement-table" role="table" aria-label="Measurement history">
          {weeklyReport.measurementHistory.map((entry) => (
            <div key={`${entry.date}-${entry.test}`} role="row">
              <span>{entry.date}</span>
              <strong>{entry.test}</strong>
              <span>{entry.result}</span>
              <StatusPill status={entry.category === 'Needs Review' ? 'recheck' : 'practice_needed'}>
                {entry.category}
              </StatusPill>
            </div>
          ))}
        </div>
      </SteplyCard>
    </div>
  );
}

export function ReportsPanel({ initialMode = 'family' }) {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  return (
    <div className="reports-shell">
      <div className="report-mode-tabs" role="tablist" aria-label="Report type">
        <SteplyButton
          variant={mode === 'family' ? 'primary' : 'secondary'}
          onClick={() => setMode('family')}
        >
          Family Report
        </SteplyButton>
        <SteplyButton
          variant={mode === 'professional' ? 'primary' : 'secondary'}
          onClick={() => setMode('professional')}
        >
          Professional Report
        </SteplyButton>
      </div>
      {mode === 'professional' ? <ProfessionalReport /> : <FamilyReport />}
    </div>
  );
}
