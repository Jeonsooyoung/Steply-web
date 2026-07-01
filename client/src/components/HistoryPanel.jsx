import { EmptyStateCard, MetricCard, SteplyCard, StatusPill } from './SteplyPrimitives';
import { formatDate, roundMetric, statusFromScore } from '../utils/format';

export function HistoryPanel({ historyItems }) {
  const items = historyItems || [];
  const latest = items[0];
  const scores = items.map((item) => Number(item.score)).filter(Number.isFinite);
  const best = scores.length ? Math.max(...scores) : 0;
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;

  return (
    <div className="history-panel">
      <div className="metric-row">
        <MetricCard value={latest ? roundMetric(latest.score) : '-'} label="Latest" detail={latest ? formatDate(latest.receivedAt || latest.createdAt) : 'No result yet'} />
        <MetricCard value={best || '-'} label="Best" detail="Highest saved score" accent />
        <MetricCard value={average || '-'} label="Average" detail="Saved sessions" />
      </div>

      <SteplyCard className="trend-card" tone="sand">
        <div className="eyebrow">Friendly Trend</div>
        <h3>{items.length ? 'Keep building steady habits' : 'History will appear here'}</h3>
        <p>{items.length ? 'Reviewing movement over time helps make practice feel safer and more encouraging.' : 'Save a final result to start a local progress history.'}</p>
      </SteplyCard>

      {items.length === 0 ? (
        <EmptyStateCard title="No saved results yet" message="Complete a movement check and save the final result to see progress cards here." />
      ) : (
        <div className="history-list">
          {items.slice(0, 8).map((item) => {
            const score = roundMetric(item.score);
            const status = statusFromScore(score);
            return (
              <SteplyCard className="history-item" key={item.id || `${item.sessionId}-${item.receivedAt}`}>
                <div>
                  <div className="eyebrow">{formatDate(item.receivedAt || item.createdAt)}</div>
                  <h3>{item.selectedTest || item.testType || 'Movement Check'}</h3>
                  <p>{item.message || 'Saved movement result from Steply dashboard.'}</p>
                </div>
                <div className="history-item__score">
                  <strong>{score}</strong>
                  <StatusPill status={status} />
                </div>
              </SteplyCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
