import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyStateCard, MetricCard, SteplyCard } from './SteplyPrimitives';
import { SteplyIcon } from '../features/reference-ui/shared/icons';
import {
  BalancePostureSeries,
  HistoryChallengeTypes,
  buildChallengeTrendSeries,
  latestMetric,
  trendDelta,
} from '../utils/historyTrends';

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toFixed(digits).replace(/\.0+$/, '');
}

function signed(value, suffix = '') {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value >= 0 ? '+' : ''}${rounded}${suffix}`;
}

function ImprovementBadge({ value, suffix = '', lowerIsBetter = false }) {
  const improved = Number.isFinite(value) && value > 0;
  const label = improved ? 'Improved' : lowerIsBetter ? 'Sway easing' : 'Building baseline';
  return (
    <span className={improved ? 'trend-improvement trend-improvement--up' : 'trend-improvement'}>
      {label} {signed(value, suffix)}
    </span>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="history-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value, entry.dataKey === 'swayIndex' ? 2 : 1)}
        </span>
      ))}
    </div>
  );
}

function TrendCard({ title, description, points, children, summary }) {
  return (
    <SteplyCard className="history-trend-card">
      <div className="history-trend-card__header">
        <div>
          <div className="eyebrow">Last 5 Sessions</div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {summary}
      </div>
      {points.length < 2 ? (
        <div className="history-chart-empty">Two or more sessions are needed to draw a trend.</div>
      ) : (
        <div className="history-chart-frame">
          {children}
        </div>
      )}
    </SteplyCard>
  );
}

function ChairStandTrend({ points }) {
  const latestReps = latestMetric(points, 'repetitions');
  const delta = trendDelta(points, 'repetitions');
  return (
    <TrendCard
      title="30-Second Chair Stand Test"
      description="Repeated sit-to-stand counts across the most recent sessions."
      points={points}
      summary={(
        <div className="history-trend-summary">
          <strong>{latestReps ?? '-'}</strong>
          <ImprovementBadge value={delta} suffix=" reps" />
        </div>
      )}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 18, right: 22, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="sessionLabel" tickLine={false} axisLine={false} tick={{ fontSize: 18, fontWeight: 800 }} />
          <YAxis width={48} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 18, fontWeight: 800 }} />
          <Tooltip content={<ChartTooltip />} labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel || ''} />
          <Legend verticalAlign="top" height={28} />
          <Line
            type="monotone"
            dataKey="repetitions"
            name="Reps"
            stroke="var(--primary)"
            strokeWidth={4}
            dot={{ r: 5 }}
            activeDot={{ r: 7 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}

function BalanceTrend({ points }) {
  const latestValues = Object.fromEntries(BalancePostureSeries.map((posture) => [
    posture.metricKey,
    latestMetric(points, posture.metricKey),
  ]));
  const tandemDelta = trendDelta(points, 'tandemSeconds');
  const lineColors = ['#64748b', 'var(--tertiary)', 'var(--primary)', '#0f766e'];
  return (
    <TrendCard
      title="4-Stage Balance Test"
      description="Exact hold seconds for all four postures. The dashed line marks the 10-second target; Tandem is emphasized."
      points={points}
      summary={(
        <div className="history-trend-summary">
          {BalancePostureSeries.map((posture) => (
            <span key={posture.metricKey}>
              {posture.shortLabel}: {latestValues[posture.metricKey] !== null ? `${formatNumber(latestValues[posture.metricKey], 1)}s` : '-'}
            </span>
          ))}
          <ImprovementBadge value={tandemDelta} suffix="s Tandem" />
        </div>
      )}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 18, right: 4, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="sessionLabel" tickLine={false} axisLine={false} tick={{ fontSize: 18, fontWeight: 800 }} />
          <YAxis width={48} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tickLine={false} axisLine={false} tick={{ fontSize: 18, fontWeight: 800 }} unit="s" />
          <Tooltip content={<ChartTooltip />} labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel || ''} />
          <Legend verticalAlign="top" height={28} />
          <ReferenceLine y={10} stroke="#475569" strokeDasharray="7 5" label={{ value: '10s target', position: 'insideTopRight' }} />
          {BalancePostureSeries.map((posture, index) => (
            <Line
              key={posture.metricKey}
              type="monotone"
              dataKey={posture.metricKey}
              name={`${posture.label} seconds`}
              stroke={lineColors[index]}
              strokeWidth={posture.emphasized ? 5 : 2.5}
              dot={{ r: posture.emphasized ? 6 : 4 }}
              activeDot={{ r: posture.emphasized ? 8 : 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </TrendCard>
  );
}

export function HistoryPanel({ historyItems, historySource }) {
  const items = historyItems || [];
  const chairStandPoints = buildChallengeTrendSeries(items, HistoryChallengeTypes.ChairStand);
  const balancePoints = buildChallengeTrendSeries(items, HistoryChallengeTypes.FourStageBalance);
  const latestChairReps = latestMetric(chairStandPoints, 'repetitions');
  const latestBalanceHold = latestMetric(balancePoints, 'tandemSeconds');
  const totalPlotted = chairStandPoints.length + balancePoints.length;

  return (
    <div className="history-panel distance-mode distance-mode--history">
      <div className="metric-row">
        <MetricCard value={totalPlotted || '-'} label="Sessions Charted" detail="Most recent movement records" />
        <MetricCard value={latestChairReps ?? '-'} label="Latest Chair Stands" detail="30-Second Chair Stand Test count" accent />
        <MetricCard value={latestBalanceHold !== null ? `${formatNumber(latestBalanceHold, 1)}s` : '-'} label="Latest Tandem Hold" detail="4-Stage Balance Test" />
      </div>

      <SteplyCard className="trend-card" tone="sand">
        <div className="eyebrow">Progress Tracking</div>
        <h3>{items.length ? 'Your last five sessions are easy to compare' : 'Progress will appear here'}</h3>
        <p>
          {items.length
            ? 'Steply shows movement history supplied by the phone profile so changes are easier to notice over time.'
            : 'When the phone app sends assessment history, this screen will show recent balance and chair-strength trends.'}
        </p>
        {historySource ? (
          <p className="history-source-note">
            Source: {historySource.label || historySource.type}
            {historySource.persistent ? '' : ' - display only'}
          </p>
        ) : null}
      </SteplyCard>

      {items.length === 0 ? (
        <EmptyStateCard title="No movement history yet" message="Complete an assessment in the phone app to begin tracking your last five sessions." />
      ) : (
        <>
          <div className="history-chart-grid">
            <BalanceTrend points={balancePoints} />
            <ChairStandTrend points={chairStandPoints} />
          </div>
          <SteplyCard className="history-achievement-card">
            <div className="history-achievement-card__icon"><SteplyIcon name="award" /></div>
            <div>
              <div className="eyebrow">Achievement</div>
              <h3>Safe Steps Badge</h3>
              <p>Small sessions add up. Keep building steady practice over time.</p>
            </div>
          </SteplyCard>
        </>
      )}
    </div>
  );
}
