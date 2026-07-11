import { HistoryPanel } from './HistoryPanel';
import { MetricCard, SteplyCard } from './SteplyPrimitives';
import {
  HistoryChallengeTypes,
  buildChallengeTrendSeries,
  latestMetric,
  trendDelta,
} from '../utils/historyTrends';

function formatTrend(value, suffix = '') {
  if (!Number.isFinite(value)) return 'Building a baseline';
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value >= 0 ? '+' : ''}${rounded}${suffix}`;
}

export function ProgressPanel({ historyItems = [], historySource }) {
  const balancePoints = buildChallengeTrendSeries(historyItems, HistoryChallengeTypes.FourStageBalance);
  const chairStandPoints = buildChallengeTrendSeries(historyItems, HistoryChallengeTypes.ChairStand);
  const holdDelta = trendDelta(balancePoints, 'holdSeconds');
  const stabilityDelta = trendDelta(balancePoints, 'swayIndex', { lowerIsBetter: true });
  const chairDelta = trendDelta(chairStandPoints, 'repetitions');
  const latestHold = latestMetric(balancePoints, 'holdSeconds');
  const latestReps = latestMetric(chairStandPoints, 'repetitions');

  return (
    <div className="progress-screen distance-mode distance-mode--history">
      <SteplyCard className="progress-hero">
        <div>
          <div className="eyebrow">Progress Tracking</div>
          <h2>Your recent movement story</h2>
          <p>
            Compare balance and chair-strength checks over repeated sessions.
            Keep using the same calm pace and support setup.
          </p>
        </div>
      </SteplyCard>

      <div className="metric-row">
        <MetricCard
          value={latestHold !== null ? `${Number(latestHold).toFixed(1)}s` : '-'}
          label="Latest Hold Time"
          detail={formatTrend(holdDelta, 's from first session')}
          accent
        />
        <MetricCard
          value={Number.isFinite(stabilityDelta) ? formatTrend(stabilityDelta, '') : '-'}
          label="Stability Trend"
          detail="Lower sway is shown as progress"
        />
        <MetricCard
          value={latestReps ?? '-'}
          label="Latest Chair Stands"
          detail={Number.isFinite(chairDelta) ? formatTrend(chairDelta, ' chair stands') : 'Keep building sessions'}
        />
        <MetricCard
          value={`${balancePoints.length + chairStandPoints.length}`}
          label="Movement Checks Logged"
          detail="4-Stage Balance Test and 30-Second Chair Stand Test"
        />
      </div>

      <HistoryPanel historyItems={historyItems} historySource={historySource} />
    </div>
  );
}
